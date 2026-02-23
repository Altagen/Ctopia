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
	Name        string `json:"name"`
	ContainerID string `json:"containerId,omitempty"`
	Status      string `json:"status"`
	State       string `json:"state"`
	Running     bool   `json:"running"`
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
	Type       string         `json:"type"`
	Containers []Container    `json:"containers"`
	Composes   []ComposeStack `json:"composes"`
	Timestamp  int64          `json:"timestamp"`
}
