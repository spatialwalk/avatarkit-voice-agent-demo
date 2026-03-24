package main

import (
	"bufio"
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"
)

type tokenRequest struct {
	AppID string `json:"appId"`
}

type tokenResponse struct {
	SessionToken string `json:"sessionToken"`
	ExpiredAt    string `json:"expiredAt"`
	Mock         bool   `json:"mock,omitempty"`
}

type envErrorResponse struct {
	Error           string            `json:"error"`
	Message         string            `json:"message"`
	MissingEnvFile  bool              `json:"missingEnvFile"`
	MissingKeys     []string          `json:"missingKeys"`
	PlaceholderKeys []string          `json:"placeholderKeys"`
	Docs            map[string]string `json:"docs"`
}

var envFileMissing bool

var envPlaceholderValues = map[string]struct{}{
	"your_spatialreal_api_key": {},
	"your_spatialreal_app_id":  {},
	"your_api_key":             {},
	"your_app_id":              {},
	"replace_me":               {},
}

var docsLinks = map[string]string{
	"keys": "https://docs.spatialreal.ai/overview/get-apikeys",
	"auth": "https://docs.spatialreal.ai/server/auth.md",
}

func main() {
	err := loadDotEnvWithErr(".env")
	envFileMissing = errors.Is(err, os.ErrNotExist)

	mux := http.NewServeMux()
	mux.HandleFunc("/health", healthHandler)
	mux.HandleFunc("/session-token", tokenHandler)

	port := getEnv("TOKEN_SERVER_PORT", "8090")
	log.Printf("sdk token go server listening on :%s", port)
	log.Fatal(http.ListenAndServe(":"+port, corsMiddleware(mux)))
}

func healthHandler(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func tokenHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "method_not_allowed"})
		return
	}

	var req tokenRequest
	_ = json.NewDecoder(r.Body).Decode(&req)

	if getBoolEnv("TOKEN_MOCK_MODE", false) {
		expiredAt := time.Now().UTC().Add(1 * time.Hour).Format(time.RFC3339)
		writeJSON(w, http.StatusOK, tokenResponse{SessionToken: "mock-session-token", ExpiredAt: expiredAt, Mock: true})
		return
	}

	appIDFromBody := strings.TrimSpace(req.AppID)
	appIDFromEnv := strings.TrimSpace(os.Getenv("SPATIALREAL_APP_ID"))
	apiKey := strings.TrimSpace(os.Getenv("SPATIALREAL_API_KEY"))

	missingKeys := make([]string, 0, 2)
	placeholderKeys := make([]string, 0, 2)

	if apiKey == "" {
		missingKeys = append(missingKeys, "SPATIALREAL_API_KEY")
	} else if isPlaceholder(apiKey) {
		placeholderKeys = append(placeholderKeys, "SPATIALREAL_API_KEY")
	}

	if appIDFromBody == "" {
		if appIDFromEnv == "" {
			missingKeys = append(missingKeys, "SPATIALREAL_APP_ID")
		} else if isPlaceholder(appIDFromEnv) {
			placeholderKeys = append(placeholderKeys, "SPATIALREAL_APP_ID")
		}
	}

	if envFileMissing || len(missingKeys) > 0 || len(placeholderKeys) > 0 {
		writeJSON(w, http.StatusInternalServerError, buildEnvError(missingKeys, placeholderKeys))
		return
	}

	appID := appIDFromBody
	if appID == "" {
		appID = appIDFromEnv
	}
	if appID == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "missing_app_id"})
		return
	}

	ttl := getIntEnv("SESSION_TOKEN_TTL_MINUTES", 55)
	expireAt := time.Now().Add(time.Duration(ttl) * time.Minute).Unix()

	endpoint := strings.TrimSuffix(getEnv("SPATIALREAL_CONSOLE_ENDPOINT", "https://console.spatialreal.ai/v1/console"), "/")
	url := endpoint + "/session-tokens"
	payload := map[string]any{
		"appId":     appID,
		"expire_at": expireAt,
	}

	body, _ := json.Marshal(payload)
	log.Printf("[session-token] POST %s", url)
	log.Printf("[session-token] request body: %s", string(body))

	reqHTTP, _ := http.NewRequest(http.MethodPost, url, bytes.NewReader(body))
	reqHTTP.Header.Set("Content-Type", "application/json")
	reqHTTP.Header.Set("X-Api-Key", apiKey)

	client := &http.Client{Timeout: 20 * time.Second}
	resp, err := client.Do(reqHTTP)
	if err != nil {
		log.Printf("[session-token] fetch error: %v", err)
		writeJSON(w, http.StatusBadGateway, map[string]string{"error": "session_token_request_failed", "detail": err.Error()})
		return
	}
	defer resp.Body.Close()

	raw, _ := io.ReadAll(resp.Body)
	log.Printf("[session-token] response status: %d", resp.StatusCode)
	log.Printf("[session-token] response body: %s", string(raw))

	if resp.StatusCode >= http.StatusBadRequest {
		writeJSON(w, http.StatusBadGateway, map[string]string{"error": "session_token_request_failed", "detail": string(raw)})
		return
	}

	var tokenPayload map[string]any
	if err := json.Unmarshal(raw, &tokenPayload); err != nil {
		writeJSON(w, http.StatusBadGateway, map[string]string{"error": "session_token_payload_invalid", "detail": err.Error()})
		return
	}

	token := extractToken(tokenPayload)
	if token == "" {
		log.Printf("[session-token] token not found in payload: %s", string(raw))
		writeJSON(w, http.StatusBadGateway, map[string]string{"error": "session_token_missing"})
		return
	}

	expiredAtISO := time.Unix(expireAt, 0).UTC().Format(time.RFC3339)
	log.Printf("[session-token] success, token length: %d", len(token))
	writeJSON(w, http.StatusOK, tokenResponse{SessionToken: token, ExpiredAt: expiredAtISO})
}

