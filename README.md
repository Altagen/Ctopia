# Ctopia

A lightweight, self-hosted Docker dashboard. Manage containers, compose stacks, and images from a clean web UI — with real-time updates via WebSocket, granular feature flags, and optional authentication.

---

## Features

- **Real-time monitoring** — container state, CPU & memory pushed via WebSocket every 3 s
- **Container management** — start, stop, restart, delete
- **Compose stacks** — manage multi-service stacks declared in `config.yml`
- **Image management** — list, delete, prune unused, pull by reference
- **Granular permissions** — per-action feature flags for admins and public (authless) users
- **Authless mode** — expose a read-only (or custom) view without requiring login
- **Single binary** — Go backend with embedded React frontend, no runtime dependencies

---

## Quick Start

### Docker (recommended)

```bash
# 1. Copy and edit the config
cp config.example.yml config.yml

# 2. Find your docker group id
DOCKER_GID=$(stat -c '%g' /var/run/docker.sock)

# 3. Run
docker run -d \
  --name ctopia \
  -p 8080:8080 \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v $(pwd)/config.yml:/app/config.yml:ro \
  -v ctopia-data:/app/data \
  --group-add $DOCKER_GID \
  ctopia:latest
```

Or with Docker Compose:

```bash
cp config.example.yml config.yml
DOCKER_GID=$(stat -c '%g' /var/run/docker.sock) docker compose up -d
```

Open **http://localhost:8080** — you'll be guided through first-time setup to set your admin password.

### Build from source

**Prerequisites:** Go 1.24+, Node.js 22+, [Task](https://taskfile.dev)

```bash
# Install Task (if not already installed)
sh -c "$(curl -ssL https://taskfile.dev/install.sh)" -- -d -b ~/.local/bin

git clone https://github.com/Altagen/Ctopia
cd ctopia

task install-web   # npm install
task build         # builds frontend then embeds it into the Go binary
./dist/ctopia
```

---

## Configuration

Ctopia reads `config.yml` from the working directory by default. Override with the `CTOPIA_CONFIG` environment variable.

```yaml
engine: docker
socket: /var/run/docker.sock
port: 8080
data_dir: ./data

auth:
  enabled: true

composes:
  - name: "My App"
    path: /srv/myapp
  - name: "Monitoring"
    path: /srv/monitoring
```

See [docs/configuration.md](docs/configuration.md) for the full reference.

---

## Development

```bash
# Install frontend deps once
task install-web

# Terminal 1 — Go API with hot-reload
# Requires: go install github.com/air-verse/air@latest
task dev-api

# Terminal 2 — Vite dev server (proxies /api and /ws to :8080)
task dev-web

# Or both at once:
task dev
```

The Vite dev server runs on **http://localhost:5173** and proxies API/WS calls to Go on `:8080`.

---

## Docker Build

```bash
task docker          # builds ctopia:latest
task docker-push     # builds + pushes
```

You can inject the JWT signing key at runtime instead of relying on the on-disk secret:

```bash
docker run -d \
  --name ctopia \
  -e CTOPIA_JWT_SECRET=<your-secret> \
  ...
```

Or via Docker Compose secrets — see the comment in `docker-compose.yml`.

The multi-stage Dockerfile:
1. **node:22-alpine** — builds the React + Vite frontend
2. **golang:1.24-alpine** — compiles the Go binary with the frontend embedded via `go:embed`
3. **alpine:3.21** — minimal runtime image (~15 MB)

---

## Project Structure

```
ctopia/
├── cmd/hub/           # Binary entry point (main.go)
├── internal/
│   ├── api/           # HTTP server, routes, middleware, WebSocket
│   ├── auth/          # bcrypt password + JWT (30-day tokens)
│   ├── config/        # YAML config loading
│   ├── docker/        # Docker SDK v28 wrapper
│   ├── models/        # Shared Go types (Container, ComposeStack, …)
│   └── settings/      # Runtime settings persisted to data/settings.json
├── web/               # React 18 + TypeScript + Vite + Tailwind v3
│   ├── src/
│   └── web.go         # go:embed entry point
├── examples/
│   └── test-stack/    # Sample compose stack for local testing
├── docs/
│   ├── configuration.md
│   └── api.md
├── Dockerfile
├── docker-compose.yml
└── config.example.yml
```

---

## API & WebSocket

See [docs/api.md](docs/api.md) for the full REST and WebSocket reference.

---

## Compose stacks — volume mounting guide

Ctopia executes `docker compose` with the working directory set to each stack's `path`, so relative paths in your compose files work exactly as in standalone usage. See [docs/compose-stacks.md](docs/compose-stacks.md) for all scenarios:

- Multiple stacks at unrelated filesystem locations
- Relative `env_file` and config file references
- Container bind mounts (handled by the Docker daemon — no extra mounting needed)

---

## Roadmap

See [docs/roadmap.md](docs/roadmap.md) for the full Phase 1 status and Phase 2 backlog.
