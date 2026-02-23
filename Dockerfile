# ─────────────────────────────────────────────────────────────
# Stage 1 — Build frontend
# ─────────────────────────────────────────────────────────────
FROM node:22-alpine AS frontend

WORKDIR /app
COPY web/package.json web/package-lock.json ./
RUN npm ci --prefer-offline
COPY web/ ./
RUN npm run build

# ─────────────────────────────────────────────────────────────
# Stage 2 — Build Go binary (with embedded frontend)
# ─────────────────────────────────────────────────────────────
FROM golang:1.24-alpine AS builder

WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download

COPY . .
# Inject the built frontend so go:embed picks it up
COPY --from=frontend /app/dist ./web/dist

RUN CGO_ENABLED=0 GOOS=linux go build \
    -ldflags="-s -w" \
    -o ctopia \
    ./cmd/hub

# ─────────────────────────────────────────────────────────────
# Stage 3 — Minimal runtime image
# ─────────────────────────────────────────────────────────────
FROM alpine:3.21

# ca-certificates: HTTPS pulls / TLS
# docker-cli: required for `docker compose` commands
RUN apk add --no-cache ca-certificates docker-cli docker-cli-compose

WORKDIR /app
COPY --from=builder /app/ctopia .

# /data  — persistent data (auth.json, settings.json)
# config is mounted by the user at runtime
VOLUME ["/app/data"]

EXPOSE 8080

CMD ["./ctopia"]
