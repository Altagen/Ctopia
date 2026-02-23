package settings

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sync"
)

type ContainerFeatures struct {
	View    bool `json:"view"`
	Start   bool `json:"start"`
	Stop    bool `json:"stop"`
	Restart bool `json:"restart"`
	Delete  bool `json:"delete"`
}

type ComposeFeatures struct {
	View    bool `json:"view"`
	Start   bool `json:"start"`
	Stop    bool `json:"stop"`
	Restart bool `json:"restart"`
}

type ImageFeatures struct {
	View   bool `json:"view"`
	Delete bool `json:"delete"`
	Prune  bool `json:"prune"`
	Pull   bool `json:"pull"`
}

type FeatureSet struct {
	Containers ContainerFeatures `json:"containers"`
	Composes   ComposeFeatures   `json:"composes"`
	Images     ImageFeatures     `json:"images"`
}

type Settings struct {
	AuthlessMode        bool       `json:"authless_mode"`
	RemoveVolumesOnStop bool       `json:"remove_volumes_on_stop"`
	AdminFeatures       FeatureSet `json:"admin_features"`
	PublicFeatures      FeatureSet `json:"public_features"`
}

type Service struct {
	mu      sync.RWMutex
	path    string
	current Settings
}

func NewService(dataDir string) (*Service, error) {
	s := &Service{
		path: filepath.Join(dataDir, "settings.json"),
	}
	if err := s.load(); err != nil {
		return nil, err
	}
	return s, nil
}

func (s *Service) Get() Settings {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.current
}

func (s *Service) Update(fn func(*Settings)) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	fn(&s.current)
	return s.save()
}

func (s *Service) load() error {
	data, err := os.ReadFile(s.path)
	if err != nil {
		if os.IsNotExist(err) {
			s.applyDefaults()
			return nil
		}
		return fmt.Errorf("reading settings: %w", err)
	}
	if err := json.Unmarshal(data, &s.current); err != nil {
		// Migration: salvage scalar fields from old flat format
		var old struct {
			AuthlessMode        bool `json:"authless_mode"`
			RemoveVolumesOnStop bool `json:"remove_volumes_on_stop"`
		}
		if jsonErr := json.Unmarshal(data, &old); jsonErr == nil {
			s.current.AuthlessMode = old.AuthlessMode
			s.current.RemoveVolumesOnStop = old.RemoveVolumesOnStop
		}
	}
	s.applyDefaults()
	return nil
}

func isZeroFeatureSet(f FeatureSet) bool {
	return !f.Containers.View && !f.Containers.Start && !f.Containers.Stop &&
		!f.Containers.Restart && !f.Containers.Delete &&
		!f.Composes.View && !f.Composes.Start && !f.Composes.Stop && !f.Composes.Restart &&
		!f.Images.View && !f.Images.Delete && !f.Images.Prune && !f.Images.Pull
}

// applyDefaults fills zero-value FeatureSet fields with sensible defaults
// (triggered on first run or when upgrading from a version without granular feature flags).
func (s *Service) applyDefaults() {
	if isZeroFeatureSet(s.current.AdminFeatures) {
		s.current.AdminFeatures = FeatureSet{
			Containers: ContainerFeatures{View: true, Start: true, Stop: true, Restart: true, Delete: true},
			Composes:   ComposeFeatures{View: true, Start: true, Stop: true, Restart: true},
			Images:     ImageFeatures{View: true, Delete: true, Prune: true, Pull: true},
		}
	}
	if isZeroFeatureSet(s.current.PublicFeatures) {
		s.current.PublicFeatures = FeatureSet{
			Containers: ContainerFeatures{View: true},
			Composes:   ComposeFeatures{View: true},
		}
	}
}

func (s *Service) save() error {
	data, err := json.MarshalIndent(s.current, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(s.path, data, 0600)
}
