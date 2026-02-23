# API Reference

All API endpoints are prefixed with `/api`. The frontend is served at `/` from the embedded assets.

---

## Authentication

Ctopia uses **JWT Bearer tokens** (30-day expiry). Include the token in the `Authorization` header for all protected endpoints:

```
Authorization: Bearer <token>
```

For WebSocket connections, pass the token as a query parameter: `?token=<token>`.

When **authless mode** is enabled, unauthenticated requests are allowed with the permissions defined in *Public features*. Authenticated requests always receive admin-level permissions.

---

## Endpoints

### Setup & Auth

#### `GET /api/setup/status`
Returns the current setup and auth state. Called on app load.

**Response**
```json
{
  "configured": true,
  "authless": false,
  "admin_features": { ... },
  "public_features": { ... }
}
```

| Field | Type | Description |
|---|---|---|
| `configured` | `bool` | Whether an admin password has been set |
| `authless` | `bool` | Whether authless mode is active |
| `strict` | `bool` | Whether strict password rules are enforced (from `auth.strict` in config) |
| `admin_features` | `FeatureSet` | Feature flags for authenticated admins |
| `public_features` | `FeatureSet` | Feature flags for unauthenticated users |

---

#### `POST /api/auth/setup`
First-time setup — sets the admin password and returns a JWT token.

**Request**
```json
{ "password": "your-password" }
```

**Response** `200`
```json
{ "token": "<jwt>" }
```

**Errors**
- `400` — invalid body or setup already completed

---

#### `POST /api/auth/password`
Change the admin password. Requires a valid admin token. Rotates the JWT secret, invalidating all existing sessions. Returns a new token so the caller stays authenticated.

**Auth** admin token required

**Request**
```json
{ "current": "old-password", "new": "new-password" }
```

**Response** `200`
```json
{ "token": "<new-jwt>" }
```

**Errors**
- `400` — invalid body, wrong current password, or new password fails strength requirements
- `403` — not authenticated as admin

---

#### `POST /api/auth/login`
Authenticate with the admin password.

**Request**
```json
{ "password": "your-password" }
```

**Response** `200`
```json
{ "token": "<jwt>" }
```

**Errors**
- `400` — invalid body
- `401` — wrong password

---

### Containers

All container endpoints require the corresponding feature flag to be enabled for the caller's permission level.

#### `GET /api/containers`
List all containers (running and stopped).

**Requires** `containers.view`

**Response** `200` — array of `Container`
```json
[
  {
    "id": "abc123",
    "name": "nginx",
    "image": "nginx:latest",
    "state": "running",
    "status": "Up 2 hours",
    "cpu": 0.4,
    "mem": 12582912,
    "mem_limit": 2147483648,
    "ports": ["0.0.0.0:80->80/tcp"],
    "compose_project": "myapp"
  }
]
```

---

#### `POST /api/containers/{id}/start`
Start a container.

**Requires** `containers.start` · **Auth** admin or public with feature enabled

**Response** `204 No Content`

---

#### `POST /api/containers/{id}/stop`
Stop a container.

**Requires** `containers.stop`

**Response** `204 No Content`

---

#### `POST /api/containers/{id}/restart`
Restart a container.

**Requires** `containers.restart`

**Response** `204 No Content`

---

#### `DELETE /api/containers/{id}`
Force-remove a container (equivalent to `docker rm -f`).

**Requires** `containers.delete` · **Auth** admin only

**Response** `204 No Content`

---

### Compose Stacks

Compose stacks are declared in `config.yml`. The `{name}` parameter matches the `name` field in the config.

#### `GET /api/composes`
List all configured compose stacks and their status.

**Requires** `composes.view`

**Response** `200` — array of `ComposeStack`
```json
[
  {
    "name": "My App",
    "path": "/srv/myapp",
    "status": "running",
    "services": [
      { "name": "web", "state": "running", "image": "nginx:latest" },
      { "name": "db",  "state": "running", "image": "postgres:16" }
    ]
  }
]
```

