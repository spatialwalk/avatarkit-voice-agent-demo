"""Host mode backend: ASR -> LLM -> TTS + Avatar Host Bridge."""

# pyright: reportMissingImports=false

from __future__ import annotations

import asyncio
import base64
import os
from datetime import datetime, timedelta, timezone
from typing import Optional

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

load_dotenv()

try:
    from avatarkit import new_avatar_session
except Exception:  # noqa: BLE001
    new_avatar_session = None


class PipelineRequest(BaseModel):
    input_text: Optional[str] = None
    input_audio_base64: Optional[str] = None
    input_audio_mime: str = "audio/webm"


class SessionTokenRequest(BaseModel):
    appId: Optional[str] = None


app = FastAPI(title="Host Pipeline Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _required_env(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        raise HTTPException(status_code=500, detail=f"missing_env:{name}")
    return value


def _optional_env(name: str, default: str = "") -> str:
    value = os.getenv(name, "").strip()
    return value or default


def _extract_session_token(payload: dict) -> Optional[str]:
    for key in ("sessionKey", "sessionToken", "token"):
        if payload.get(key):
            return payload[key]
    if isinstance(payload.get("data"), dict):
        data = payload["data"]
        for key in ("sessionKey", "sessionToken", "token"):
            if data.get(key):
                return data[key]
    return None


async def run_asr_deepgram(audio_bytes: bytes, mime_type: str) -> str:
    api_key = _required_env("DEEPGRAM_API_KEY")
    model = _optional_env("DEEPGRAM_MODEL", "nova-3")
    language = _optional_env("DEEPGRAM_LANGUAGE", "en-US")
    endpoint = f"https://api.deepgram.com/v1/listen?model={model}&language={language}"

    async with httpx.AsyncClient(timeout=40.0) as client:
        response = await client.post(
            endpoint,
            headers={
                "Authorization": f"Token {api_key}",
                "Content-Type": mime_type,
            },
            content=audio_bytes,
        )

    if response.status_code >= 400:
        raise HTTPException(status_code=502, detail=f"asr_failed:{response.text}")

    payload = response.json()
    transcript = (
        payload.get("results", {})
        .get("channels", [{}])[0]
        .get("alternatives", [{}])[0]
        .get("transcript", "")
        .strip()
    )

    if not transcript:
        raise HTTPException(status_code=422, detail="asr_empty_transcript")
    return transcript


async def run_llm_openai(user_text: str) -> str:
    api_key = _required_env("LLM_API_KEY")
    model = _optional_env("LLM_MODEL", "gpt-4o-mini")
    base_url = _optional_env("LLM_BASE_URL", "https://api.openai.com/v1")

    async with httpx.AsyncClient(timeout=40.0) as client:
        response = await client.post(
            f"{base_url.rstrip('/')}/chat/completions",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": model,
                "messages": [
                    {
                        "role": "system",
                        "content": "You are concise and natural for spoken avatar conversations.",
                    },
                    {"role": "user", "content": user_text},
                ],
            },
        )

    if response.status_code >= 400:
        raise HTTPException(status_code=502, detail=f"llm_failed:{response.text}")

    payload = response.json()
    reply = payload.get("choices", [{}])[0].get("message", {}).get("content", "").strip()
    if not reply:
        raise HTTPException(status_code=502, detail="llm_empty_reply")
    return reply


async def run_tts_cartesia(text: str) -> bytes:
    api_key = _required_env("CARTESIA_API_KEY")
    model = _optional_env("CARTESIA_MODEL", "sonic-2")
    voice = _optional_env("CARTESIA_VOICE", "f786b574-daa5-4673-aa0c-cbe3e8534c02")

    payload = {
        "model_id": model,
        "transcript": text,
        "voice": {"mode": "id", "id": voice},
        "output_format": {
            "container": "raw",
            "encoding": "pcm_s16le",
            "sample_rate": 16000,
        },
    }

    async with httpx.AsyncClient(timeout=50.0) as client:
        response = await client.post(
            "https://api.cartesia.ai/tts/bytes",
            headers={
                "X-API-Key": api_key,
                "Cartesia-Version": "2024-06-10",
                "Content-Type": "application/json",
            },
            json=payload,
        )

    if response.status_code >= 400:
        raise HTTPException(status_code=502, detail=f"tts_failed:{response.text}")

    return response.content


