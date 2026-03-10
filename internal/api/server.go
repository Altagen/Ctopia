package api

import (
	"context"
	"encoding/json"
	"fmt"
	"io/fs"
	"net"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/gorilla/websocket"

	"ctopia/internal/auth"
	"ctopia/internal/config"
	"ctopia/internal/docker"
	"ctopia/internal/models"
	"ctopia/internal/pipeline"
	"ctopia/internal/settings"
	ctopiaWeb "ctopia/web"
)

type Server struct {
	cfg      *config.Config
	docker   *docker.Manager
	auth     *auth.Service
	settings *settings.Service
	hub      *wsHub
	router   *chi.Mux
	rl       *rateLimiter
	store    *pipeline.Store
	executor *pipeline.Executor
}

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		origin := r.Header.Get("Origin")
		if origin == "" {
			return true // non-browser clients (CLI, curl, etc.)
		}
		parsed, err := url.Parse(origin)
		if err != nil {
			return false
		}
		// Compare hostnames without port — allows reverse proxy setups where
		// the frontend port differs from the backend port (e.g. Vite dev server).
		originHost := parsed.Hostname()
		requestHost := r.Host
		if h, _, err := net.SplitHostPort(requestHost); err == nil {
			requestHost = h
		}
		return originHost == requestHost
	},
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
}

func NewServer(cfg *config.Config, docker *docker.Manager, auth *auth.Service, svc *settings.Service, store *pipeline.Store) *Server {
	s := &Server{
		cfg:      cfg,
		docker:   docker,
		auth:     auth,
		settings: svc,
		hub:      newWSHub(),
		rl:       newRateLimiter(),
		store:    store,
	}
	s.executor = pipeline.NewExecutor(docker, s.broadcastRaw, s.pushState)
	s.routes()
	return s
}

func (s *Server) broadcastRaw(data []byte) {
	select {
	case s.hub.broadcast <- data:
	default:
	}
}

func (s *Server) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	s.router.ServeHTTP(w, r)
}

func (s *Server) Start(ctx context.Context) {
	go s.hub.run()
	go s.broadcastLoop(ctx)
}

// securityHeaders sets defensive HTTP headers on every response.
func securityHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		h := w.Header()
		h.Set("X-Content-Type-Options", "nosniff")
		h.Set("X-Frame-Options", "DENY")
		h.Set("Referrer-Policy", "strict-origin-when-cross-origin")
		h.Set("Content-Security-Policy",
			"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' ws: wss:")
		next.ServeHTTP(w, r)
	})
}

