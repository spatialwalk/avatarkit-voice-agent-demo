from __future__ import annotations

import asyncio
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
import logging

from avatarkit import AvatarSDKError, SessionTokenError, new_avatar_session

from app.config import Settings


logger = logging.getLogger(__name__)


@dataclass(slots=True)
class AvatarTurnEvent:
    kind: str
    frame: bytes = b""
    is_last: bool = False
    message: str = ""


class AvatarTurn:
    def __init__(self, settings: Settings, turn_id: str, avatar_id: str | None = None) -> None:
        self._settings = settings
        # If avatar_id is provided (e.g. via client set_avatar message), use it;
        # otherwise fall back to the default from .env / settings.
        self._avatar_id = avatar_id or settings.avatar_id
        self.turn_id = turn_id
        self._queue: asyncio.Queue[AvatarTurnEvent] = asyncio.Queue(maxsize=256)
        self._session = None
        self._loop: asyncio.AbstractEventLoop | None = None

    @property
    def queue(self) -> asyncio.Queue[AvatarTurnEvent]:
        return self._queue

    async def start(self) -> None:
        self._loop = asyncio.get_running_loop()

        def on_frame(frame: bytes, last: bool) -> None:
            if self._loop is None:
                return
            self._loop.call_soon_threadsafe(
                self._queue.put_nowait,
                AvatarTurnEvent(kind="frame", frame=bytes(frame), is_last=bool(last)),
            )

        def on_error(error: Exception) -> None:
            if self._loop is None:
                return
            self._loop.call_soon_threadsafe(
                self._queue.put_nowait,
                AvatarTurnEvent(kind="error", message=str(error)),
            )

        def on_close() -> None:
            if self._loop is None:
                return
            self._loop.call_soon_threadsafe(
                self._queue.put_nowait,
                AvatarTurnEvent(kind="closed"),
            )

        self._session = new_avatar_session(
            api_key=self._settings.avatar_api_key,
            app_id=self._settings.avatar_app_id,
            console_endpoint_url=self._settings.avatar_console_endpoint,
            ingress_endpoint_url=self._settings.avatar_ingress_endpoint,
            avatar_id=self._avatar_id,
            expire_at=datetime.now(timezone.utc) + timedelta(minutes=5),
            sample_rate=self._settings.avatar_output_sample_rate,
            bitrate=0,
            transport_frames=on_frame,
            on_error=on_error,
            on_close=on_close,
        )
        await self._session.init()
        await self._session.start()

    async def send_audio(self, audio: bytes, *, end: bool) -> str:
        if self._session is None:
            raise RuntimeError("avatar turn is not started")
        return await self._session.send_audio(audio, end=end)

    async def close(self) -> None:
        session = self._session
        self._session = None
        if session is None:
            return
        try:
            await session.close()
        except (AvatarSDKError, SessionTokenError):
            logger.debug("avatar session close raised SDK error", exc_info=True)
