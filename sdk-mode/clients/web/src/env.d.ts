/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SPATIALREAL_APP_ID: string
  readonly VITE_SPATIALREAL_AVATAR_ID: string
  readonly VITE_OPENAI_API_KEY: string
  readonly VITE_OPENAI_MODEL?: string
  readonly VITE_OPENAI_STT_MODEL?: string
  readonly VITE_OPENAI_TTS_MODEL?: string
  readonly VITE_OPENAI_TTS_VOICE?: string
  readonly VITE_CARTESIA_API_KEY?: string
  readonly VITE_CARTESIA_MODEL?: string
  readonly VITE_CARTESIA_VOICE_ID?: string
  readonly VITE_VAD_START_THRESHOLD?: string
  readonly VITE_VAD_STOP_THRESHOLD?: string
  readonly VITE_VAD_SILENCE_MS?: string
  readonly VITE_VAD_MIN_SPEECH_MS?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
