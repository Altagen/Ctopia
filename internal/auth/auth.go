package auth

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"
	"unicode"

	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"

	"ctopia/internal/config"
)

type Service struct {
	cfg      *config.Config
	dataPath string
	store    *authStore
}

type authStore struct {
	PasswordHash  string `json:"password_hash"`
	JWTSecret     string `json:"jwt_secret"`
	SetupComplete bool   `json:"setup_complete"`
}

type Claims struct {
	jwt.RegisteredClaims
	Role string `json:"role"`
}

func NewService(cfg *config.Config) (*Service, error) {
	s := &Service{
		cfg:      cfg,
		dataPath: filepath.Join(cfg.DataDir, "auth.json"),
	}
	if err := s.load(); err != nil {
		return nil, err
	}
	return s, nil
}

func (s *Service) IsSetupComplete() bool {
	return s.store != nil && s.store.SetupComplete
}

// ValidatePasswordStrength checks password requirements based on the strict flag.
// Strict mode (default): 12+ chars, uppercase, lowercase, digit, special character.
// Non-strict mode: 4+ chars minimum (for local dev/test environments only).
func ValidatePasswordStrength(password string, strict bool) error {
	if strict {
		if len(password) < 12 {
			return errors.New("password must be at least 12 characters")
		}
		var hasUpper, hasLower, hasDigit, hasSpecial bool
		for _, c := range password {
			switch {
			case unicode.IsUpper(c):
				hasUpper = true
			case unicode.IsLower(c):
				hasLower = true
			case unicode.IsDigit(c):
				hasDigit = true
			case !unicode.IsLetter(c) && !unicode.IsDigit(c):
				hasSpecial = true
			}
		}
		var missing []string
		if !hasUpper {
			missing = append(missing, "uppercase letter")
		}
		if !hasLower {
			missing = append(missing, "lowercase letter")
		}
		if !hasDigit {
			missing = append(missing, "number")
		}
		if !hasSpecial {
			missing = append(missing, "special character")
		}
		if len(missing) > 0 {
			return fmt.Errorf("password must contain: %s", strings.Join(missing, ", "))
		}
		return nil
	}
	// Non-strict: bare minimum to avoid empty/trivially broken passwords
	if len(password) < 4 {
		return errors.New("password must be at least 4 characters")
	}
	return nil
}

func (s *Service) Setup(password string) (string, error) {
	if s.store != nil && s.store.SetupComplete {
		return "", errors.New("already configured")
	}

	if err := ValidatePasswordStrength(password, s.cfg.Auth.Strict); err != nil {
		return "", err
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return "", fmt.Errorf("hashing password: %w", err)
	}

	secret, err := generateSecret()
	if err != nil {
		return "", fmt.Errorf("generating secret: %w", err)
	}

	s.store = &authStore{
		PasswordHash:  string(hash),
		JWTSecret:     secret,
		SetupComplete: true,
	}

	if err := s.save(); err != nil {
		return "", err
	}

	return s.issueToken()
}

func (s *Service) ChangePassword(current, newPwd string) (string, error) {
	if s.store == nil || !s.store.SetupComplete {
		return "", errors.New("not configured")
	}

	if err := bcrypt.CompareHashAndPassword([]byte(s.store.PasswordHash), []byte(current)); err != nil {
		return "", errors.New("invalid current password")
	}

	if err := ValidatePasswordStrength(newPwd, s.cfg.Auth.Strict); err != nil {
		return "", err
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(newPwd), bcrypt.DefaultCost)
	if err != nil {
		return "", fmt.Errorf("hashing password: %w", err)
	}

	// Rotate JWT secret to invalidate all existing sessions.
	secret, err := generateSecret()
	if err != nil {
		return "", fmt.Errorf("generating secret: %w", err)
	}

	s.store.PasswordHash = string(hash)
	s.store.JWTSecret = secret

	if err := s.save(); err != nil {
		return "", err
	}

	return s.issueToken()
}

func (s *Service) Login(password string) (string, error) {
	if s.store == nil || !s.store.SetupComplete {
		return "", errors.New("not configured")
	}

	if err := bcrypt.CompareHashAndPassword([]byte(s.store.PasswordHash), []byte(password)); err != nil {
		return "", errors.New("invalid password")
	}

	return s.issueToken()
}

func (s *Service) ValidateToken(tokenStr string) error {
	if s.store == nil {
		return errors.New("not configured")
	}

	token, err := jwt.ParseWithClaims(tokenStr, &Claims{}, func(t *jwt.Token) (interface{}, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", t.Header["alg"])
		}
			return s.jwtSecret(), nil
	})
	if err != nil {
		return err
	}
	if !token.Valid {
		return errors.New("invalid token")
	}
	return nil
}

func (s *Service) issueToken() (string, error) {
	claims := Claims{
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(30 * 24 * time.Hour)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
		},
		Role: "admin",
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString(s.jwtSecret())
}

// jwtSecret returns the JWT signing key.
// Priority: CTOPIA_JWT_SECRET env var, then the stored secret in auth.json.
func (s *Service) jwtSecret() []byte {
	if v := os.Getenv("CTOPIA_JWT_SECRET"); v != "" {
		return []byte(v)
	}
	return []byte(s.store.JWTSecret)
}

func (s *Service) load() error {
	if err := os.MkdirAll(s.cfg.DataDir, 0700); err != nil {
		return fmt.Errorf("creating data dir: %w", err)
	}

	data, err := os.ReadFile(s.dataPath)
	if err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return fmt.Errorf("reading auth store: %w", err)
	}

	s.store = &authStore{}
	return json.Unmarshal(data, s.store)
}

func (s *Service) save() error {
	data, err := json.MarshalIndent(s.store, "", "  ")
	if err != nil {
		return fmt.Errorf("marshaling auth store: %w", err)
	}
	return os.WriteFile(s.dataPath, data, 0600)
}

func generateSecret() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}
