#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND_DIR="$SCRIPT_DIR/servers/python"
FRONTEND_DIR="$SCRIPT_DIR/clients/web/react"
ANDROID_DIR="$SCRIPT_DIR/clients/android"
IOS_DIR="$SCRIPT_DIR/clients/ios"
FLUTTER_DIR="$SCRIPT_DIR/clients/flutter"

SKIP_FRONTEND=false
if [ "$1" = "--no-frontend" ]; then
    SKIP_FRONTEND=true
fi

# --- Detect LAN IP ---
detect_lan_ip() {
    local ip=""
    if command -v ipconfig &>/dev/null; then
        ip=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || true)
    fi
    if [ -z "$ip" ] && command -v ip &>/dev/null; then
        ip=$(ip -4 route get 1.1.1.1 2>/dev/null | awk '{print $7; exit}' || true)
    fi
    if [ -z "$ip" ] && command -v hostname &>/dev/null; then
        ip=$(hostname -I 2>/dev/null | awk '{print $1}' || true)
    fi
    echo "${ip:-localhost}"
}

LAN_IP=$(detect_lan_ip)
BACKEND_PORT="${BACKEND_PORT:-8765}"
BACKEND_URL="http://${LAN_IP}:${BACKEND_PORT}"

echo ""
echo "=========================================="
echo "  Host Mode — Start Script"
echo "=========================================="
echo ""
echo "  LAN IP:       $LAN_IP"
echo "  Backend URL:  $BACKEND_URL"
echo ""

# --- Check backend .env ---
if [ ! -f "$BACKEND_DIR/.env" ]; then
    echo "[!] Backend .env not found. Copying from .env.example..."
    cp "$BACKEND_DIR/.env.example" "$BACKEND_DIR/.env"
    echo "    Please edit $BACKEND_DIR/.env with your API keys, then re-run."
    echo ""
    exit 1
fi

# --- Read SPATIALREAL_APP_ID from backend .env ---
SPATIALREAL_APP_ID=$(grep "^SPATIALREAL_APP_ID=" "$BACKEND_DIR/.env" | cut -d'=' -f2 | tr -d ' ')
if [ -z "$SPATIALREAL_APP_ID" ] || [ "$SPATIALREAL_APP_ID" = "your_spatialreal_app_id" ]; then
    echo "[!] SPATIALREAL_APP_ID not configured in $BACKEND_DIR/.env"
    echo "    Please edit .env and set your App ID, then re-run."
    exit 1
fi
echo "  App ID:       $SPATIALREAL_APP_ID"

# --- Write config to Android local.properties ---
if [ -d "$ANDROID_DIR" ]; then
    ANDROID_PROPS="$ANDROID_DIR/local.properties"
    if [ ! -f "$ANDROID_PROPS" ] && [ -f "$ANDROID_DIR/local.properties.example" ]; then
        cp "$ANDROID_DIR/local.properties.example" "$ANDROID_PROPS"
    fi
    if [ -f "$ANDROID_PROPS" ]; then
        # HOST_SERVER_URL
        if grep -q "^HOST_SERVER_URL=" "$ANDROID_PROPS"; then
            sed -i.bak "s|^HOST_SERVER_URL=.*|HOST_SERVER_URL=http://${LAN_IP}:${BACKEND_PORT}|" "$ANDROID_PROPS"
        else
            echo "HOST_SERVER_URL=http://${LAN_IP}:${BACKEND_PORT}" >> "$ANDROID_PROPS"
        fi
        # SPATIALREAL_APP_ID
        if grep -q "^SPATIALREAL_APP_ID=" "$ANDROID_PROPS"; then
            sed -i.bak "s|^SPATIALREAL_APP_ID=.*|SPATIALREAL_APP_ID=${SPATIALREAL_APP_ID}|" "$ANDROID_PROPS"
        else
            echo "SPATIALREAL_APP_ID=${SPATIALREAL_APP_ID}" >> "$ANDROID_PROPS"
        fi
        rm -f "${ANDROID_PROPS}.bak"
        echo "[+] Android: HOST_SERVER_URL=http://${LAN_IP}:${BACKEND_PORT}, APP_ID=${SPATIALREAL_APP_ID}"
    fi
fi

