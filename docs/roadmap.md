# Roadmap

## Phase 1 — Done ✅

Core dashboard, self-hosted, single binary.

| Feature | Status |
|---|---|
| Container list, start/stop/restart/delete | ✅ |
| Compose stack management | ✅ |
| Image list, delete, prune, pull | ✅ |
| Real-time WebSocket (3 s + on-action push) | ✅ |
| bcrypt password + JWT auth (30-day tokens) | ✅ |
| First-time setup flow | ✅ |
| Authless mode + per-action feature flags | ✅ |
| Security headers, rate limiting (5 req/min on auth) | ✅ |
| `auth.strict` password policy | ✅ |
| `CTOPIA_JWT_SECRET` env var override | ✅ |
| Settings page (authless, feature flags, volume on stop) | ✅ |
| React + Vite + Tailwind v3 frontend, embedded in binary | ✅ |
| Docker image (multi-stage, ~15 MB) | ✅ |
| Taskfile + documentation | ✅ |
| **Password change** (`POST /api/auth/password`) | ✅ |
| **CI** (GitHub Actions: lint-go + lint-web on PR/push) | ✅ |
| **Release** (multi-platform binaries + Docker on semver tag) | ✅ |
| Multi-host anticipation (`Host` field on models, `agents:` config stub) | ✅ |

---

## Phase 2 — Backlog

Prioritised. Items within a priority tier are roughly ordered by dependency.

### Haute priorité

| # | Feature | Valeur | Effort | Notes |
|---|---|---|---|---|
| 1 | **Tests** unitaires Go + intégration | Confiance sur refactos, CI | Moyen | Couvrir auth, settings, handlers |
| 2 | **Agent binary** (`cmd/agent`) | Multi-host | Élevé | Bloc principal des fonctionnalités scale; `Host` field + `agents:` config already stubbed |

### Basse priorité

| # | Feature | Valeur | Effort | Notes |
|---|---|---|---|---|
| 6 | **Podman support** | Compatibilité sans Docker | Moyen | Dépend de l'abstraction engine |
| 7 | **Multi-host hub UI** | Centraliser N agents dans une UI | Très élevé | Dépend de #5 |
| 8 | **mTLS agent ↔ hub** | Sécurité du canal agent | Élevé | Dépend de #5 |

---

## Next up

Start with **#1 Tests**, then cut a release (`v0.1.0` tag triggers CI automatically).
