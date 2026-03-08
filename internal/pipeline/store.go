package pipeline

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sync"

	"ctopia/internal/config"
	"ctopia/internal/models"
)

// Store manages pipeline definitions from both config (read-only) and runtime (persisted to JSON).
type Store struct {
	cfg     *config.Config
	path    string
	runtime []models.Pipeline
	mu      sync.RWMutex
}

func NewStore(cfg *config.Config) (*Store, error) {
	s := &Store{
		cfg:  cfg,
		path: filepath.Join(cfg.DataDir, "pipelines.json"),
	}
	if err := s.load(); err != nil {
		return nil, err
	}
	return s, nil
}

// List returns all pipelines: config ones (source="config") first, then runtime ones (source="runtime").
func (s *Store) List() []models.Pipeline {
	s.mu.RLock()
	defer s.mu.RUnlock()

	result := make([]models.Pipeline, 0, len(s.cfg.Pipelines)+len(s.runtime))
	for _, pc := range s.cfg.Pipelines {
		result = append(result, configPipelineToModel(pc))
	}
	result = append(result, s.runtime...)
	return result
}

// Get returns a pipeline by name, searching both config and runtime.
func (s *Store) Get(name string) (models.Pipeline, bool) {
	for _, p := range s.List() {
		if p.Name == name {
			return p, true
		}
	}
	return models.Pipeline{}, false
}

// Create adds a new runtime pipeline.
func (s *Store) Create(p models.Pipeline) error {
	if err := validatePipeline(p); err != nil {
		return err
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	for _, existing := range s.cfg.Pipelines {
		if existing.Name == p.Name {
			return fmt.Errorf("pipeline %q already exists in config", p.Name)
		}
	}
	for _, existing := range s.runtime {
		if existing.Name == p.Name {
			return fmt.Errorf("pipeline %q already exists", p.Name)
		}
	}

	p.Source = "runtime"
	s.runtime = append(s.runtime, p)
	return s.save()
}

// validatePipeline checks that a pipeline definition is valid before persisting it.
func validatePipeline(p models.Pipeline) error {
	if p.Name == "" {
		return fmt.Errorf("pipeline name is required")
	}
	validActions := map[string]bool{"start": true, "stop": true, "restart": true}
	for i, step := range p.Steps {
		if !validActions[step.Action] {
			return fmt.Errorf("step %d: invalid action %q (must be start, stop, or restart)", i+1, step.Action)
		}
		if len(step.Composes) == 0 {
			return fmt.Errorf("step %d: at least one compose is required", i+1)
		}
	}
	return nil
}

// Update replaces an existing runtime pipeline by name.
func (s *Store) Update(name string, p models.Pipeline) error {
	if err := validatePipeline(p); err != nil {
		return err
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	for i, existing := range s.runtime {
		if existing.Name == name {
			p.Source = "runtime"
			s.runtime[i] = p
			return s.save()
		}
	}
	return fmt.Errorf("pipeline %q not found or is read-only (config)", name)
}

// Delete removes a runtime pipeline by name.
func (s *Store) Delete(name string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	for i, p := range s.runtime {
		if p.Name == name {
			s.runtime = append(s.runtime[:i], s.runtime[i+1:]...)
			return s.save()
		}
	}
	return fmt.Errorf("pipeline %q not found or is read-only (config)", name)
}

func (s *Store) load() error {
	data, err := os.ReadFile(s.path)
	if err != nil {
		if os.IsNotExist(err) {
			s.runtime = []models.Pipeline{}
			return nil
		}
		return fmt.Errorf("reading pipelines: %w", err)
	}
	if err := json.Unmarshal(data, &s.runtime); err != nil {
		return fmt.Errorf("parsing pipelines: %w", err)
	}
	for i := range s.runtime {
		s.runtime[i].Source = "runtime"
	}
	return nil
}

func (s *Store) save() error {
	data, err := json.MarshalIndent(s.runtime, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(s.path, data, 0600)
}

// configPipelineToModel converts a config.PipelineConfig to a models.Pipeline.
func configPipelineToModel(pc config.PipelineConfig) models.Pipeline {
	steps := make([]models.PipelineStep, 0, len(pc.Steps))
	for _, sc := range pc.Steps {
		steps = append(steps, models.PipelineStep{
			Name:         sc.Name,
			Action:       sc.Action,
			Composes:     sc.Composes,
			Wait:         models.WaitMode(sc.Wait),
			DelaySeconds: sc.DelaySeconds,
		})
	}
	return models.Pipeline{
		Name:            pc.Name,
		Source:          "config",
		ContinueOnError: pc.ContinueOnError,
		Steps:           steps,
	}
}
