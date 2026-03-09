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
from livekit.plugins import google
from livekit.plugins.spatialreal import AvatarSession

load_dotenv()


class VoiceAssistant(Agent):
    def __init__(self) -> None:
        super().__init__(
            instructions="You are a helpful voice assistant. Keep replies short and natural."
        )


async def entrypoint(ctx: JobContext) -> None:
    await ctx.connect(auto_subscribe=AutoSubscribe.AUDIO_ONLY)

    session = AgentSession(
        llm=google.realtime.RealtimeModel(
            model=os.getenv("E2E_GOOGLE_MODEL", "gemini-2.5-flash"),
            voice=os.getenv("E2E_GOOGLE_VOICE", "Puck"),
            api_key=os.getenv("GOOGLE_API_KEY"),
        )
    )

    avatar = AvatarSession()
    await avatar.start(session, room=ctx.room)

    await session.start(agent=VoiceAssistant(), room=ctx.room)


if __name__ == "__main__":
    cli.run_app(WorkerOptions(entrypoint_fnc=entrypoint, agent_name="voice-assistant"))