async def generate_host_frames(audio_pcm16: bytes) -> list[str]:
    bridge_enabled = _optional_env("HOST_ENABLE_AVATAR_BRIDGE", "true").lower() == "true"
    if not bridge_enabled:
        return []

    if new_avatar_session is None:
        return []

    api_key = _optional_env("SPATIALREAL_API_KEY")
    app_id = _optional_env("SPATIALREAL_APP_ID")
    avatar_id = _optional_env("SPATIALREAL_AVATAR_ID")
    console_endpoint = _optional_env("SPATIALREAL_CONSOLE_ENDPOINT")
    ingress_endpoint = _optional_env("SPATIALREAL_INGRESS_ENDPOINT")

    if not all([api_key, app_id, avatar_id, console_endpoint, ingress_endpoint]):
        return []

    loop = asyncio.get_running_loop()
    done = asyncio.Event()
    errors: list[Exception] = []
    frames: list[str] = []
    got_last = False

    def transport_frames(frame: bytes, last: bool):
        nonlocal got_last
        frames.append(base64.b64encode(bytes(frame)).decode("utf-8"))
        if last:
            got_last = True
            loop.call_soon_threadsafe(done.set)

    def on_error(error: Exception):
        errors.append(error)
        loop.call_soon_threadsafe(done.set)

    def on_close():
        if not got_last:
            loop.call_soon_threadsafe(done.set)

    session = new_avatar_session(
        api_key=api_key,
        app_id=app_id,
        avatar_id=avatar_id,
        console_endpoint_url=console_endpoint,
        ingress_endpoint_url=ingress_endpoint,
        expire_at=datetime.now(timezone.utc) + timedelta(minutes=3),
        sample_rate=16000,
        transport_frames=transport_frames,
        on_error=on_error,
        on_close=on_close,
    )

    try:
        await session.init()
        await session.start()
        await session.send_audio(audio_pcm16, end=True)
        await asyncio.wait_for(done.wait(), timeout=45.0)
    except Exception:
        return []
    finally:
        try:
            await session.close()
        except Exception:
            pass

    if errors:
        return []
    return frames


@app.get("/healthz")
async def healthz():
    return {"status": "ok"}


@app.post("/session-token")
async def issue_session_token(body: SessionTokenRequest):
    mock_mode = _optional_env("TOKEN_MOCK_MODE", "false").lower() == "true"
    app_id = body.appId or _optional_env("SPATIALREAL_APP_ID")
    if not app_id:
        raise HTTPException(status_code=400, detail="missing_app_id")

    if mock_mode:
        return {
            "sessionToken": "mock-session-token",
            "expiredAt": (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat(),
            "mock": True,
        }

    api_key = _required_env("SPATIALREAL_API_KEY")
    console_endpoint = _optional_env(
        "SPATIALREAL_CONSOLE_ENDPOINT", "https://console.spatialreal.ai/v1/console"
    ).rstrip("/")

    expired_at = datetime.now(timezone.utc) + timedelta(minutes=55)

    async with httpx.AsyncClient(timeout=20.0) as client:
        response = await client.post(
            f"{console_endpoint}/session-tokens",
            headers={"X-Api-Key": api_key, "Content-Type": "application/json"},
            json={
                "appId": app_id,
                "expiredAt": expired_at.isoformat().replace("+00:00", "Z"),
            },
        )

    if response.status_code >= 400:
        raise HTTPException(status_code=502, detail=f"session_token_failed:{response.text}")

    payload = response.json()
    token = _extract_session_token(payload)
    if not token:
        raise HTTPException(status_code=502, detail=f"session_token_missing:{payload}")

    return {"sessionToken": token, "expiredAt": expired_at.isoformat()}


@app.post("/pipeline/respond")
async def pipeline_respond(body: PipelineRequest):
    if not body.input_text and not body.input_audio_base64:
        raise HTTPException(status_code=400, detail="missing_input")

    transcript = body.input_text.strip() if body.input_text else ""

    if not transcript and body.input_audio_base64:
        try:
            audio_bytes = base64.b64decode(body.input_audio_base64)
        except Exception as exc:
            raise HTTPException(status_code=400, detail=f"invalid_audio_base64:{exc}") from exc
        transcript = await run_asr_deepgram(audio_bytes, body.input_audio_mime)

    reply = await run_llm_openai(transcript)
    audio_pcm16 = await run_tts_cartesia(reply)
    frames = await generate_host_frames(audio_pcm16)

    return {
        "transcript": transcript,
        "reply": reply,
        "audioPcm16Base64": base64.b64encode(audio_pcm16).decode("utf-8"),
        "audioSampleRate": 16000,
        "frameMessagesBase64": frames,
    }
