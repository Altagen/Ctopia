# Managing Compose Stacks

This document explains how Ctopia manages Docker Compose stacks, what it needs access to, and how to configure volume mounts correctly for every scenario.

---

## How Ctopia runs `docker compose`

When you trigger a start/stop/restart on a stack, Ctopia runs:

```
docker compose up -d
```

**with the working directory set to the stack's `path`** as declared in `config.yml`. This is equivalent to opening a terminal, `cd`-ing into the compose folder, and running the command yourself.

```go
cmd.Dir = cc.Path  // always set to the declared compose path
```

This means relative paths inside your `docker-compose.yml` resolve exactly the same way as they do in standalone usage.

---

## What Ctopia needs to access — and what it does not

This is the most important concept to understand. Two different actors are involved:

| Actor | What it reads | Needs to be accessible inside Ctopia? |
|---|---|---|
| `docker compose` CLI (runs inside Ctopia) | The `docker-compose.yml` file itself, `env_file` paths, `configs`, `secrets` file references | **Yes** |
| Docker daemon (runs on the host) | Container volume mounts (`- /data:/app`), bind mounts, image pulls | **No** — the daemon has full host access |

In short:

- **The compose file and files it reads directly** (env files, config files) → must be mounted into Ctopia
- **Paths that end up as container volume mounts** → the Docker daemon handles those, Ctopia never touches them

---

## Scenarios

### Scenario 1 — Simple stack, no relative paths

The most common case. Your compose file uses only absolute paths or no external file references.

**Host layout:**
```
/srv/
  myapp/
    docker-compose.yml
    .env
```

**`config.yml`:**
```yaml
composes:
  - name: "My App"
    path: /srv/myapp
```

**Ctopia `docker-compose.yml`:**
```yaml
services:
  ctopia:
    image: ghcr.io/altagen/ctopia:latest
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - ./config.yml:/app/config.yml:ro
      - ctopia-data:/app/data
      - /srv/myapp:/srv/myapp:ro   # mount the stack directory
```

Ctopia mounts exactly the stack directory. Nothing more needed.

---

### Scenario 2 — Multiple stacks at unrelated filesystem locations

Your stacks live at different, unrelated paths. No common parent required — mount each one independently.

**Host layout:**
```
/data/
  database/
    docker-compose.yml
/etc/
  monitoring/
    docker-compose.yml
/home/user/
  webapp/
    docker-compose.yml
```

**`config.yml`:**
```yaml
composes:
  - name: "Database"
    path: /data/database
  - name: "Monitoring"
    path: /etc/monitoring
  - name: "Web App"
    path: /home/user/webapp
```

**Ctopia `docker-compose.yml`:**
```yaml
services:
  ctopia:
    image: ghcr.io/altagen/ctopia:latest
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - ./config.yml:/app/config.yml:ro
      - ctopia-data:/app/data
      - /data/database:/data/database:ro
      - /etc/monitoring:/etc/monitoring:ro
      - /home/user/webapp:/home/user/webapp:ro
```

Each stack is mounted individually. No constraints on directory structure.

---

### Scenario 3 — Stack with a relative `env_file` reference

Your compose file references an env file using a relative path that goes outside the stack directory.

**Host layout:**
```
/srv/
  secrets/
    production.env        ← referenced as ../secrets/production.env
  myapp/
    docker-compose.yml
```

**`myapp/docker-compose.yml`:**
```yaml
services:
  app:
    image: myapp:latest
    env_file:
      - ../secrets/production.env   # read by docker compose CLI
```

`docker compose` reads this file **before** talking to the daemon. Ctopia must be able to reach it.

**Ctopia `docker-compose.yml`:**
```yaml
services:
  ctopia:
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - ./config.yml:/app/config.yml:ro
      - ctopia-data:/app/data
      - /srv:/srv:ro   # mount the common parent to preserve relative resolution
```

Because Ctopia sets `CWD=/srv/myapp` when running `docker compose`, the path `../secrets/production.env` resolves to `/srv/secrets/production.env` — accessible because `/srv` is mounted.

> **Rule:** mount the nearest common ancestor of the compose directory and all files it references directly.

---

### Scenario 4 — Stack with container volume mounts pointing to other host paths

Your compose file binds a host directory into a container. This is **not** a relative path issue — the Docker daemon handles it directly.

**`docker-compose.yml` of the managed stack:**
```yaml
services:
  app:
    image: myapp:latest
    volumes:
      - /data/uploads:/app/uploads     # bind mount handled by the daemon
      - /data/backups:/app/backups:ro  # same
```

**Ctopia does not need `/data` mounted.** The `docker compose` CLI passes these paths as instructions to the Docker daemon, which resolves them on the host. Ctopia only needs to read the `docker-compose.yml` file itself.

**Ctopia `docker-compose.yml`:**
```yaml
services:
  ctopia:
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - ./config.yml:/app/config.yml:ro
      - ctopia-data:/app/data
      - /home/user/myapp:/home/user/myapp:ro   # just the compose directory
      # /data is NOT needed here
```

---

### Scenario 5 — Mixed: relative env file + container bind mounts

Combines scenarios 3 and 4. The compose file has both a relative `env_file` and container volume mounts pointing to other host paths.

**Host layout:**
```
/home/
  user/
    config/
      app.env              ← relative env_file reference
    myapp/
      docker-compose.yml
```

**`myapp/docker-compose.yml`:**
```yaml
services:
  app:
    image: myapp:latest
    env_file:
      - ../config/app.env       # read by CLI → Ctopia needs access
    volumes:
      - /data/uploads:/uploads  # handled by daemon → Ctopia does NOT need /data
      - /backups:/backups:ro    # same
```

**Ctopia `docker-compose.yml`:**
```yaml
services:
  ctopia:
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - ./config.yml:/app/config.yml:ro
      - ctopia-data:/app/data
      - /home/user:/home/user:ro   # covers myapp/ and ../config/ — /data not needed
```

---

## Quick reference

| What your compose uses | Who reads it | Mount in Ctopia? |
|---|---|---|
| `docker-compose.yml` file itself | `docker compose` CLI | **Yes** — always |
| `env_file: ./local.env` | `docker compose` CLI | **Yes** |
| `env_file: ../other/.env` | `docker compose` CLI | **Yes** — mount parent |
| `configs:` / `secrets:` (file-based) | `docker compose` CLI | **Yes** |
| `volumes: - /data:/app` (bind mount) | Docker daemon | **No** |
| `volumes: - myvolume:/app` (named volume) | Docker daemon | **No** |
| `image:` references | Docker daemon (pull) | **No** |
| `ports:` | Docker daemon | **No** |
| `networks:` | Docker daemon | **No** |

---

## Mounting as read-only vs read-write

Ctopia mounts are used to:
1. **Read** the `docker-compose.yml` to parse service names and status
2. **Execute** `docker compose` commands (which reads env files, configs, etc.)

All of this is read-only. You can safely mount all compose directories with `:ro`:

```yaml
volumes:
  - /srv/myapp:/srv/myapp:ro
```

The Docker daemon handles all write operations on container data independently.

---

## Path rules summary

1. **Always use absolute paths** in `config.yml` — the `path` field must be an absolute path as seen from inside the Ctopia container.
2. **Mount the stack directory**, or its ancestor if relative paths go outside it.
3. **Do not worry about container volume targets** — those are resolved by the Docker daemon on the host.
4. **Multiple unrelated stacks** are fully supported — mount each directory independently, no common parent required.
