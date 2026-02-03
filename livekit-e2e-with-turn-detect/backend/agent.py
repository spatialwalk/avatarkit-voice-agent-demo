"""
LiveKit Voice Agent with VAD + ASR + LLM + TTS Pipeline and Turn Detection

Uses:
- Silero VAD for voice activity detection
- Volcengine STT for speech-to-text
- MultilingualModel for turn detection
- OpenAI-compatible LLM for conversation
- Volcengine TTS for text-to-speech
"""

import os
import logging
from dotenv import load_dotenv

from livekit.agents import Agent, AgentSession, JobContext, cli, WorkerOptions
from livekit.plugins import silero, openai, volcengine
from livekit.plugins.turn_detector.multilingual import MultilingualModel

load_dotenv()

logger = logging.getLogger("voice-agent")
logger.setLevel(logging.INFO)


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
    await ctx.connect()

    # Silero VAD for voice activity detection
    vad = silero.VAD.load()

    # Volcengine STT for speech-to-text
    stt = volcengine.STT(
        app_id=os.getenv("VOLCENGINE_STT_APP_ID"),
        access_token=os.getenv("VOLCENGINE_STT_ACCESS_TOKEN"),
        cluster=os.getenv("VOLCENGINE_STT_CLUSTER", "volcengine_streaming_common"),
    )

    # Turn detection using MultilingualModel
    turn_detector = MultilingualModel()

    # OpenAI-compatible LLM
    llm = openai.LLM(
        model=os.getenv("LLM_MODEL", "gpt-4o-mini"),
        base_url=os.getenv("LLM_BASE_URL"),  # Optional: for OpenAI-compatible APIs
        api_key=os.getenv("LLM_API_KEY", os.getenv("OPENAI_API_KEY")),
    )

    # Volcengine TTS for text-to-speech
    tts = volcengine.TTS(
        app_id=os.getenv("VOLCENGINE_TTS_APP_ID"),
        access_token=os.getenv("VOLCENGINE_TTS_ACCESS_TOKEN"),
        cluster=os.getenv("VOLCENGINE_TTS_CLUSTER", "volcano_tts"),
        voice=os.getenv(
            "VOLCENGINE_TTS_VOICE", "zh_female_tianmeixiaoyuan_moon_bigtts"
        ),
    )

    # Create agent session with pipeline components including turn detection
    session = AgentSession(
        vad=vad,
        stt=stt,
        llm=llm,
        tts=tts,
        turn_detection=turn_detector,
    )

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

    @session.on("close")
    def on_close():
        logger.info("Session closed")

    # Start the session
    logger.info(
        "Starting agent session with pipeline: Silero VAD + Volcengine STT + Turn Detection + OpenAI LLM + Volcengine TTS"
    )
    await session.start(agent=VoiceAssistant(), room=ctx.room)

    # Send initial greeting
    await session.say("你好！我是你的语音助手，有什么可以帮到你的吗？")


if __name__ == "__main__":
    cli.run_app(WorkerOptions(entrypoint_fnc=entrypoint, agent_name="voice-assistant"))