func (s *Server) routes() {
	r := chi.NewRouter()
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Use(securityHeaders)

	// Setup & Auth (public) — rate-limited
	r.Get("/api/setup/status", s.handleSetupStatus)
	r.With(s.rl.middleware).Post("/api/auth/setup", s.handleSetup)
	r.With(s.rl.middleware).Post("/api/auth/login", s.handleLogin)

	// WebSocket
	r.Get("/ws", s.handleWS)

	// Feature-gated & admin-protected API
	r.Group(func(r chi.Router) {
		r.Use(s.authMiddleware)

		// Containers
		r.With(s.requireFeature(func(f settings.FeatureSet) bool { return f.Containers.View })).
			Get("/api/containers", s.handleContainers)
		r.With(s.requireFeature(func(f settings.FeatureSet) bool { return f.Containers.Start })).
			Post("/api/containers/{id}/start", s.handleContainerAction("start"))
		r.With(s.requireFeature(func(f settings.FeatureSet) bool { return f.Containers.Stop })).
			Post("/api/containers/{id}/stop", s.handleContainerAction("stop"))
		r.With(s.requireFeature(func(f settings.FeatureSet) bool { return f.Containers.Restart })).
			Post("/api/containers/{id}/restart", s.handleContainerAction("restart"))
		r.With(s.requireFeature(func(f settings.FeatureSet) bool { return f.Containers.Delete })).
			Delete("/api/containers/{id}", s.handleContainerDelete)

		// Composes
		r.With(s.requireFeature(func(f settings.FeatureSet) bool { return f.Composes.View })).
			Get("/api/composes", s.handleComposes)
		r.With(s.requireFeature(func(f settings.FeatureSet) bool { return f.Composes.Start })).
			Post("/api/composes/{name}/start", s.handleComposeAction("start"))
		r.With(s.requireFeature(func(f settings.FeatureSet) bool { return f.Composes.Stop })).
			Post("/api/composes/{name}/stop", s.handleComposeAction("stop"))
		r.With(s.requireFeature(func(f settings.FeatureSet) bool { return f.Composes.Restart })).
			Post("/api/composes/{name}/restart", s.handleComposeAction("restart"))

		// Images — static routes before parametric
		r.With(s.requireFeature(func(f settings.FeatureSet) bool { return f.Images.View })).
			Get("/api/images", s.handleImages)
		r.With(s.requireFeature(func(f settings.FeatureSet) bool { return f.Images.Prune })).
			Post("/api/images/prune", s.handleImagePrune)
		r.With(s.requireFeature(func(f settings.FeatureSet) bool { return f.Images.Pull })).
			Post("/api/images/pull", s.handleImagePull)
		r.With(s.requireFeature(func(f settings.FeatureSet) bool { return f.Images.Delete })).
			Delete("/api/images/{id}", s.handleImageRemove)

		// Auth — admin only (password change)
		r.With(s.requireAdmin).Post("/api/auth/password", s.handleChangePassword)

		// Settings — admin only
		r.With(s.requireAdmin).Get("/api/settings", s.handleGetSettings)
		r.With(s.requireAdmin).Post("/api/settings", s.handleUpdateSettings)

		// Pipelines
		r.With(s.requireFeature(func(f settings.FeatureSet) bool { return f.Pipelines.View })).
			Get("/api/pipelines", s.handleListPipelines)
		r.With(s.requireAdmin, s.requireFeature(func(f settings.FeatureSet) bool { return f.Pipelines.Manage })).
			Post("/api/pipelines", s.handleCreatePipeline)
		r.With(s.requireFeature(func(f settings.FeatureSet) bool { return f.Pipelines.Run })).
			Post("/api/pipelines/{name}/run", s.handleRunPipeline)
		r.With(s.requireAdmin, s.requireFeature(func(f settings.FeatureSet) bool { return f.Pipelines.Manage })).
			Put("/api/pipelines/{name}", s.handleUpdatePipeline)
		r.With(s.requireAdmin, s.requireFeature(func(f settings.FeatureSet) bool { return f.Pipelines.Manage })).
			Delete("/api/pipelines/{name}", s.handleDeletePipeline)
	})

	// Static files (SPA)
	// CTOPIA_STATIC_DIR overrides the embedded FS — useful during development.
	if staticDir := os.Getenv("CTOPIA_STATIC_DIR"); staticDir != "" {
		diskFS := http.FileServer(http.Dir(staticDir))
		r.Get("/*", func(w http.ResponseWriter, r *http.Request) {
			path := filepath.Join(staticDir, r.URL.Path)
			if _, err := os.Stat(path); os.IsNotExist(err) {
				http.ServeFile(w, r, filepath.Join(staticDir, "index.html"))
				return
			}
			diskFS.ServeHTTP(w, r)
		})
	} else if webFS, err := fs.Sub(ctopiaWeb.FS, "dist"); err == nil {
		fileServer := http.FileServer(http.FS(webFS))
		r.Get("/*", func(w http.ResponseWriter, r *http.Request) {
			path := strings.TrimPrefix(r.URL.Path, "/")
			if path == "" {
				path = "index.html"
			}
			if f, err := webFS.Open(path); err == nil {
				f.Close()
				fileServer.ServeHTTP(w, r)
				return
			}
			// SPA fallback: unknown paths → index.html (client-side routing)
			http.ServeFileFS(w, r, webFS, "index.html")
		})
	}

	s.router = r
}

// --- Auth Handlers ---

func (s *Server) handleSetupStatus(w http.ResponseWriter, r *http.Request) {
	st := s.settings.Get()
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{
		"configured":      s.auth.IsSetupComplete(),
		"authless":        st.AuthlessMode,
		"strict":          s.cfg.Auth.Strict,
		"admin_features":  st.AdminFeatures,
		"public_features": st.PublicFeatures,
	})
}

func (s *Server) handleSetup(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Password string `json:"password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.Password == "" {
		http.Error(w, "invalid body", http.StatusBadRequest)
		return
	}
	token, err := s.auth.Setup(body.Password)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"token": token})
}

func (s *Server) handleLogin(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Password string `json:"password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "invalid body", http.StatusBadRequest)
		return
	}
	if !s.auth.IsSetupComplete() {
		http.Error(w, "not configured", http.StatusServiceUnavailable)
		return
	}
	token, err := s.auth.Login(body.Password)
	if err != nil {
		http.Error(w, "invalid password", http.StatusUnauthorized)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"token": token})
}

