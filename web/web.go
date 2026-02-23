package web

import "embed"

// FS contains the embedded frontend build artifacts.
// Run `make build-web` (or `cd web && npm run build`) before `go build`.
//
//go:embed all:dist
var FS embed.FS