---

#### `POST /api/composes/{name}/start`
Start a compose stack (`docker compose up -d`).

**Requires** `composes.start`

**Response** `204 No Content`

---

#### `POST /api/composes/{name}/stop`
Stop a compose stack. If *Remove volumes on stop* is enabled in settings, runs `docker compose down -v` instead of `down`.

**Requires** `composes.stop`

**Response** `204 No Content`

---

#### `POST /api/composes/{name}/restart`
Restart a compose stack (stop then start).

**Requires** `composes.restart`

**Response** `204 No Content`

---

### Images

#### `GET /api/images`
List all local Docker images.

**Requires** `images.view`

**Response** `200` — array of `Image`
```json
[
  {
    "id": "sha256:abc...",
    "short_id": "abc123de",
    "tags": ["nginx:latest", "nginx:1.25"],
    "size": 187432960,
    "created": 1710000000,
    "in_use": true
  }
]
```

---

#### `DELETE /api/images/{id}`
Remove an image by ID.

**Requires** `images.delete` · **Auth** admin only

**Response** `204 No Content`

---

#### `POST /api/images/prune`
Remove all unused images (`docker image prune -a`).

**Requires** `images.prune` · **Auth** admin only

**Response** `200`
```json
{ "count": 3, "spaceReclaimed": 452984832 }
```

---

#### `POST /api/images/pull`
Pull an image by reference.

**Requires** `images.pull` · **Auth** admin only

**Request**
```json
{ "ref": "nginx:latest" }
```

**Response** `204 No Content`

---

### Settings

All settings endpoints require admin authentication.

#### `GET /api/settings`
Get the current runtime settings.

**Response** `200`
```json
{
  "authless_mode": false,
  "remove_volumes_on_stop": false,
  "admin_features": {
    "containers": { "view": true, "start": true, "stop": true, "restart": true, "delete": true },
    "composes":   { "view": true, "start": true, "stop": true, "restart": true },
    "images":     { "view": true, "delete": true, "prune": true, "pull": true }
  },
  "public_features": {
    "containers": { "view": true, "start": false, "stop": false, "restart": false, "delete": false },
    "composes":   { "view": true, "start": false, "stop": false, "restart": false },
    "images":     { "view": false, "delete": false, "prune": false, "pull": false }
  }
}
```

---

#### `POST /api/settings`
Partially update runtime settings. Only the provided fields are updated.

**Request** (all fields optional)
```json
{
  "authless_mode": true,
  "remove_volumes_on_stop": false,
  "admin_features": { ... },
  "public_features": { ... }
}
```

**Response** `200` — full updated settings object

---

## WebSocket

### `GET /ws`

Establishes a WebSocket connection for real-time state updates.

**Auth** — when auth is enabled and authless mode is off, pass `?token=<jwt>` as a query parameter.

```
ws://localhost:8080/ws?token=<jwt>
```

#### Server → Client messages

The server pushes a state message immediately on connect, then every 3 seconds, and immediately after any action (start/stop/restart/delete).

**`state` message**
```json
{
  "type": "state",
  "containers": [ ... ],
  "composes": [ ... ],
  "timestamp": 1710000000
}
```

---

## Error responses

All error responses are plain text with an appropriate HTTP status code:

| Status | Meaning |
|---|---|
| `400` | Invalid request body |
| `401` | Missing or invalid token |
| `403` | Admin access required, or feature not enabled |
| `429` | Rate limit exceeded — login and setup endpoints allow 5 requests/min per IP |
| `500` | Internal server error (Docker daemon error, etc.) |

---

## Types

### `FeatureSet`
```json
{
  "containers": { "view": bool, "start": bool, "stop": bool, "restart": bool, "delete": bool },
  "composes":   { "view": bool, "start": bool, "stop": bool, "restart": bool },
  "images":     { "view": bool, "delete": bool, "prune": bool, "pull": bool }
}
```
