package config

import (
	"fmt"
	"os"

	"gopkg.in/yaml.v3"
)

type Config struct {
	Engine    string           `yaml:"engine"`
	Socket    string           `yaml:"socket"`
	Port      int              `yaml:"port"`
	DataDir   string           `yaml:"data_dir"`
	Auth      AuthConfig       `yaml:"auth"`
	Composes  []ComposeConfig  `yaml:"composes"`
	Agents    []AgentConfig    `yaml:"agents"` // Phase 2 — unused for now
	Pipelines []PipelineConfig `yaml:"pipelines"`
}

type AuthConfig struct {
	Enabled bool `yaml:"enabled"`
	// Strict enforces strong password requirements (min 12 chars, uppercase,
	// lowercase, digit, special character). Set to false only in dev/test
	// environments. Defaults to true.
	Strict bool `yaml:"strict"`
}

type ComposeConfig struct {
	Name string `yaml:"name"`
	Path string `yaml:"path"`
}

type PipelineStepConfig struct {
	Name         string   `yaml:"name"`
	Action       string   `yaml:"action"`
	Composes     []string `yaml:"composes"`
	Wait         string   `yaml:"wait"`
	DelaySeconds int      `yaml:"delay_seconds,omitempty"`
}

type PipelineConfig struct {
	Name            string               `yaml:"name"`
	ContinueOnError bool                 `yaml:"continue_on_error"`
	Steps           []PipelineStepConfig `yaml:"steps"`
}

// AgentConfig describes a remote agent endpoint. Parsed but unused until Phase 2.
type AgentConfig struct {
	Name string `yaml:"name"`
	URL  string `yaml:"url"`
	// TLSCert / TLSKey will be added with mTLS in Phase 2
}

func Load(path string) (*Config, error) {
	cfg := defaults()

	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return cfg, nil
		}
		return nil, fmt.Errorf("reading config: %w", err)
	}

	if err := yaml.Unmarshal(data, cfg); err != nil {
		return nil, fmt.Errorf("parsing config: %w", err)
	}

	return cfg, nil
}

func defaults() *Config {
	return &Config{
		Engine:  "docker",
		Socket:  "/var/run/docker.sock",
		Port:    8080,
		DataDir: "./data",
		Auth: AuthConfig{
			Enabled: true,
			Strict:  true,
		},
	}
}
