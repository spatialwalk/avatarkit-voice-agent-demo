"""SDK mode token backend."""

# pyright: reportMissingImports=false

from __future__ import annotations

import logging
import os
import time as _time
from datetime import datetime, timedelta, timezone

import httpx
from dotenv import find_dotenv, load_dotenv
from flask import Flask, jsonify, request
from flask_cors import CORS

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s")

ENV_FILE_PATH = find_dotenv(filename=".env", usecwd=True)
ENV_FILE_MISSING = ENV_FILE_PATH == ""
if not ENV_FILE_MISSING:
    load_dotenv(ENV_FILE_PATH)

PLACEHOLDER_VALUES = {
    "your_spatialreal_api_key",
    "your_spatialreal_app_id",
    "your_api_key",
    "your_app_id",
    "replace_me",
}

DOCS_LINKS = {
    "keys": "https://docs.spatialreal.ai/overview/get-apikeys",
    "auth": "https://docs.spatialreal.ai/server/auth.md",
}

app = Flask(__name__)
CORS(app)


def _extract_token(data: dict) -> str | None:
    direct_keys = ("sessionKey", "sessionToken", "token")
    for key in direct_keys:
        if data.get(key):
            return data[key]

    nested = data.get("data")
    if isinstance(nested, dict):
        for key in direct_keys:
            if nested.get(key):
                return nested[key]
    return None


def _is_placeholder(value: str | None) -> bool:
    if not value:
        return False
    return value.strip().lower() in PLACEHOLDER_VALUES


def _build_env_error(missing_keys: list[str], placeholder_keys: list[str]):
    return {
        "error": "invalid_server_env",
        "message": "Invalid token server configuration: create .env and replace placeholder values.",
        "missingEnvFile": ENV_FILE_MISSING,
        "missingKeys": missing_keys,
        "placeholderKeys": placeholder_keys,
        "docs": DOCS_LINKS,
    }


@app.post("/session-token")
def issue_session_token():
    body = request.get_json(silent=True) or {}

    mock_mode = os.getenv("TOKEN_MOCK_MODE", "false").lower() == "true"
    if mock_mode:
        return jsonify(
            {
                "sessionToken": "mock-session-token",
                "expiredAt": (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat(),
                "mock": True,
            }
        )

    app_id_from_body = str(body.get("appId") or "").strip()
    app_id_from_env = os.getenv("SPATIALREAL_APP_ID", "").strip()
    api_key = os.getenv("SPATIALREAL_API_KEY", "").strip()

    missing_keys: list[str] = []
    placeholder_keys: list[str] = []

    if not api_key:
        missing_keys.append("SPATIALREAL_API_KEY")
    elif _is_placeholder(api_key):
        placeholder_keys.append("SPATIALREAL_API_KEY")

    if not app_id_from_body:
        if not app_id_from_env:
            missing_keys.append("SPATIALREAL_APP_ID")
        elif _is_placeholder(app_id_from_env):
            placeholder_keys.append("SPATIALREAL_APP_ID")

    if ENV_FILE_MISSING or missing_keys or placeholder_keys:
        return jsonify(_build_env_error(missing_keys, placeholder_keys)), 500

    app_id = app_id_from_body or app_id_from_env
    if not app_id:
        return jsonify({"error": "missing_app_id"}), 400

    console_endpoint = os.getenv(
        "SPATIALREAL_CONSOLE_ENDPOINT", "https://console.spatialreal.ai/v1/console"
    ).rstrip("/")
    ttl_minutes = int(os.getenv("SESSION_TOKEN_TTL_MINUTES", "55"))

    expire_at = int(_time.time()) + ttl_minutes * 60
    url = f"{console_endpoint}/session-tokens"
    request_body = {"appId": app_id, "expire_at": expire_at}

    logging.info("[session-token] POST %s", url)
    logging.info("[session-token] request body: %s", request_body)

    with httpx.Client(timeout=20.0) as client:
        response = client.post(
            url,
            headers={"X-Api-Key": api_key, "Content-Type": "application/json"},
            json=request_body,
        )

    logging.info("[session-token] response status: %d", response.status_code)
    logging.info("[session-token] response body: %s", response.text)

    if response.status_code >= 400:
        return jsonify({"error": "session_token_request_failed", "detail": response.text}), 502

    payload = response.json()
    token = _extract_token(payload)
    if not token:
        logging.error("[session-token] token not found in payload: %s", payload)
        return jsonify({"error": "session_token_missing", "payload": payload}), 502

    expired_at_iso = datetime.fromtimestamp(expire_at, tz=timezone.utc).isoformat()
    logging.info("[session-token] success, token length: %d", len(token))
    return jsonify({"sessionToken": token, "expiredAt": expired_at_iso})


@app.get("/health")
def health():
    return jsonify({"status": "ok"})


if __name__ == "__main__":
    port = int(os.getenv("TOKEN_SERVER_PORT", "8090"))
    app.run(host="0.0.0.0", port=port, debug=True)
