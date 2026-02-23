package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"ctopia/internal/api"
	"ctopia/internal/auth"
	"ctopia/internal/config"
	"ctopia/internal/docker"
	"ctopia/internal/settings"
)

// version is set at build time via -ldflags "-X main.version=<tag>".
var version = "dev"

func main() {
	configPath := "config.yml"
	if v := os.Getenv("CTOPIA_CONFIG"); v != "" {
		configPath = v
	}

	cfg, err := config.Load(configPath)
	if err != nil {
		log.Fatalf("config: %v", err)
	}

	authSvc, err := auth.NewService(cfg)
	if err != nil {
		log.Fatalf("auth: %v", err)
	}

	settingsSvc, err := settings.NewService(cfg.DataDir)
	if err != nil {
		log.Fatalf("settings: %v", err)
	}

	dockerMgr, err := docker.NewManager(cfg)
	if err != nil {
		log.Fatalf("docker: %v", err)
	}
	defer dockerMgr.Close()

	server := api.NewServer(cfg, dockerMgr, authSvc, settingsSvc)

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	server.Start(ctx)

	addr := fmt.Sprintf(":%d", cfg.Port)
	httpServer := &http.Server{
		Addr:    addr,
		Handler: server,
	}

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)

	go func() {
		log.Printf("▶  Ctopia %s running on http://localhost%s", version, addr)
		if err := httpServer.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("server: %v", err)
		}
	}()

	<-quit
	log.Println("shutting down...")
	cancel()

	shutCtx, shutCancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer shutCancel()
	httpServer.Shutdown(shutCtx)
}
