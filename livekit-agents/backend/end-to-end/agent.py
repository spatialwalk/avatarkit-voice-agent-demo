"""
LiveKit end-to-end voice agent with realtime providers.

Supported providers:
- OpenAI Realtime API
- Azure OpenAI Realtime API
- Google Gemini Live
- Amazon Nova Sonic
- Ultravox Realtime
- xAI Grok Voice Agent API
"""

import logging
import os

from dotenv import load_dotenv
from livekit.agents import (
    Agent,
    AgentSession,
    AutoSubscribe,
    JobContext,
    WorkerOptions,
    cli,
)
from livekit.plugins import aws, google, openai, ultravox, xai
from livekit.plugins.spatialreal import AvatarSession

load_dotenv()

logger = logging.getLogger("voice-agent-end-to-end")
logger.setLevel(logging.INFO)

SUPPORTED_PROVIDERS = {
    "openai": "OpenAI Realtime API",
    "azure-openai": "Azure OpenAI Realtime API",
    "google": "Google Gemini Live API",
    "aws": "Amazon Nova Sonic",
    "ultravox": "Ultravox Realtime",
    "xai": "xAI Grok Voice Agent API",
}


def _optional_env(name: str) -> str | None:
    value = os.getenv(name)
    if value is None:
        return None

    normalized = value.strip()
    return normalized or None


def _required_env(name: str) -> str:
    value = _optional_env(name)
    if value is None:
        raise ValueError(f"Missing required environment variable: {name}")
    return value


def _normalize_provider(raw_provider: str) -> str:
    provider = raw_provider.strip().lower()
    aliases = {
        "azure": "azure-openai",
        "azure_openai": "azure-openai",
        "nova-sonic": "aws",
    }
    return aliases.get(provider, provider)


def _create_realtime_model(provider: str):
    if provider == "openai":
        return openai.realtime.RealtimeModel(
            model=_optional_env("E2E_OPENAI_MODEL") or "gpt-realtime",
            voice=_optional_env("E2E_OPENAI_VOICE") or "alloy",
            api_key=_required_env("OPENAI_API_KEY"),
        )

    if provider == "azure-openai":
        return openai.realtime.RealtimeModel.with_azure(
            azure_deployment=_required_env("AZURE_OPENAI_DEPLOYMENT"),
            azure_endpoint=_required_env("AZURE_OPENAI_ENDPOINT"),
            api_key=_required_env("AZURE_OPENAI_API_KEY"),
            api_version=_optional_env("OPENAI_API_VERSION") or "2024-10-01-preview",
            voice=_optional_env("E2E_AZURE_OPENAI_VOICE") or "alloy",
        )

    if provider == "google":
        return google.realtime.RealtimeModel(
            model=_optional_env("E2E_GOOGLE_MODEL") or "gemini-2.5-flash",
            voice=_optional_env("E2E_GOOGLE_VOICE") or "Puck",
            api_key=_required_env("GOOGLE_API_KEY"),
        )

    if provider == "aws":
        return aws.realtime.RealtimeModel.with_nova_sonic_2(
            voice=_optional_env("E2E_AWS_VOICE") or "tiffany",
            turn_detection=_optional_env("E2E_AWS_TURN_DETECTION") or "MEDIUM",
            region=_optional_env("AWS_REGION") or "us-east-1",
        )

    if provider == "ultravox":
        return ultravox.realtime.RealtimeModel(
            voice=_optional_env("E2E_ULTRAVOX_VOICE") or "Mark",
            api_key=_required_env("ULTRAVOX_API_KEY"),
        )

    if provider == "xai":
        return xai.realtime.RealtimeModel(
            voice=_optional_env("E2E_XAI_VOICE") or "ara",
            api_key=_required_env("XAI_API_KEY"),
        )

    raise ValueError(
        f"Unsupported provider '{provider}'. Supported providers: "
        f"{', '.join(SUPPORTED_PROVIDERS.keys())}"
    )


class VoiceAssistant(Agent):
    """Voice assistant using realtime end-to-end models."""

    def __init__(self):
        super().__init__(
            instructions=_optional_env("AGENT_INSTRUCTIONS")
            or """You are a helpful voice assistant. Be concise, friendly, and natural.
            Keep your responses short because this is a spoken conversation."""
        )


async def entrypoint(ctx: JobContext):
    """Main entrypoint for the realtime voice agent."""
    provider = _normalize_provider(_optional_env("E2E_PROVIDER") or "openai")
    if provider not in SUPPORTED_PROVIDERS:
        raise ValueError(
            f"Unknown E2E_PROVIDER '{provider}'. Supported providers: "
            f"{', '.join(SUPPORTED_PROVIDERS.keys())}"
        )

    logger.info(f"Connecting to room: {ctx.room.name}")
    logger.info(f"Using realtime provider: {SUPPORTED_PROVIDERS[provider]}")
    await ctx.connect(auto_subscribe=AutoSubscribe.AUDIO_ONLY)

    session = AgentSession(
        llm=_create_realtime_model(provider),
    )

    logger.info("Initializing avatar session...")
    avatar = AvatarSession()
    await avatar.start(session, room=ctx.room)
    logger.info("Avatar session started")

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

    logger.info("Starting end-to-end realtime voice session")
    await session.start(
        agent=VoiceAssistant(),
        room=ctx.room,
    )


if __name__ == "__main__":
    cli.run_app(WorkerOptions(entrypoint_fnc=entrypoint, agent_name="voice-assistant"))
