package api

import (
	"net"
	"net/http"
	"strings"
	"sync"
	"time"
)

const (
	rateLimitMax    = 5
	rateLimitWindow = time.Minute
)

type rateLimiter struct {
	mu      sync.Mutex
	buckets map[string][]time.Time
}

func newRateLimiter() *rateLimiter {
	rl := &rateLimiter{buckets: make(map[string][]time.Time)}
	go rl.gc()
	return rl
}

// allow returns true if the IP has not exceeded the rate limit.
func (rl *rateLimiter) allow(ip string) bool {
	now := time.Now()
	cutoff := now.Add(-rateLimitWindow)
	rl.mu.Lock()
	defer rl.mu.Unlock()

	times := rl.buckets[ip]
	// Slide window: discard attempts older than the window.
	valid := times[:0]
	for _, t := range times {
		if t.After(cutoff) {
			valid = append(valid, t)
		}
	}
	if len(valid) >= rateLimitMax {
		rl.buckets[ip] = valid
		return false
	}
	rl.buckets[ip] = append(valid, now)
	return true
}

// middleware wraps an HTTP handler with per-IP rate limiting.
func (rl *rateLimiter) middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !rl.allow(clientIP(r)) {
			http.Error(w, "too many requests — try again in a minute", http.StatusTooManyRequests)
			return
		}
		next.ServeHTTP(w, r)
	})
}

// gc periodically removes stale buckets to prevent unbounded memory growth.
func (rl *rateLimiter) gc() {
	ticker := time.NewTicker(5 * time.Minute)
	defer ticker.Stop()
	for range ticker.C {
		cutoff := time.Now().Add(-rateLimitWindow)
		rl.mu.Lock()
		for ip, times := range rl.buckets {
			valid := times[:0]
			for _, t := range times {
				if t.After(cutoff) {
					valid = append(valid, t)
				}
			}
			if len(valid) == 0 {
				delete(rl.buckets, ip)
			} else {
				rl.buckets[ip] = valid
			}
		}
		rl.mu.Unlock()
	}
}

// clientIP extracts the real client IP from the request, respecting
// X-Real-IP and X-Forwarded-For headers set by reverse proxies.
func clientIP(r *http.Request) string {
	if v := r.Header.Get("X-Real-IP"); v != "" {
		return strings.TrimSpace(v)
	}
	if v := r.Header.Get("X-Forwarded-For"); v != "" {
		// May be comma-separated — take the leftmost (client) address.
		if idx := strings.IndexByte(v, ','); idx >= 0 {
			v = v[:idx]
		}
		return strings.TrimSpace(v)
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}
