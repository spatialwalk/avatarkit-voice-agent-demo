"""ASR / LLM / TTS pipeline functions — provider-agnostic via URL + API key."""

from __future__ import annotations

import httpx

from app.config import Settings


async def run_asr(settings: Settings, audio_bytes: bytes) -> str:
    """Transcribe audio using Deepgram (or compatible ASR API)."""
    base = settings.asr_base_url.rstrip("/")
    sample_rate = settings.user_input_sample_rate
    endpoint = (
        f"{base}/v1/listen"
        f"?model={settings.asr_model}"
        f"&language={settings.asr_language}"
        f"&encoding=linear16"
        f"&sample_rate={sample_rate}"
        f"&channels=1"
    )

    async with httpx.AsyncClient(timeout=40.0) as client:
        resp = await client.post(
            endpoint,
            headers={
                "Authorization": f"Token {settings.asr_api_key}",
                "Content-Type": "application/octet-stream",
            },
            content=audio_bytes,
        )

    if resp.status_code >= 400:
        raise RuntimeError(f"ASR failed ({resp.status_code}): {resp.text}")

    transcript = (
        resp.json()
        .get("results", {})
        .get("channels", [{}])[0]
        .get("alternatives", [{}])[0]
        .get("transcript", "")
        .strip()
    )
    return transcript


async def run_llm(settings: Settings, user_text: str) -> str:
    """Chat completion using OpenAI-compatible API (OpenAI, Doubao, etc.)."""
    base = settings.llm_base_url.rstrip("/")

    async with httpx.AsyncClient(timeout=40.0) as client:
        resp = await client.post(
            f"{base}/chat/completions",
            headers={
                "Authorization": f"Bearer {settings.llm_api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": settings.llm_model,
                "messages": [
                    {"role": "system", "content": settings.llm_system_prompt},
                    {"role": "user", "content": user_text},
                ],
            },
        )

    if resp.status_code >= 400:
        raise RuntimeError(f"LLM failed ({resp.status_code}): {resp.text}")

    return (
        resp.json()
        .get("choices", [{}])[0]
        .get("message", {})
        .get("content", "")
        .strip()
    )


async def run_tts(settings: Settings, text: str) -> bytes:
    """Synthesize speech using Cartesia (or compatible TTS API)."""
    base = settings.tts_base_url.rstrip("/")

    async with httpx.AsyncClient(timeout=50.0) as client:
        resp = await client.post(
            f"{base}/tts/bytes",
            headers={
                "X-API-Key": settings.tts_api_key,
                "Cartesia-Version": "2024-06-10",
                "Content-Type": "application/json",
            },
            json={
                "model_id": settings.tts_model,
                "transcript": text,
                "voice": {"mode": "id", "id": settings.tts_voice},
                "output_format": {
                    "container": "raw",
                    "encoding": "pcm_s16le",
                    "sample_rate": settings.avatar_output_sample_rate,
                },
            },
        )

    if resp.status_code >= 400:
        raise RuntimeError(f"TTS failed ({resp.status_code}): {resp.text}")

    return resp.content