func extractToken(payload map[string]any) string {
	keys := []string{"sessionKey", "sessionToken", "token"}
	for _, key := range keys {
		if value, ok := payload[key].(string); ok && strings.TrimSpace(value) != "" {
			return value
		}
	}

	if nested, ok := payload["data"].(map[string]any); ok {
		for _, key := range keys {
			if value, ok := nested[key].(string); ok && strings.TrimSpace(value) != "" {
				return value
			}
		}
	}

	return ""
}

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}

func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		w.Header().Set("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func getEnv(key, fallback string) string {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return fallback
	}
	return value
}

func getBoolEnv(key string, fallback bool) bool {
	raw := strings.TrimSpace(strings.ToLower(os.Getenv(key)))
	if raw == "true" {
		return true
	}
	if raw == "false" {
		return false
	}
	return fallback
}

func getIntEnv(key string, fallback int) int {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return fallback
	}
	parsed, err := strconv.Atoi(value)
	if err != nil {
		return fallback
	}
	return parsed
}

func loadDotEnvWithErr(path string) error {
	file, err := os.Open(path)
	if err != nil {
		return err
	}
	defer file.Close()

	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}

		parts := strings.SplitN(line, "=", 2)
		if len(parts) != 2 {
			continue
		}

		key := strings.TrimSpace(parts[0])
		value := strings.TrimSpace(parts[1])
		value = strings.Trim(value, "\"'")
		if key == "" {
			continue
		}

		if _, exists := os.LookupEnv(key); exists {
			continue
		}
		if err := os.Setenv(key, value); err != nil {
			fmt.Printf("failed to set env %s: %v\n", key, err)
		}
	}

	if err := scanner.Err(); err != nil {
		return err
	}

	return nil
}

func isPlaceholder(value string) bool {
	_, ok := envPlaceholderValues[strings.ToLower(strings.TrimSpace(value))]
	return ok
}

func buildEnvError(missingKeys []string, placeholderKeys []string) envErrorResponse {
	return envErrorResponse{
		Error:           "invalid_server_env",
		Message:         "Invalid token server configuration: create .env and replace placeholder values.",
		MissingEnvFile:  envFileMissing,
		MissingKeys:     missingKeys,
		PlaceholderKeys: placeholderKeys,
		Docs:            docsLinks,
	}
}