# --- Write config to iOS Config.swift ---
if [ -d "$IOS_DIR" ]; then
    IOS_CONFIG="$IOS_DIR/AvatarDemo/Config.swift"
    if [ -f "$IOS_CONFIG" ]; then
        sed -i.bak "s|static let hostServerURL = \".*\"|static let hostServerURL = \"http://${LAN_IP}:${BACKEND_PORT}\"|" "$IOS_CONFIG"
        sed -i.bak "s|static let appID = \".*\"|static let appID = \"${SPATIALREAL_APP_ID}\"|" "$IOS_CONFIG"
        rm -f "${IOS_CONFIG}.bak"
        echo "[+] iOS: hostServerURL=http://${LAN_IP}:${BACKEND_PORT}, appID=${SPATIALREAL_APP_ID}"
    fi
fi

# --- Write config to Flutter lib/config.dart ---
if [ -d "$FLUTTER_DIR" ]; then
    FLUTTER_CONFIG="$FLUTTER_DIR/lib/config.dart"
    if [ -f "$FLUTTER_CONFIG" ]; then
        sed -i.bak "s|static const String hostServerURL = '.*'|static const String hostServerURL = 'http://${LAN_IP}:${BACKEND_PORT}'|" "$FLUTTER_CONFIG"
        sed -i.bak "s|static const String appID = '.*'|static const String appID = '${SPATIALREAL_APP_ID}'|" "$FLUTTER_CONFIG"
        rm -f "${FLUTTER_CONFIG}.bak"
        echo "[+] Flutter: hostServerURL=http://${LAN_IP}:${BACKEND_PORT}, appID=${SPATIALREAL_APP_ID}"
    fi
fi

echo ""

# --- Start backend ---
echo "Starting backend..."
cd "$BACKEND_DIR"

if ! command -v uv &>/dev/null; then
    echo "[!] 'uv' not found. Install it: https://docs.astral.sh/uv/"
    exit 1
fi

uv sync --quiet 2>/dev/null || true
uv run uvicorn app.main:app --host 0.0.0.0 --port "$BACKEND_PORT" &
BACKEND_PID=$!

echo "  Waiting for backend..."
for i in $(seq 1 30); do
    if curl -sf "http://localhost:${BACKEND_PORT}/healthz" >/dev/null 2>&1; then
        echo "  Backend ready at http://0.0.0.0:${BACKEND_PORT}"
        break
    fi
    sleep 1
done

# --- Optionally start frontend ---
FRONTEND_PID=""
if [ "$SKIP_FRONTEND" = false ]; then
    if [ ! -f "$FRONTEND_DIR/.env" ]; then
        cp "$FRONTEND_DIR/.env.example" "$FRONTEND_DIR/.env" 2>/dev/null || true
    fi

    echo "Starting frontend..."
    cd "$FRONTEND_DIR"

    if command -v pnpm &>/dev/null; then
        pnpm install --silent 2>/dev/null || true
        pnpm dev &
        FRONTEND_PID=$!
    else
        echo "[!] 'pnpm' not found, skipping frontend. Install: npm install -g pnpm"
    fi
fi

echo ""
echo "=========================================="
echo "  Ready!"
echo "=========================================="
echo ""
echo "  Backend API:  http://localhost:${BACKEND_PORT}"
if [ -n "$FRONTEND_PID" ]; then
    echo "  Web client:   http://localhost:3002"
fi
echo ""
echo "  Mobile (same network):"
echo "  Backend URL:  ${BACKEND_URL}"
echo "  Android:      HOST_SERVER_URL already configured"
echo "  iOS:          hostServerURL already configured"
echo "  Flutter:      hostServerURL already configured"
echo ""
echo "  Open Android Studio / Xcode and build & run."
echo "  Flutter: cd clients/flutter && flutter run"
echo "  Press Ctrl+C to stop."
echo ""

# --- Cleanup on exit ---
cleanup() {
    echo ""
    echo "Shutting down..."
    kill $BACKEND_PID 2>/dev/null
    [ -n "$FRONTEND_PID" ] && kill $FRONTEND_PID 2>/dev/null
    wait $BACKEND_PID 2>/dev/null
    [ -n "$FRONTEND_PID" ] && wait $FRONTEND_PID 2>/dev/null
    echo "Done."
}

trap cleanup EXIT INT TERM
wait
