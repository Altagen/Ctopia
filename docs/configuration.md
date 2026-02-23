# Configuration Reference

Ctopia is configured via a YAML file. By default it looks for `config.yml` in the working directory. Override with the `CTOPIA_CONFIG` environment variable.

---

## Full example

```yaml
engine: docker
socket: /var/run/docker.sock
port: 8080
data_dir: ./data

auth:
  enabled: true
  strict: true   # set to false for local dev/test (relaxes password rules)

composes:
  - name: "My App"
    path: /srv/myapp
  - name: "Monitoring"
    path: /srv/monitoring
  - name: "Database"
    path: /srv/db
```

---

## Fields

### `engine`
| | |
|---|---|
| Type | `string` |
| Default | `docker` |
| Values | `docker` |

Container engine to use. Only `docker` is supported in the current version.

---

### `socket`
| | |
|---|---|
| Type | `string` |
| Default | `/var/run/docker.sock` |

Path to the Docker daemon Unix socket. When running in a container, mount the host socket and ensure the container has read/write access (via `--group-add`).

---

### `port`
| | |
|---|---|
| Type | `integer` |
| Default | `8080` |

TCP port the HTTP server listens on.

---

### `data_dir`
| | |
|---|---|
| Type | `string` |
| Default | `./data` |

Directory where Ctopia stores persistent data:
- `auth.json` — hashed admin password and JWT secret (mode `0600`)
- `settings.json` — runtime settings (authless mode, feature flags, …)

The directory itself is created with mode `0700`. When running in Docker, mount this directory as a volume to persist data across restarts.

---

### `auth.enabled`
| | |
|---|---|
| Type | `boolean` |
| Default | `true` |

Whether authentication is required. When `false`, all users are treated as admins and no login is required. Not recommended for production — prefer `authless_mode` in settings for a more granular approach.

---

### `auth.strict`
| | |
|---|---|
| Type | `boolean` |
| Default | `true` |

Controls password strength requirements at setup time.

- `true` (default) — password must be at least 12 characters and contain uppercase, lowercase, a digit, and a special character.
- `false` — password must be at least 4 characters. **Only use this in local dev/test environments.**

---

### `composes`
| | |
|---|---|
| Type | `list` |
| Default | `[]` |

List of Docker Compose projects to manage. Each entry has:

| Field | Type | Description |
|---|---|---|
| `name` | `string` | Display name shown in the UI |
| `path` | `string` | Absolute path to the directory containing `docker-compose.yml` |

The paths must be accessible from the Ctopia process. When running in a container, mount each compose directory as a volume. All stacks can be mounted independently — no common parent directory is required.

**Example with Docker Compose:**
```yaml
# docker-compose.yml (Ctopia)
services:
  ctopia:
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - ./config.yml:/app/config.yml:ro
      - /srv/myapp:/srv/myapp:ro
      - /srv/monitoring:/srv/monitoring:ro
```

For advanced scenarios (relative `env_file` paths, stacks spread across unrelated directories, container bind mounts), see **[docs/compose-stacks.md](compose-stacks.md)**.

---

## Environment variables

| Variable | Description |
|---|---|
| `CTOPIA_CONFIG` | Path to the config file (default: `config.yml`) |
| `CTOPIA_STATIC_DIR` | Serve frontend from this directory instead of the embedded assets — useful during development |
| `CTOPIA_JWT_SECRET` | Override the JWT signing key (32+ random bytes recommended). When set, the stored secret in `auth.json` is ignored. Useful with Docker secrets or a secrets manager. |

---

## Runtime settings

The following settings can be changed at runtime from the **Settings** page (admin only) and are persisted to `data/settings.json`:

| Setting | Description |
|---|---|
| **Authless mode** | When enabled, unauthenticated users can access the dashboard with the permissions defined in *Public features* |
| **Remove volumes on stop** | When enabled, stopping a compose stack runs `docker compose down -v` (deletes volumes) |
| **Admin features** | Per-action feature flags for authenticated admins (view / start / stop / restart / delete per resource type) |
| **Public features** | Per-action feature flags for unauthenticated users when authless mode is active |

---

## Security model

### Password storage
Admin passwords are hashed with **bcrypt** at `DefaultCost` (10). The hash is stored in `data/auth.json` with mode `0600` — readable only by the process owner.

### JWT tokens
Sessions are represented as **HS256 JWT tokens** with a 30-day expiry. The signing key is a 32-byte random hex string generated at first setup and stored in `data/auth.json`.

To avoid storing the key on disk (e.g. in Docker or Kubernetes environments), set `CTOPIA_JWT_SECRET` to an externally managed secret. The env var takes priority over the stored key.

### File permissions
| Path | Mode | Contents |
|---|---|---|
| `data/` | `0700` | Data directory |
| `data/auth.json` | `0600` | Password hash + JWT secret |
| `data/settings.json` | `0600` | Runtime settings |

### Rate limiting
Login (`POST /api/auth/login`) and setup (`POST /api/auth/setup`) are rate-limited to **5 requests per minute** per IP. Excess requests receive `429 Too Many Requests`.

### HTTPS / TLS
Ctopia does not terminate TLS directly. Run it behind a reverse proxy (Nginx, Traefik, Caddy) that handles HTTPS. Expose only the proxy port externally.
