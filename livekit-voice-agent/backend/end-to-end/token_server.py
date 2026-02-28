"""
Token Server for LiveKit Voice Agent

Provides JWT tokens for frontend clients to connect to LiveKit rooms.
"""

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

# LiveKit credentials
LIVEKIT_API_KEY = os.getenv("LIVEKIT_API_KEY")
LIVEKIT_API_SECRET = os.getenv("LIVEKIT_API_SECRET")
LIVEKIT_URL = os.getenv("LIVEKIT_URL")


async def create_room_and_dispatch_agent(room_name: str):
    """Create room and dispatch an agent to it."""
    lkapi = api.LiveKitAPI(LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET)

    try:
        room = await lkapi.room.create_room(api.CreateRoomRequest(name=room_name))
        print(f"Room created/exists: {room.name}, sid: {room.sid}")

        dispatch = await lkapi.agent_dispatch.create_dispatch(
            api.CreateAgentDispatchRequest(room=room_name, agent_name="voice-assistant")
        )
        print(f"Agent dispatch created: {dispatch}")
    finally:
        await lkapi.aclose()


@app.route("/token", methods=["POST"])
def generate_token():
    """Generate a LiveKit access token for a participant."""
    data = request.get_json() or {}

    room_name = data.get("room", "voice-agent-room")
    requested_identity = data.get("identity")
    participant_identity = (
        requested_identity.strip()
        if isinstance(requested_identity, str) and requested_identity.strip()
        else f"browser-{uuid4().hex[:8]}"
    )

    if not LIVEKIT_API_KEY or not LIVEKIT_API_SECRET:
        return jsonify({"error": "LiveKit credentials not configured"}), 500

    token = (
        api.AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET)
        .with_identity(participant_identity)
        .with_name(participant_identity)
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

    jwt_token = token.to_jwt()

    try:
        asyncio.run(create_room_and_dispatch_agent(room_name))
        print(f"Successfully dispatched agent to room: {room_name}")
    except Exception as exc:
        import traceback

        print(f"Warning: Failed to dispatch agent: {exc}")
        traceback.print_exc()

    return jsonify(
        {
            "token": jwt_token,
            "room": room_name,
            "identity": participant_identity,
            "url": os.getenv("LIVEKIT_URL"),
        }
    )


@app.route("/health", methods=["GET"])
def health_check():
    """Health check endpoint."""
    return jsonify({"status": "ok"})


if __name__ == "__main__":
    port = int(os.getenv("TOKEN_SERVER_PORT", 8080))
    print(f"Token server running on http://localhost:{port}")
    app.run(host="0.0.0.0", port=port, debug=True)
