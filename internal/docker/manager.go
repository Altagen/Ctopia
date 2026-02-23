package docker

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"math"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"

	"github.com/docker/docker/api/types/container"
	"github.com/docker/docker/api/types/filters"
	"github.com/docker/docker/api/types/image"
	"github.com/docker/docker/client"
	"gopkg.in/yaml.v3"

	"ctopia/internal/config"
	"ctopia/internal/models"
)

type Manager struct {
	cli         *client.Client
	cfg         *config.Config
	composeCmds []string
}

type containerStats struct {
	id     string
	cpu    float64
	mem    uint64
	memLim uint64
}

func NewManager(cfg *config.Config) (*Manager, error) {
	cli, err := client.NewClientWithOpts(
		client.WithHost("unix://"+cfg.Socket),
		client.WithAPIVersionNegotiation(),
	)
	if err != nil {
		return nil, fmt.Errorf("creating docker client: %w", err)
	}

	ctx := context.Background()
	if _, err := cli.Ping(ctx); err != nil {
		return nil, fmt.Errorf("connecting to docker socket %s: %w", cfg.Socket, err)
	}

	return &Manager{
		cli:         cli,
		cfg:         cfg,
		composeCmds: detectComposeBinary(),
	}, nil
}

func (m *Manager) Close() {
	m.cli.Close()
}

// --- Containers ---

func (m *Manager) GetContainers(ctx context.Context) ([]models.Container, error) {
	list, err := m.cli.ContainerList(ctx, container.ListOptions{All: true})
	if err != nil {
		return nil, err
	}

	statsChan := make(chan containerStats, len(list))
	var wg sync.WaitGroup

	for _, c := range list {
		wg.Add(1)
		go func(id string, running bool) {
			defer wg.Done()
			if !running {
				statsChan <- containerStats{id: id}
				return
			}
			cpu, mem, lim := m.fetchStats(ctx, id)
			statsChan <- containerStats{id: id, cpu: cpu, mem: mem, memLim: lim}
		}(c.ID, c.State == "running")
	}

	go func() {
		wg.Wait()
		close(statsChan)
	}()

	statsMap := make(map[string]containerStats)
	for s := range statsChan {
		statsMap[s.id] = s
	}

	result := make([]models.Container, 0, len(list))
	for _, c := range list {
		name := "unknown"
		if len(c.Names) > 0 {
			name = strings.TrimPrefix(c.Names[0], "/")
		}

		ports := make([]models.Port, 0, len(c.Ports))
		for _, p := range c.Ports {
			ports = append(ports, models.Port{
				IP:        p.IP,
				Host:      int(p.PublicPort),
				Container: int(p.PrivatePort),
				Protocol:  p.Type,
			})
		}

		s := statsMap[c.ID]
		result = append(result, models.Container{
			ID:          c.ID[:12],
			FullID:      c.ID,
			Name:        name,
			Image:       c.Image,
			Status:      c.Status,
			State:       c.State,
			CPU:         s.cpu,
			Memory:      s.mem,
			MemoryLimit: s.memLim,
			Ports:       ports,
			Created:     c.Created,
			Compose:     c.Labels["com.docker.compose.project"],
		})
	}

	return result, nil
}

func (m *Manager) ContainerAction(ctx context.Context, id, action string) error {
	// Resolve short ID to full ID
	fullID, err := m.resolveID(ctx, id)
	if err != nil {
		return err
	}

	switch action {
	case "start":
		return m.cli.ContainerStart(ctx, fullID, container.StartOptions{})
	case "stop":
		timeout := 10
		return m.cli.ContainerStop(ctx, fullID, container.StopOptions{Timeout: &timeout})
	case "restart":
		timeout := 10
		return m.cli.ContainerRestart(ctx, fullID, container.StopOptions{Timeout: &timeout})
	case "delete":
		return m.cli.ContainerRemove(ctx, fullID, container.RemoveOptions{Force: true})
	default:
		return fmt.Errorf("unknown action: %s", action)
	}
}

