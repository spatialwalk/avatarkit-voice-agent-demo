"""WebSocket session: receives mic audio / text, runs ASR → LLM → TTS, drives avatar."""

from __future__ import annotations

import asyncio
import base64
import contextlib
import json
import logging
from typing import Any
from uuid import uuid4

from fastapi import WebSocket
from fastapi.websockets import WebSocketDisconnect

from app.avatar.turn import AvatarTurn, AvatarTurnEvent
from app.config import Settings
from app.pipeline import run_asr, run_llm, run_tts


logger = logging.getLogger(__name__)


class BrowserSession:
    def __init__(self, websocket: WebSocket, settings: Settings) -> None:
        self._websocket = websocket
        self._settings = settings
        self._send_lock = asyncio.Lock()
        self._avatar_turn: AvatarTurn | None = None
        self._avatar_turn_task: asyncio.Task[None] | None = None
        self._active_turn_id: str | None = None
        self._client_avatar_id: str | None = None
        self._audio_buffer = bytearray()
        self._pipeline_task: asyncio.Task[None] | None = None

    async def run(self) -> None:
        await self._websocket.accept()
        await self._send(
            {
                "type": "ready",
                "sessionId": str(uuid4()),
                "avatar": self._settings.public_avatar_config,
            }
        )

        try:
            while True:
                payload = await self._websocket.receive_json()
                await self._handle_client_message(payload)
        except WebSocketDisconnect:
            logger.info("browser websocket disconnected")
        finally:
            await self.close()

    async def close(self) -> None:
        if self._pipeline_task is not None:
            self._pipeline_task.cancel()
            self._pipeline_task = None
        await self._close_avatar_turn()

    async def _handle_client_message(self, payload: dict[str, Any]) -> None:
        kind = payload.get("type")
        logger.info("Client message: %s", kind)

        if kind == "ping":
            await self._send({"type": "pong"})

        elif kind == "set_avatar":
            avatar_id = str(payload.get("avatarId", "")).strip()
            if avatar_id:
                self._client_avatar_id = avatar_id
                await self._send_status(f"Avatar ID set to: {avatar_id}")

        elif kind == "text_query":
            text = str(payload.get("text", "")).strip()
            if text:
                await self._send_status(f"Received text: {text}")
                self._pipeline_task = asyncio.create_task(
                    self._run_text_pipeline(text)
                )

        elif kind == "mic_audio":
            audio_b64 = str(payload.get("audio", ""))
            if audio_b64:
                self._audio_buffer.extend(base64.b64decode(audio_b64))

        elif kind == "mic_end":
            if self._audio_buffer:
                audio = bytes(self._audio_buffer)
                self._audio_buffer.clear()
                self._pipeline_task = asyncio.create_task(
                    self._run_voice_pipeline(audio)
                )
            await self._send_status("Microphone stream paused")

        elif kind == "interrupt":
            await self._interrupt_current_turn(reason="client_interrupt")

        else:
            await self._send(
                {"type": "error", "message": f"Unsupported message: {kind}"}
            )

    # ── Pipelines ─────────────────────────────────────────────────

    async def _run_text_pipeline(self, text: str) -> None:
        """Text → LLM → TTS → Avatar."""
        try:
            await self._send(
                {"type": "agent_event", "event": "asr_final", "text": text}
            )

            reply = await run_llm(self._settings, text)
            await self._send(
                {"type": "agent_event", "event": "llm_text", "text": reply}
            )

            audio_pcm = await run_tts(self._settings, reply)
            await self._deliver_audio_to_avatar(audio_pcm)

        except Exception as e:
            logger.error("Text pipeline failed: %s", e)
            await self._send({"type": "error", "message": str(e)})

    async def _run_voice_pipeline(self, audio: bytes) -> None:
        """Mic audio → ASR → LLM → TTS → Avatar."""
        try:
            transcript = await run_asr(self._settings, audio)
            if not transcript:
                await self._send_status("ASR returned empty transcript")
                return

            await self._send(
                {"type": "agent_event", "event": "asr_final", "text": transcript}
            )

            reply = await run_llm(self._settings, transcript)
            await self._send(
                {"type": "agent_event", "event": "llm_text", "text": reply}
            )

            audio_pcm = await run_tts(self._settings, reply)
            await self._deliver_audio_to_avatar(audio_pcm)

        except Exception as e:
            logger.error("Voice pipeline failed: %s", e)
            await self._send({"type": "error", "message": str(e)})

    async def _deliver_audio_to_avatar(self, audio_pcm: bytes) -> None:
        """Send TTS audio through Avatar Host Bridge and forward frames to client."""
        await self._close_avatar_turn()
        turn_id = str(uuid4())

        # Send audio to client
        await self._send(
            {
                "type": "avatar_audio",
                "turnId": turn_id,
                "audio": base64.b64encode(audio_pcm).decode("ascii"),
                "isLast": False,
            }
        )

        # Start avatar turn for host bridge frames
        try:
            turn = AvatarTurn(
                self._settings,
                turn_id=turn_id,
                avatar_id=self._client_avatar_id,
            )
            await turn.start()
            self._avatar_turn = turn
            self._active_turn_id = turn_id
            self._avatar_turn_task = asyncio.create_task(
                self._forward_avatar_frames(turn)
            )

            await turn.send_audio(audio_pcm, end=True)

            # Final audio marker
            await self._send(
                {
                    "type": "avatar_audio",
                    "turnId": turn_id,
                    "audio": "",
                    "isLast": True,
                }
            )
        except Exception as e:
            logger.error("Avatar turn failed: %s", e)
            # Fallback: audio-only (no frames)
            await self._send(
                {
                    "type": "avatar_audio",
                    "turnId": turn_id,
                    "audio": "",
                    "isLast": True,
                }
            )

    # ── Avatar frame forwarding ───────────────────────────────────

    async def _forward_avatar_frames(self, turn: AvatarTurn) -> None:
        try:
            while True:
                event = await turn.queue.get()
                await self._handle_avatar_event(turn.turn_id, event)
                if event.kind == "frame" and event.is_last:
                    await turn.close()
                    if self._avatar_turn is turn:
                        self._avatar_turn = None
                        self._active_turn_id = None
                    return
                if event.kind in {"error", "closed"}:
                    return
        except asyncio.CancelledError:
            raise

    async def _handle_avatar_event(
        self, turn_id: str, event: AvatarTurnEvent
    ) -> None:
        if turn_id != self._active_turn_id:
            return
        if event.kind == "frame":
            await self._send(
                {
                    "type": "avatar_frames",
                    "turnId": turn_id,
                    "frames": [base64.b64encode(event.frame).decode("ascii")],
                    "isLast": event.is_last,
                }
            )
        elif event.kind == "error":
            await self._send(
                {"type": "error", "message": f"Avatar turn failed: {event.message}"}
            )

    # ── Helpers ────────────────────────────────────────────────────

    async def _interrupt_current_turn(self, *, reason: str) -> None:
        if self._pipeline_task is not None:
            self._pipeline_task.cancel()
            self._pipeline_task = None
        await self._send({"type": "interrupt", "reason": reason})
        await self._close_avatar_turn()

    async def _close_avatar_turn(self) -> None:
        turn_task = self._avatar_turn_task
        self._avatar_turn_task = None
        if turn_task is not None:
            turn_task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await turn_task
        turn = self._avatar_turn
        self._avatar_turn = None
        self._active_turn_id = None
        if turn is not None:
            await turn.close()

    async def _send_status(self, message: str) -> None:
        await self._send({"type": "status", "message": message})

    async def _send(self, payload: dict[str, Any]) -> None:
        async with self._send_lock:
            await self._websocket.send_text(json.dumps(payload, ensure_ascii=False))
