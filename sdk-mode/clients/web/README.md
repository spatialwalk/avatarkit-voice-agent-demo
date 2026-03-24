# SDK Web (Mic + Local VAD + Browser LLM)

## Purpose

This sample runs `ASR + LLM + TTS` in the browser:

- Capture microphone input
- Segment speech with local VAD
- Call model APIs from web client
- Send synthesized audio to Avatar SDK (SDK mode)

## Run

```bash
cp .env.example .env
pnpm install
pnpm dev
```

Default URL: `http://localhost:3001`

## Required Backend

Run one token service in parallel:

- `../../servers/python`
- `../../servers/nodejs`
- `../../servers/go`

## Usage

1. Configure keys in `.env`.
2. Click `Initialize & Connect Avatar`.
3. Click `Start Microphone` and allow mic permission.
4. Local VAD triggers `ASR -> LLM -> TTS -> Avatar` on pause.
5. Text input remains available as fallback.

## Key Variables

- `VITE_OPENAI_API_KEY`
- `VITE_OPENAI_STT_LANGUAGE` (default `en`)
- `VITE_CARTESIA_API_KEY` (only for Cartesia TTS)
- `VITE_VAD_START_THRESHOLD`
- `VITE_VAD_STOP_THRESHOLD`
- `VITE_VAD_SILENCE_MS`
- `VITE_VAD_MIN_SPEECH_MS`

The web client validates env values and shows actionable messages if values are missing or still placeholders.

## Security Note

Direct model API calls from browser are for demo/internal testing only.
Use backend proxy + secret management in production.

## References

- Web SDK API: https://docs.spatialreal.ai/web-sdk/api-reference
- OpenAI Chat Completions (stream): https://platform.openai.com/docs/api-reference/chat/create
- OpenAI Audio Transcriptions: https://platform.openai.com/docs/api-reference/audio/createTranscription
- OpenAI Audio Speech: https://platform.openai.com/docs/api-reference/audio/createSpeech