func (m *Manager) resolveID(ctx context.Context, shortID string) (string, error) {
	f := filters.NewArgs(filters.Arg("id", shortID))
	list, err := m.cli.ContainerList(ctx, container.ListOptions{All: true, Filters: f})
	if err != nil {
		return "", err
	}
	if len(list) == 0 {
		return "", fmt.Errorf("container not found: %s", shortID)
	}
	return list[0].ID, nil
}

// --- Stats ---

func (m *Manager) fetchStats(ctx context.Context, id string) (cpu float64, mem, memLim uint64) {
	resp, err := m.cli.ContainerStats(ctx, id, false)
	if err != nil {
		return
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return
	}

	var stats container.StatsResponse
	if err := json.Unmarshal(body, &stats); err != nil {
		return
	}

	cpu = calcCPUPercent(&stats)
	mem, memLim = calcMemory(&stats)
	return
}

func calcCPUPercent(stats *container.StatsResponse) float64 {
	cpuDelta := float64(stats.CPUStats.CPUUsage.TotalUsage) -
		float64(stats.PreCPUStats.CPUUsage.TotalUsage)
	sysDelta := float64(stats.CPUStats.SystemUsage) -
		float64(stats.PreCPUStats.SystemUsage)

	numCPU := float64(stats.CPUStats.OnlineCPUs)
	if numCPU == 0 {
		numCPU = float64(len(stats.CPUStats.CPUUsage.PercpuUsage))
	}
	if sysDelta > 0 && cpuDelta > 0 {
		v := (cpuDelta / sysDelta) * numCPU * 100.0
		return math.Round(v*100) / 100
	}
	return 0
}

func calcMemory(stats *container.StatsResponse) (used, limit uint64) {
	// Subtract page cache on Linux
	cache := stats.MemoryStats.Stats["cache"]
	if stats.MemoryStats.Usage > cache {
		used = stats.MemoryStats.Usage - cache
	}
	limit = stats.MemoryStats.Limit
	return
}

// --- Composes ---

type composeFile struct {
	Name     string                    `yaml:"name"`
	Services map[string]map[string]any `yaml:"services"`
}

func (m *Manager) GetComposeStacks(ctx context.Context) ([]models.ComposeStack, error) {
	allContainers, err := m.cli.ContainerList(ctx, container.ListOptions{All: true})
	if err != nil {
		return nil, err
	}

	// Group Docker containers by compose project label
	byProject := make(map[string][]container.Summary)
	for _, c := range allContainers {
		if proj := c.Labels["com.docker.compose.project"]; proj != "" {
			byProject[proj] = append(byProject[proj], c)
		}
	}

	stacks := make([]models.ComposeStack, 0, len(m.cfg.Composes))
	for _, cc := range m.cfg.Composes {
		stack := m.buildStack(cc, byProject)
		stacks = append(stacks, stack)
	}
	return stacks, nil
}

func (m *Manager) buildStack(cc config.ComposeConfig, byProject map[string][]container.Summary) models.ComposeStack {
	projectName := m.resolveProjectName(cc.Path)
	serviceNames := m.parseServiceNames(cc.Path)
	dockerContainers := byProject[projectName]

	containerByService := make(map[string]container.Summary)
	for _, c := range dockerContainers {
		if svc := c.Labels["com.docker.compose.service"]; svc != "" {
			containerByService[svc] = c
		}
	}

	running := 0
	services := make([]models.ComposeService, 0, len(serviceNames))
	for _, svcName := range serviceNames {
		svc := models.ComposeService{Name: svcName, Status: "not created", State: "stopped"}
		if c, ok := containerByService[svcName]; ok {
			svc.ContainerID = c.ID[:12]
			svc.Status = c.Status
			svc.State = c.State
			svc.Running = c.State == "running"
			if svc.Running {
				running++
			}
		}
		services = append(services, svc)
	}

	status := "stopped"
	if running > 0 && running == len(serviceNames) {
		status = "running"
	} else if running > 0 {
		status = "partial"
	}

	return models.ComposeStack{
		Name:     cc.Name,
		Path:     cc.Path,
		Status:   status,
		Services: services,
	}
}

func (m *Manager) resolveProjectName(path string) string {
	cf := m.readComposeFile(path)
	if cf != nil && cf.Name != "" {
		return cf.Name
	}
	return filepath.Base(path)
}

