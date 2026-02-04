"""
SpatialReal Avatar integration for LiveKit voice agents.

This module provides AvatarSession which hooks into an AgentSession
to route TTS audio to the SpatialReal avatar service.

Usage:
    avatar = AvatarSession()
    await avatar.start(session, room=ctx.room)
"""

import os
import logging
import asyncio
from datetime import datetime, timezone, timedelta
from typing import Optional

from livekit import rtc
from livekit.agents import AgentSession
from livekit.agents.voice.avatar import QueueAudioOutput, AudioSegmentEnd
from avatarkit import new_avatar_session, AvatarSession as AvatarkitSession, LiveKitEgressConfig

logger = logging.getLogger("avatar")
logger.setLevel(logging.INFO)


class AvatarSession:
    """
    Avatar session that integrates with LiveKit AgentSession.

    This connects to SpatialReal's avatar service and routes TTS audio
    from the agent to the avatar for lip-synced rendering. The avatar
    service joins the LiveKit room and publishes synchronized video + audio.

    Usage:
        avatar = AvatarSession()
        await avatar.start(session, room=ctx.room)
    """

    def __init__(
        self,
        *,
        api_key: Optional[str] = None,
        app_id: Optional[str] = None,
        avatar_id: Optional[str] = None,
        console_endpoint_url: Optional[str] = None,
        ingress_endpoint_url: Optional[str] = None,
    ):
        self._api_key = api_key or os.getenv("SPATIALREAL_API_KEY")
        self._app_id = app_id or os.getenv("SPATIALREAL_APP_ID")
        self._avatar_id = avatar_id or os.getenv("SPATIALREAL_AVATAR_ID")
        self._console_endpoint_url = console_endpoint_url or os.getenv(
            "SPATIALREAL_CONSOLE_ENDPOINT",
            "https://console.cn.spatialwalk.cloud/v1/console"
        )
        self._ingress_endpoint_url = ingress_endpoint_url or os.getenv(
            "SPATIALREAL_INGRESS_ENDPOINT",
            "https://api.cn.spatialwalk.cloud/v2/driveningress"
        )

        self._avatarkit_session: Optional[AvatarkitSession] = None
        self._agent_session: Optional[AgentSession] = None
        self._audio_buffer: Optional[QueueAudioOutput] = None
        self._main_task: Optional[asyncio.Task] = None
        self._initialized = False

    async def start(self, session: AgentSession, *, room: rtc.Room) -> None:
        """
        Start the avatar session and hook into the agent session.

        Args:
            session: The AgentSession to hook into for TTS audio
            room: The LiveKit room for egress configuration
        """
        if self._initialized:
            return

        self._agent_session = session
        room_name = room.name

        logger.info("Initializing SpatialReal avatar session...")
        logger.info(f"Console endpoint: {self._console_endpoint_url}")
        logger.info(f"Ingress endpoint: {self._ingress_endpoint_url}")
        logger.info(f"Room name: {room_name}")

        # Create LiveKit egress configuration
        livekit_egress = LiveKitEgressConfig(
            url=os.getenv("LIVEKIT_URL"),
            api_key=os.getenv("LIVEKIT_API_KEY"),
            api_secret=os.getenv("LIVEKIT_API_SECRET"),
            room_name=room_name,
            publisher_id="avatar",
        )

        # Create avatar session with LiveKit egress mode
        self._avatarkit_session = new_avatar_session(
            api_key=self._api_key,
            app_id=self._app_id,
            avatar_id=self._avatar_id,
            console_endpoint_url=self._console_endpoint_url,
            ingress_endpoint_url=self._ingress_endpoint_url,
            expire_at=datetime.now(timezone.utc) + timedelta(hours=1),
            livekit_egress=livekit_egress,
        )

        await self._avatarkit_session.init()
        await self._avatarkit_session.start()

        logger.info("SpatialReal avatar session connected")

        # Create audio buffer using livekit-agents' QueueAudioOutput
        sample_rate = session.tts.sample_rate if session.tts else 24000
        self._audio_buffer = QueueAudioOutput(sample_rate=sample_rate)

        # Hook into agent session's audio output
        session.output.audio = self._audio_buffer

        # Start the audio buffer
        await self._audio_buffer.start()

        # Register for clear_buffer events (interruptions)
        @self._audio_buffer.on("clear_buffer")
        def on_clear_buffer():
            asyncio.create_task(self._handle_interrupt())

        # Start the main task that forwards audio to avatar
        self._main_task = asyncio.create_task(self._run_main_task())

        self._initialized = True
        logger.info("Avatar audio output attached to agent session")

        # Register cleanup on session close
        @session.on("close")
        def on_session_close():
            asyncio.create_task(self.close())

    async def _run_main_task(self) -> None:
        """Main task that forwards audio from the buffer to the avatar service."""
        if not self._audio_buffer or not self._avatarkit_session:
            return

        try:
            frame_count = 0
            async for item in self._audio_buffer:
                if isinstance(item, rtc.AudioFrame):
                    # Convert AudioFrame to bytes and send to avatar
                    audio_bytes = bytes(item.data)
                    frame_count += 1

                    if frame_count == 1:
                        logger.info("Avatar: First audio frame received")

                    await self._avatarkit_session.send_audio(
                        audio=audio_bytes,
                        end=False
                    )

                elif isinstance(item, AudioSegmentEnd):
                    # End of audio segment - signal completion to avatar
                    logger.info(f"Avatar: Segment end, sent {frame_count} frames")
                    await self._avatarkit_session.send_audio(
                        audio=b"",
                        end=True
                    )

                    # Notify the buffer that playback is finished
                    self._audio_buffer.notify_playback_finished(
                        playback_position=0.0,
                        interrupted=False,
                    )
                    frame_count = 0

        except asyncio.CancelledError:
            logger.info("Avatar main task cancelled")
        except Exception as e:
            logger.error(f"Error in avatar main task: {e}")

    async def _handle_interrupt(self) -> None:
        """Handle interruption - stop avatar's current audio processing."""
        if not self._avatarkit_session:
            return

        try:
            interrupted_id = await self._avatarkit_session.interrupt()
            logger.info(f"Avatar interrupted, request_id={interrupted_id}")
        except Exception as e:
            logger.warning(f"Failed to interrupt avatar: {e}")

    async def close(self) -> None:
        """Clean up avatar session."""
        if self._main_task:
            self._main_task.cancel()
            try:
                await self._main_task
            except asyncio.CancelledError:
                pass
            self._main_task = None

        if self._audio_buffer:
            await self._audio_buffer.aclose()
            self._audio_buffer = None

        if self._avatarkit_session:
            try:
                await self._avatarkit_session.close()
                logger.info("Avatar session closed")
            except Exception as e:
                logger.warning(f"Error closing avatar session: {e}")
            finally:
                self._avatarkit_session = None
                self._initialized = False
