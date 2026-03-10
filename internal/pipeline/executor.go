package pipeline

import (
	"context"
	"encoding/json"
	"fmt"
	"sync"
	"time"

	"ctopia/internal/docker"
	"ctopia/internal/models"
)

// Executor runs pipelines and broadcasts live progress via WebSocket.
type Executor struct {
	docker    *docker.Manager
	broadcast func([]byte)
	pushState func()

	mu        sync.RWMutex
	activeRun *models.PipelineRunProgress
}

func NewExecutor(d *docker.Manager, broadcast func([]byte), pushState func()) *Executor {
	return &Executor{docker: d, broadcast: broadcast, pushState: pushState}
}

// GetActiveRun returns the current pipeline run progress (nil if none running).
func (e *Executor) GetActiveRun() *models.PipelineRunProgress {
	e.mu.RLock()
	defer e.mu.RUnlock()
	if e.activeRun == nil {
		return nil
	}
	cp := *e.activeRun
	return &cp
}

// Run executes a pipeline sequentially, composes within each step run in parallel.
// It should be called in a goroutine — it runs until the pipeline finishes.
func (e *Executor) Run(ctx context.Context, p models.Pipeline, removeVolumes bool) {
	progress := models.PipelineRunProgress{
		PipelineName: p.Name,
		Status:       "running",
		StartedAt:    time.Now().Unix(),
		Steps:        make([]models.PipelineStepResult, len(p.Steps)),
	}

	for i, step := range p.Steps {
		composeResults := make([]models.ComposeActionResult, len(step.Composes))
		for j, name := range step.Composes {
			composeResults[j] = models.ComposeActionResult{Name: name, Status: "pending"}
		}
		progress.Steps[i] = models.PipelineStepResult{
			Index:          i,
			Name:           step.Name,
			Status:         "pending",
			ComposeResults: composeResults,
		}
	}

	e.emit(progress)

	for i, step := range p.Steps {
		progress.Steps[i].Status = "running"
		e.emit(progress)

		var wg sync.WaitGroup
		var mu sync.Mutex
		stepFailed := false

		for j, composeName := range step.Composes {
			wg.Add(1)
			go func(j int, name string) {
				defer wg.Done()

				// Mark this compose as running before starting the action
				mu.Lock()
				progress.Steps[i].ComposeResults[j] = models.ComposeActionResult{Name: name, Status: "running"}
				e.emit(progress)
				mu.Unlock()

				actionCtx, cancel := context.WithTimeout(ctx, 2*time.Minute)
				defer cancel()

				err := e.docker.ComposeAction(actionCtx, name, step.Action, removeVolumes)

				mu.Lock()
				defer mu.Unlock()
				if err != nil {
					progress.Steps[i].ComposeResults[j] = models.ComposeActionResult{
						Name:   name,
						Status: "failed",
						Error:  err.Error(),
					}
					stepFailed = true
				} else {
					progress.Steps[i].ComposeResults[j] = models.ComposeActionResult{
						Name:   name,
						Status: "done",
					}
				}
				e.emit(progress)
			}(j, composeName)
		}

		wg.Wait()

		if stepFailed {
			progress.Steps[i].Status = "failed"
			progress.Steps[i].Error = "one or more compose actions failed"
			e.emit(progress)

			if !p.ContinueOnError {
				progress.Status = "failed"
				progress.FinishedAt = time.Now().Unix()
				e.emit(progress)
				go e.pushState()
				return
			}
		} else {
			progress.Steps[i].Status = "done"
			e.emit(progress)
		}

		// Apply wait mode between steps (not after the last step)
		if i < len(p.Steps)-1 {
			switch step.Wait {
			case models.WaitDelay:
				if step.DelaySeconds > 0 {
					select {
					case <-ctx.Done():
						progress.Status = "failed"
						progress.FinishedAt = time.Now().Unix()
						e.emit(progress)
						return
					case <-time.After(time.Duration(step.DelaySeconds) * time.Second):
					}
				}
			case models.WaitImmediately:
				// move immediately to next step
			default: // WaitServicesRunning or empty (default)
				var waitErr error
				if step.Action == "stop" {
					// After stopping, wait for services to be fully down
					waitErr = e.waitServicesStopped(ctx, step.Composes)
				} else {
					waitErr = e.waitServicesRunning(ctx, step.Composes)
				}
				if waitErr != nil {
					if !p.ContinueOnError {
						progress.Steps[i].Error = waitErr.Error()
						progress.Status = "failed"
						progress.FinishedAt = time.Now().Unix()
						e.emit(progress)
						go e.pushState()
						return
					}
				}
			}
		}
	}

	progress.Status = "done"
	progress.FinishedAt = time.Now().Unix()
	e.emit(progress)
	go e.pushState()
}

// waitServicesRunning polls compose stacks every 2s until all named stacks are "running",
// with a 5-minute timeout.
func (e *Executor) waitServicesRunning(ctx context.Context, composes []string) error {
	deadline := time.Now().Add(5 * time.Minute)

	for time.Now().Before(deadline) {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(2 * time.Second):
		}

		stacks, err := e.docker.GetComposeStacks(ctx)
		if err != nil {
			continue
		}

		stackByName := make(map[string]models.ComposeStack, len(stacks))
		for _, s := range stacks {
			stackByName[s.Name] = s
		}

		allRunning := true
		for _, name := range composes {
			s, ok := stackByName[name]
			if !ok || s.Status != "running" {
				allRunning = false
				break
			}
		}

		if allRunning {
			return nil
		}
	}

	return fmt.Errorf("timeout: services did not reach running state within 5 minutes")
}

// waitServicesStopped polls compose stacks every 2s until all named stacks have no
// running services, with a 2-minute timeout.
func (e *Executor) waitServicesStopped(ctx context.Context, composes []string) error {
	deadline := time.Now().Add(2 * time.Minute)

	for time.Now().Before(deadline) {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(2 * time.Second):
		}

		stacks, err := e.docker.GetComposeStacks(ctx)
		if err != nil {
			continue
		}

		stackByName := make(map[string]models.ComposeStack, len(stacks))
		for _, s := range stacks {
			stackByName[s.Name] = s
		}

		allStopped := true
		for _, name := range composes {
			s, ok := stackByName[name]
			if ok && s.Status == "running" {
				allStopped = false
				break
			}
		}

		if allStopped {
			return nil
		}
	}

	return fmt.Errorf("timeout: services did not stop within 2 minutes")
}

func (e *Executor) emit(progress models.PipelineRunProgress) {
	// Store the latest run for reconnecting clients
	e.mu.Lock()
	cp := progress
	e.activeRun = &cp
	e.mu.Unlock()

	msg := struct {
		Type        string                     `json:"type"`
		PipelineRun models.PipelineRunProgress `json:"pipeline_run"`
		Timestamp   int64                      `json:"timestamp"`
	}{
		Type:        "pipeline_progress",
		PipelineRun: progress,
		Timestamp:   time.Now().Unix(),
	}
	data, err := json.Marshal(msg)
	if err != nil {
		return
	}
	e.broadcast(data)
}
