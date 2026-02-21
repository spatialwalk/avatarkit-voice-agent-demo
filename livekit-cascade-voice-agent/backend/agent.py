"""
LiveKit Voice Agent with VAD + ASR + LLM + TTS Pipeline

Uses:
- Silero VAD for voice activity detection
- Deepgram STT for speech-to-text
- OpenAI-compatible LLM for conversation
- Cartesia TTS for text-to-speech
- Optional: SpatialReal Avatar for lip-synced video
"""

import os
import logging
from dotenv import load_dotenv
from livekit import rtc

from livekit.agents import (
    Agent,
    AgentSession,
    AutoSubscribe,
    JobContext,
    RoomInputOptions,
    WorkerOptions,
    cli,
)
from livekit.plugins import cartesia, deepgram, openai, silero

# Import SpatialReal avatar plugin
from livekit.plugins.spatialreal import AvatarSession

load_dotenv()

logger = logging.getLogger("voice-agent")
logger.setLevel(logging.INFO)

BROWSER_PARTICIPANT_IDENTITY = "browser-user"


def _set_target_audio_subscription(participant: rtc.RemoteParticipant) -> None:
    is_target_participant = participant.identity == BROWSER_PARTICIPANT_IDENTITY

    for publication in participant.track_publications.values():
        should_subscribe = (
            is_target_participant
            and publication.kind == rtc.TrackKind.KIND_AUDIO
            and publication.source == rtc.TrackSource.SOURCE_MICROPHONE
        )
        publication.set_subscribed(should_subscribe)


class VoiceAssistant(Agent):
    """Voice assistant agent using pipeline approach."""

    def __init__(self):
        super().__init__(
            instructions="""You are a helpful voice assistant. You can engage in natural
            conversations with users. Be friendly, concise, and helpful. When users speak
            to you, respond naturally and conversationally. Keep your responses brief
            since this is a voice conversation."""
        )


async def entrypoint(ctx: JobContext):
    """Main entrypoint for the voice agent."""
    logger.info(f"Connecting to room: {ctx.room.name}")
    await ctx.connect(auto_subscribe=AutoSubscribe.SUBSCRIBE_NONE)

    def on_participant_connected(participant: rtc.RemoteParticipant) -> None:
        _set_target_audio_subscription(participant)

    def on_track_published(
        _publication: rtc.RemoteTrackPublication, participant: rtc.RemoteParticipant
    ) -> None:
        _set_target_audio_subscription(participant)

    ctx.room.on("participant_connected", on_participant_connected)
    ctx.room.on("track_published", on_track_published)

    for participant in ctx.room.remote_participants.values():
        _set_target_audio_subscription(participant)

    # Check if avatar mode is enabled
    avatar_enabled = os.getenv("AVATAR_ENABLED", "false").lower() == "true"
    logger.info(f"Avatar enabled: {avatar_enabled}")

    # Silero VAD for voice activity detection
    vad = silero.VAD.load()

    # Deepgram STT for speech-to-text
    stt = deepgram.STT(
        api_key=os.getenv("DEEPGRAM_API_KEY"),
        model=os.getenv("DEEPGRAM_MODEL", "nova-3"),
        language=os.getenv("DEEPGRAM_LANGUAGE", "en-US"),
    )

    # OpenAI-compatible LLM
    llm = openai.LLM(
        model=os.getenv("LLM_MODEL", "gpt-4o-mini"),
        base_url=os.getenv("LLM_BASE_URL"),
        api_key=os.getenv("LLM_API_KEY", os.getenv("OPENAI_API_KEY")),
    )

    # Cartesia TTS for text-to-speech
    tts = cartesia.TTS(
        api_key=os.getenv("CARTESIA_API_KEY"),
        model=os.getenv("CARTESIA_MODEL", "sonic-2"),
        language=os.getenv("CARTESIA_LANGUAGE", "en"),
        voice=os.getenv("CARTESIA_VOICE", "f786b574-daa5-4673-aa0c-cbe3e8534c02"),
    )

    # Create agent session with pipeline components
    session = AgentSession(
        vad=vad,
        stt=stt,
        llm=llm,
        tts=tts,
    )

    # Setup avatar if enabled
    if avatar_enabled:
        logger.info("Avatar mode enabled, initializing avatar session...")
        avatar = AvatarSession()
        await avatar.start(session, room=ctx.room)
        logger.info("Avatar session started")

    # Event handlers for logging
    @session.on("agent_state_changed")
    def on_agent_state_changed(state: str):
        logger.info(f"Agent state changed: {state}")

    @session.on("user_state_changed")
    def on_user_state_changed(state: str):
        logger.info(f"User state changed: {state}")

    @session.on("user_input_transcribed")
    def on_user_input_transcribed(transcript):
        logger.info(f"User input transcribed: {transcript}")

    @session.on("conversation_item_added")
    def on_conversation_item_added(item):
        logger.info(f"Conversation item added: {item}")

    # Start the session
    logger.info(
        "Starting agent session with pipeline: Silero VAD + Deepgram STT + OpenAI LLM + Cartesia TTS"
        + (" + SpatialReal Avatar" if avatar_enabled else "")
    )
    await session.start(
        agent=VoiceAssistant(),
        room=ctx.room,
        room_input_options=RoomInputOptions(
            participant_identity=BROWSER_PARTICIPANT_IDENTITY,
        ),
    )

    # Send initial greeting
    await session.say("你好！我是你的语音助手，有什么可以帮到你的吗？")


if __name__ == "__main__":
    cli.run_app(WorkerOptions(entrypoint_fnc=entrypoint, agent_name="voice-assistant"))
