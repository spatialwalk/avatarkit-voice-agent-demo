# SDK Mode

In SDK mode, the conversation pipeline is handled by the client:

`ASR -> LLM -> TTS -> Avatar`

The backend only issues `session token`.

## Directory Layout

```text
clients/
├── web/              # Main Web SDK mode sample
├── ios/
└── android/

servers/
├── python/           # Recommended token service
├── nodejs/
└── go/
```

## Recommended Run Path (Web + Python)

Start token service:

```bash
cd servers/python
cp .env.example .env
uv sync
uv run app.py
```

Start web client:

```bash
cd clients/web
cp .env.example .env
pnpm install
pnpm dev
```

Open: `http://localhost:3001`

## Voice Pipeline Notes

Using `clients/web` as reference:

1. Local VAD starts a segment when speech begins.
2. Segment ends on silence and is sent to ASR.
3. ASR text goes into streaming LLM.
4. LLM deltas are split into sentence chunks.
5. Each chunk triggers TTS immediately.
6. Audio is sent to Avatar in strict chunk index order.
7. Only the last chunk uses `flush=true`.

## Key Implementation Constraints

- Strict send order for chunked TTS output.
- Flush only once at the end of one full reply.
- Use SDK `onConversationState` as speaking state source.
- Gate VAD while avatar is speaking or processing.
- Prefer natural punctuation boundaries for chunking.

## Environment Variables

Web (`clients/web/.env`):

- `VITE_SPATIALREAL_APP_ID`
- `VITE_SPATIALREAL_AVATAR_ID`
- `VITE_OPENAI_API_KEY`
- `VITE_OPENAI_MODEL`
- `VITE_OPENAI_STT_MODEL`
- `VITE_OPENAI_TTS_MODEL`
- `VITE_OPENAI_TTS_VOICE`
- `VITE_VAD_START_THRESHOLD`
- `VITE_VAD_STOP_THRESHOLD`
- `VITE_VAD_SILENCE_MS`
- `VITE_VAD_MIN_SPEECH_MS`

Backend (`servers/*/.env`) must provide SpatialReal credentials for token issuing.

## Android Sample

`clients/android` provides a Kotlin + Compose SDK mode sample with the same pipeline behavior.

## References

- SpatialReal App ID / API Key: https://docs.spatialreal.ai/overview/get-apikeys
- SpatialReal Avatar ID (test avatars): https://docs.spatialreal.ai/overview/test-avatars
- Session token issuing guide: https://docs.spatialreal.ai/server/auth.md

## Production Notes

- Direct model calls from client are for demos only.
- Production should proxy model calls on backend and store secrets server-side.
- Add auth, rate limiting, audit logs, and retry strategy.
