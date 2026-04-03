"""Pure RTC token server without agent dispatch."""

# pyright: reportMissingImports=false

from __future__ import annotations

import asyncio
import os
from datetime import timedelta
from uuid import uuid4

from dotenv import load_dotenv
from flask import Flask, jsonify, request
from flask_cors import CORS
from livekit import api

load_dotenv()

app = Flask(__name__)
CORS(app)

LIVEKIT_API_KEY = os.getenv("LIVEKIT_API_KEY")
LIVEKIT_API_SECRET = os.getenv("LIVEKIT_API_SECRET")
LIVEKIT_URL = os.getenv("LIVEKIT_URL")


async def ensure_room(room_name: str):
    lkapi = api.LiveKitAPI(LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET)
    try:
        await lkapi.room.create_room(api.CreateRoomRequest(name=room_name))
    except Exception as exc:  # noqa: BLE001
        if "already exists" not in str(exc).lower():
            raise
    finally:
        await lkapi.aclose()


@app.get("/health")
def health():
    return jsonify({"status": "ok"})


@app.post("/token")
def issue_token():
    payload = request.get_json(silent=True) or {}

    room_name = payload.get("room", "pure-rtc-room")
    requested_identity = payload.get("identity")
    identity = (
        requested_identity.strip()
        if isinstance(requested_identity, str) and requested_identity.strip()
        else f"browser-{uuid4().hex[:8]}"
    )

    if not LIVEKIT_API_KEY or not LIVEKIT_API_SECRET or not LIVEKIT_URL:
        return jsonify({"error": "missing_livekit_env"}), 500

    try:
        asyncio.run(ensure_room(room_name))
    except Exception as exc:  # noqa: BLE001
        return jsonify({"error": f"create_room_failed: {exc}"}), 502

    token = (
        api.AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET)
        .with_identity(identity)
        .with_name(identity)
        .with_ttl(timedelta(hours=1))
        .with_grants(
            api.VideoGrants(
                room_join=True,
                room=room_name,
                can_publish=True,
                can_subscribe=True,
                can_publish_data=True,
            )
        )
    )

    return jsonify(
        {
            "token": token.to_jwt(),
            "url": LIVEKIT_URL,
            "room": room_name,
            "identity": identity,
        }
    )


if __name__ == "__main__":
    port = int(os.getenv("TOKEN_SERVER_PORT", "8081"))
    app.run(host="0.0.0.0", port=port, debug=True)
