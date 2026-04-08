from __future__ import annotations

import os
from dataclasses import dataclass
from functools import lru_cache

from dotenv import load_dotenv

load_dotenv()


@dataclass(frozen=True)
class Settings:
    # Server
    server_host: str
    server_port: int
    cors_allow_origins: list[str]

    # SpatialReal
    public_environment: str
    avatar_app_id: str
    avatar_api_key: str
    avatar_id: str
    avatar_console_endpoint: str
    avatar_ingress_endpoint: str
    avatar_output_sample_rate: int
    user_input_sample_rate: int

    # ASR (Deepgram or any compatible provider)
    asr_api_key: str
    asr_model: str
    asr_language: str
    asr_base_url: str

    # LLM (OpenAI-compatible: OpenAI, Doubao, etc.)
    llm_api_key: str
    llm_model: str
    llm_base_url: str
    llm_system_prompt: str

    # TTS (Cartesia or any compatible provider)
    tts_api_key: str
    tts_model: str
    tts_voice: str
    tts_base_url: str

    @property
    def public_avatar_config(self) -> dict[str, object]:
        return {
            "appId": self.avatar_app_id,
            "avatarId": self.avatar_id,
            "environment": self.public_environment,
            "outputSampleRate": self.avatar_output_sample_rate,
            "inputSampleRate": self.user_input_sample_rate,
        }


def _split_origins(raw: str | None) -> list[str]:
    if not raw:
        return ["http://127.0.0.1:5173", "http://localhost:5173"]
    return [origin.strip() for origin in raw.split(",") if origin.strip()]


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings(
        server_host=os.getenv("SERVER_HOST", "127.0.0.1"),
        server_port=int(os.getenv("SERVER_PORT", "8765")),
        cors_allow_origins=_split_origins(os.getenv("CORS_ALLOW_ORIGINS")),

        public_environment=os.getenv("SPATIALREAL_ENVIRONMENT", "intl").strip(),
        avatar_app_id=os.getenv("SPATIALREAL_APP_ID", "").strip(),
        avatar_api_key=os.getenv("SPATIALREAL_API_KEY", "").strip(),
        avatar_id=os.getenv("SPATIALREAL_AVATAR_ID", "").strip(),
        avatar_console_endpoint=os.getenv("SPATIALREAL_CONSOLE_ENDPOINT", "").strip(),
        avatar_ingress_endpoint=os.getenv("SPATIALREAL_INGRESS_ENDPOINT", "").strip(),
        avatar_output_sample_rate=int(os.getenv("AVATAR_OUTPUT_SAMPLE_RATE", "16000")),
        user_input_sample_rate=int(os.getenv("USER_INPUT_SAMPLE_RATE", "16000")),

        asr_api_key=os.getenv("ASR_API_KEY", "").strip(),
        asr_model=os.getenv("ASR_MODEL", "nova-3").strip(),
        asr_language=os.getenv("ASR_LANGUAGE", "en-US").strip(),
        asr_base_url=os.getenv("ASR_BASE_URL", "https://api.deepgram.com").strip(),

        llm_api_key=os.getenv("LLM_API_KEY", "").strip(),
        llm_model=os.getenv("LLM_MODEL", "gpt-4o-mini").strip(),
        llm_base_url=os.getenv("LLM_BASE_URL", "https://api.openai.com/v1").strip(),
        llm_system_prompt=os.getenv("LLM_SYSTEM_PROMPT", "You are a concise and friendly voice assistant.").strip(),

        tts_api_key=os.getenv("TTS_API_KEY", "").strip(),
        tts_model=os.getenv("TTS_MODEL", "sonic-2").strip(),
        tts_voice=os.getenv("TTS_VOICE", "f786b574-daa5-4673-aa0c-cbe3e8534c02").strip(),
        tts_base_url=os.getenv("TTS_BASE_URL", "https://api.cartesia.ai").strip(),
    )


def validate_settings(settings: Settings) -> list[str]:
    required = {
        "SPATIALREAL_APP_ID": settings.avatar_app_id,
        "SPATIALREAL_API_KEY": settings.avatar_api_key,
        "SPATIALREAL_AVATAR_ID": settings.avatar_id,
        "SPATIALREAL_CONSOLE_ENDPOINT": settings.avatar_console_endpoint,
        "SPATIALREAL_INGRESS_ENDPOINT": settings.avatar_ingress_endpoint,
        "ASR_API_KEY": settings.asr_api_key,
        "LLM_API_KEY": settings.llm_api_key,
        "TTS_API_KEY": settings.tts_api_key,
    }
    return [name for name, value in required.items() if not value]
