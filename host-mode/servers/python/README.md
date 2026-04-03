# Host Mode Backend (Python)

## Purpose

Provides the complete host-mode backend pipeline:

- ASR
- LLM
- TTS
- Host bridge frame generation (optional)

## Run

```bash
cp .env.example .env
uv sync
uv run app.py
```

## API

- `GET /health`
- `POST /session-token`
- `POST /pipeline/respond`

`/pipeline/respond` supports two input modes:

- `input_text`: text input (skip ASR)
- `input_audio_base64 + input_audio_mime`: audio input (with ASR)

## Note

To validate only ASR/LLM/TTS without avatar frame generation:

- set `HOST_ENABLE_AVATAR_BRIDGE=false`

## References

- App ID / API Key: https://docs.spatialreal.ai/overview/get-apikeys
- Test avatars: https://docs.spatialreal.ai/overview/test-avatars
- Regions / endpoints: https://docs.spatialreal.ai/overview/regions