func (m *Manager) parseServiceNames(path string) []string {
	cf := m.readComposeFile(path)
	if cf == nil {
		return nil
	}
	names := make([]string, 0, len(cf.Services))
	for name := range cf.Services {
		names = append(names, name)
	}
	return names
}

func (m *Manager) readComposeFile(dir string) *composeFile {
	candidates := []string{
		filepath.Join(dir, "docker-compose.yml"),
		filepath.Join(dir, "docker-compose.yaml"),
		filepath.Join(dir, "compose.yml"),
		filepath.Join(dir, "compose.yaml"),
	}
	for _, p := range candidates {
		data, err := os.ReadFile(p)
		if err != nil {
			continue
		}
		var cf composeFile
		if err := yaml.Unmarshal(data, &cf); err == nil {
			return &cf
		}
	}
	return nil
}

func (m *Manager) ComposeAction(ctx context.Context, name, action string, removeVolumes bool) error {
	var cc *config.ComposeConfig
	for i, c := range m.cfg.Composes {
		if c.Name == name {
			cc = &m.cfg.Composes[i]
			break
		}
	}
	if cc == nil {
		return fmt.Errorf("compose stack not found: %s", name)
	}

	var args []string
	switch action {
	case "start":
		args = append(m.composeCmds[1:], "up", "-d")
	case "stop":
		args = append(m.composeCmds[1:], "down")
		if removeVolumes {
			args = append(args, "-v")
		}
	case "restart":
		args = append(m.composeCmds[1:], "restart")
	default:
		return fmt.Errorf("unknown compose action: %s", action)
	}

	cmd := exec.CommandContext(ctx, m.composeCmds[0], args...)
	cmd.Dir = cc.Path
	out, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("compose %s: %s", action, string(out))
	}
	return nil
}

// --- Images ---

func (m *Manager) GetImages(ctx context.Context) ([]models.Image, error) {
	// Collect image IDs used by existing containers
	containers, err := m.cli.ContainerList(ctx, container.ListOptions{All: true})
	if err != nil {
		return nil, err
	}
	usedImages := make(map[string]bool, len(containers))
	for _, c := range containers {
		usedImages[c.ImageID] = true
	}

	imgs, err := m.cli.ImageList(ctx, image.ListOptions{})
	if err != nil {
		return nil, err
	}

	result := make([]models.Image, 0, len(imgs))
	for _, img := range imgs {
		id := img.ID
		shortID := id
		if strings.HasPrefix(id, "sha256:") && len(id) >= 19 {
			shortID = id[7:19]
		}
		tags := img.RepoTags
		if tags == nil {
			tags = []string{}
		}
		result = append(result, models.Image{
			ID:      id,
			ShortID: shortID,
			Tags:    tags,
			Size:    img.Size,
			Created: img.Created,
			InUse:   usedImages[id],
		})
	}
	return result, nil
}

func (m *Manager) RemoveImage(ctx context.Context, id string) error {
	_, err := m.cli.ImageRemove(ctx, id, image.RemoveOptions{Force: false, PruneChildren: true})
	return err
}

func (m *Manager) PruneImages(ctx context.Context) (int, int64, error) {
	report, err := m.cli.ImagesPrune(ctx, filters.Args{})
	if err != nil {
		return 0, 0, err
	}
	return len(report.ImagesDeleted), int64(report.SpaceReclaimed), nil
}

func (m *Manager) PullImage(ctx context.Context, ref string) error {
	reader, err := m.cli.ImagePull(ctx, ref, image.PullOptions{})
	if err != nil {
		return err
	}
	defer reader.Close()
	_, err = io.Copy(io.Discard, reader)
	return err
}

// --- Helpers ---

func detectComposeBinary() []string {
	// Try docker compose (v2 plugin) first
	if out, err := exec.Command("docker", "compose", "version").Output(); err == nil {
		if strings.Contains(string(out), "version") {
			return []string{"docker", "compose"}
		}
	}
	// Fallback to docker-compose (v1 standalone)
	if _, err := exec.LookPath("docker-compose"); err == nil {
		return []string{"docker-compose"}
	}
	return []string{"docker", "compose"}
}