func (s *Server) handleChangePassword(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Current string `json:"current"`
		New     string `json:"new"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.Current == "" || body.New == "" {
		http.Error(w, "invalid body", http.StatusBadRequest)
		return
	}
	token, err := s.auth.ChangePassword(body.Current, body.New)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"token": token})
}

// --- Auth Middleware ---

type authLevel int

const (
	authLevelPublic authLevel = iota
	authLevelAdmin
)

type ctxKey string

const ctxKeyAuthLevel ctxKey = "authLevel"

// authMiddleware sets the auth level in context. In auth-required mode it
// blocks unauthenticated requests with 401. In authless/disabled mode it
// allows all requests, granting admin level to token holders.
func (s *Server) authMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		st := s.settings.Get()
		authRequired := s.cfg.Auth.Enabled && !st.AuthlessMode

		token := ""
		if h := r.Header.Get("Authorization"); strings.HasPrefix(h, "Bearer ") {
			token = strings.TrimPrefix(h, "Bearer ")
		}
		isValidToken := token != "" && s.auth.ValidateToken(token) == nil

		if authRequired {
			if !isValidToken {
				http.Error(w, "unauthorized", http.StatusUnauthorized)
				return
			}
			ctx := context.WithValue(r.Context(), ctxKeyAuthLevel, authLevelAdmin)
			next.ServeHTTP(w, r.WithContext(ctx))
			return
		}

		// Authless / auth disabled: public by default, admin if valid token
		level := authLevelPublic
		if isValidToken {
			level = authLevelAdmin
		}
		ctx := context.WithValue(r.Context(), ctxKeyAuthLevel, level)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// requireAdmin blocks requests from non-admin callers with 403.
func (s *Server) requireAdmin(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		level, _ := r.Context().Value(ctxKeyAuthLevel).(authLevel)
		if level != authLevelAdmin {
			http.Error(w, "admin access required", http.StatusForbidden)
			return
		}
		next.ServeHTTP(w, r)
	})
}

// requireFeature blocks requests when the caller's effective feature set
// does not include the requested feature.
func (s *Server) requireFeature(getter func(settings.FeatureSet) bool) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			level, _ := r.Context().Value(ctxKeyAuthLevel).(authLevel)
			st := s.settings.Get()
			var features settings.FeatureSet
			if level == authLevelAdmin {
				features = st.AdminFeatures
			} else {
				features = st.PublicFeatures
			}
			if !getter(features) {
				http.Error(w, "feature not enabled", http.StatusForbidden)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

// --- Settings Handlers ---

func (s *Server) handleGetSettings(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(s.settings.Get())
}

func (s *Server) handleUpdateSettings(w http.ResponseWriter, r *http.Request) {
	var patch struct {
		AuthlessMode        *bool                `json:"authless_mode"`
		RemoveVolumesOnStop *bool                `json:"remove_volumes_on_stop"`
		AdminFeatures       *settings.FeatureSet `json:"admin_features"`
		PublicFeatures      *settings.FeatureSet `json:"public_features"`
	}
	if err := json.NewDecoder(r.Body).Decode(&patch); err != nil {
		http.Error(w, "invalid body", http.StatusBadRequest)
		return
	}
	if err := s.settings.Update(func(st *settings.Settings) {
		if patch.AuthlessMode != nil {
			st.AuthlessMode = *patch.AuthlessMode
		}
		if patch.RemoveVolumesOnStop != nil {
			st.RemoveVolumesOnStop = *patch.RemoveVolumesOnStop
		}
		if patch.AdminFeatures != nil {
			st.AdminFeatures = *patch.AdminFeatures
		}
		if patch.PublicFeatures != nil {
			st.PublicFeatures = *patch.PublicFeatures
		}
	}); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(s.settings.Get())
}

// --- Container Handlers ---

func (s *Server) handleContainers(w http.ResponseWriter, r *http.Request) {
	containers, err := s.docker.GetContainers(r.Context())
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(containers)
}

func (s *Server) handleContainerAction(action string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id := chi.URLParam(r, "id")
		if err := s.docker.ContainerAction(r.Context(), id, action); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		// Immediately push updated state
		go s.pushState()
		w.WriteHeader(http.StatusNoContent)
	}
}

func (s *Server) handleContainerDelete(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if err := s.docker.ContainerAction(r.Context(), id, "delete"); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	go s.pushState()
	w.WriteHeader(http.StatusNoContent)
}

// --- Compose Handlers ---

func (s *Server) handleComposes(w http.ResponseWriter, r *http.Request) {
	stacks, err := s.docker.GetComposeStacks(r.Context())
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(stacks)
}

func (s *Server) handleComposeAction(action string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		name := chi.URLParam(r, "name")
		ctx, cancel := context.WithTimeout(r.Context(), 2*time.Minute)
		defer cancel()

		if err := s.docker.ComposeAction(ctx, name, action, s.settings.Get().RemoveVolumesOnStop); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		go s.pushState()
		w.WriteHeader(http.StatusNoContent)
	}
}

// --- Image Handlers ---

func (s *Server) handleImages(w http.ResponseWriter, r *http.Request) {
	images, err := s.docker.GetImages(r.Context())
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(images)
}

func (s *Server) handleImageRemove(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if err := s.docker.RemoveImage(r.Context(), id); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleImagePrune(w http.ResponseWriter, r *http.Request) {
	count, space, err := s.docker.PruneImages(r.Context())
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{
		"count":          count,
		"spaceReclaimed": space,
	})
}

func (s *Server) handleImagePull(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Ref string `json:"ref"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.Ref == "" {
		http.Error(w, "invalid body: ref required", http.StatusBadRequest)
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Minute)
	defer cancel()
	if err := s.docker.PullImage(ctx, body.Ref); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// --- WebSocket ---

func (s *Server) handleWS(w http.ResponseWriter, r *http.Request) {
	// Auth check for WS (token passed as query param)
	if s.cfg.Auth.Enabled && !s.settings.Get().AuthlessMode {
		token := r.URL.Query().Get("token")
		if token == "" {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		if err := s.auth.ValidateToken(token); err != nil {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
	}

	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}

	client := &wsClient{conn: conn, send: make(chan []byte, 32)}
	s.hub.register <- client
	defer func() { s.hub.unregister <- client }()

	// Send current state immediately on connect
	go s.pushState()

	// Write pump (send messages to client)
	go client.writePump()

	// Read pump (keep connection alive, detect close)
	for {
		if _, _, err := conn.ReadMessage(); err != nil {
			break
		}
	}
}

// --- Pipeline Handlers ---

func (s *Server) handleListPipelines(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(s.store.List())
}

func (s *Server) handleCreatePipeline(w http.ResponseWriter, r *http.Request) {
	var p models.Pipeline
	if err := json.NewDecoder(r.Body).Decode(&p); err != nil || p.Name == "" {
		http.Error(w, "invalid body: name required", http.StatusBadRequest)
		return
	}
	if err := s.store.Create(p); err != nil {
		http.Error(w, err.Error(), http.StatusConflict)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(p)
}

func (s *Server) handleUpdatePipeline(w http.ResponseWriter, r *http.Request) {
	name := chi.URLParam(r, "name")
	var p models.Pipeline
	if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
		http.Error(w, "invalid body", http.StatusBadRequest)
		return
	}
	if err := s.store.Update(name, p); err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(p)
}

func (s *Server) handleDeletePipeline(w http.ResponseWriter, r *http.Request) {
	name := chi.URLParam(r, "name")
	if err := s.store.Delete(name); err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleRunPipeline(w http.ResponseWriter, r *http.Request) {
	name := chi.URLParam(r, "name")
	p, ok := s.store.Get(name)
	if !ok {
		http.Error(w, "pipeline not found", http.StatusNotFound)
		return
	}
	removeVolumes := s.settings.Get().RemoveVolumesOnStop
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Minute)
	go func() {
		defer cancel()
		s.executor.Run(ctx, p, removeVolumes)
	}()
	w.WriteHeader(http.StatusAccepted)
}

// --- State Broadcaster ---

func (s *Server) broadcastLoop(ctx context.Context) {
	ticker := time.NewTicker(3 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			s.pushState()
		}
	}
}

func (s *Server) pushState() {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	containers, err := s.docker.GetContainers(ctx)
	if err != nil {
		containers = []models.Container{}
	}

	composes, err := s.docker.GetComposeStacks(ctx)
	if err != nil {
		composes = []models.ComposeStack{}
	}

	msg := models.WSMessage{
		Type:        "state",
		Containers:  containers,
		Composes:    composes,
		Timestamp:   time.Now().Unix(),
		PipelineRun: s.executor.GetActiveRun(),
	}

	data, err := json.Marshal(msg)
	if err != nil {
		fmt.Printf("error marshaling state: %v\n", err)
		return
	}

	select {
	case s.hub.broadcast <- data:
	default:
	}
}
