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

LIVEKIT_URL = os.getenv("LIVEKIT_URL")
LIVEKIT_API_KEY = os.getenv("LIVEKIT_API_KEY")
LIVEKIT_API_SECRET = os.getenv("LIVEKIT_API_SECRET")


async def create_room_and_dispatch(room_name: str) -> None:
    lkapi = api.LiveKitAPI(LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET)
    try:
        try:
            await lkapi.room.create_room(api.CreateRoomRequest(name=room_name))
        except Exception:
            # Room may already exist.
            pass

        await lkapi.agent_dispatch.create_dispatch(
            api.CreateAgentDispatchRequest(room=room_name, agent_name="voice-assistant")
        )
    finally:
        await lkapi.aclose()


@app.route("/token", methods=["POST"])
def token():
    if not LIVEKIT_API_KEY or not LIVEKIT_API_SECRET:
        return jsonify({"error": "LiveKit credentials not configured"}), 500

    body = request.get_json() or {}
    room_name = body.get("room", "voice-agent-room")
    requested_identity = body.get("identity")
    identity = (
        requested_identity.strip()
        if isinstance(requested_identity, str) and requested_identity.strip()
        else f"browser-{uuid4().hex[:8]}"
    )

    jwt = (
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
        .to_jwt()
    )

    try:
        asyncio.run(create_room_and_dispatch(room_name))
    except Exception as exc:
        # Keep returning token so frontend can still connect for debugging.
        print(f"Warning: Failed to dispatch agent: {exc}")

    return jsonify(
        {
            "token": jwt,
            "url": LIVEKIT_URL,
            "room": room_name,
            "identity": identity,
        }
    )


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8080, debug=True)
