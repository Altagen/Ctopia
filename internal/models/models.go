package models

type Container struct {
	ID          string  `json:"id"`
	FullID      string  `json:"fullId"`
	Name        string  `json:"name"`
	Image       string  `json:"image"`
	Status      string  `json:"status"`
	State       string  `json:"state"`
	CPU         float64 `json:"cpu"`
	Memory      uint64  `json:"memory"`
	MemoryLimit uint64  `json:"memoryLimit"`
	Ports       []Port  `json:"ports"`
	Created     int64   `json:"created"`
	Compose     string  `json:"compose,omitempty"`
	Host        string  `json:"host,omitempty"` // "" = local; populated by agent in Phase 2
}

type Port struct {
	IP        string `json:"ip"`
	Host      int    `json:"host"`
	Container int    `json:"container"`
	Protocol  string `json:"protocol"`
}

type ComposeStack struct {
	Name     string           `json:"name"`
	Path     string           `json:"path"`
	Status   string           `json:"status"` // running | partial | stopped
	Services []ComposeService `json:"services"`
	Host     string           `json:"host,omitempty"` // "" = local; populated by agent in Phase 2
}

type ComposeService struct {
	Name          string `json:"name"`
	ContainerID   string `json:"containerId,omitempty"`
	ContainerName string `json:"containerName,omitempty"`
	Image         string `json:"image,omitempty"`
	Ports         []Port `json:"ports,omitempty"`
	Status        string `json:"status"`
	State         string `json:"state"`
	Running       bool   `json:"running"`
}

type Image struct {
	ID      string   `json:"id"`
	ShortID string   `json:"shortId"`
	Tags    []string `json:"tags"`
	Size    int64    `json:"size"`
	Created int64    `json:"created"`
	InUse   bool     `json:"inUse"`
}

type WSMessage struct {
	Type        string               `json:"type"`
	Containers  []Container          `json:"containers,omitempty"`
	Composes    []ComposeStack       `json:"composes,omitempty"`
	Timestamp   int64                `json:"timestamp"`
	PipelineRun *PipelineRunProgress `json:"pipeline_run,omitempty"`
}

// --- Pipeline ---

type WaitMode string

const (
	WaitImmediately     WaitMode = "immediately"
	WaitServicesRunning WaitMode = "services_running"
	WaitDelay           WaitMode = "delay"
)

type PipelineStep struct {
	Name         string   `json:"name" yaml:"name"`
	Action       string   `json:"action" yaml:"action"` // start|stop|restart
	Composes     []string `json:"composes" yaml:"composes"`
	Wait         WaitMode `json:"wait" yaml:"wait"`
	DelaySeconds int      `json:"delay_seconds,omitempty" yaml:"delay_seconds,omitempty"`
}

type Pipeline struct {
	Name            string         `json:"name" yaml:"name"`
	Source          string         `json:"source"` // "config" | "runtime"
	ContinueOnError bool           `json:"continue_on_error" yaml:"continue_on_error"`
	Steps           []PipelineStep `json:"steps" yaml:"steps"`
}

type ComposeActionResult struct {
	Name   string `json:"name"`
	Status string `json:"status"` // pending|running|done|failed
	Error  string `json:"error,omitempty"`
}

type PipelineStepResult struct {
	Index          int                   `json:"index"`
	Name           string                `json:"name"`
	Status         string                `json:"status"` // pending|running|done|failed
	ComposeResults []ComposeActionResult `json:"compose_results"`
	Error          string                `json:"error,omitempty"`
}

type PipelineRunProgress struct {
	PipelineName string               `json:"pipeline_name"`
	Status       string               `json:"status"` // running|done|failed
	Steps        []PipelineStepResult `json:"steps"`
	StartedAt    int64                `json:"started_at"`
	FinishedAt   int64                `json:"finished_at,omitempty"`
}
