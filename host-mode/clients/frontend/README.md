# Host Mode Frontend

## Purpose

Web client for host mode backend pipeline:

- Text input: `LLM + TTS + Host frames`
- Microphone input: `ASR + LLM + TTS + Host frames`

## Run

```bash
cp .env.example .env
pnpm install
pnpm dev
```

Default URL: `http://localhost:3002`

## Backend Dependency

Run `../../servers/python` in parallel (default `http://localhost:8100`).

## Usage

1. Click `Initialize Host Avatar`.
2. Use text input or microphone input.
3. Inspect ASR, LLM, TTS, and host render outputs.

## References

- App ID / API Key: https://docs.spatialreal.ai/overview/get-apikeys
- Test avatars: https://docs.spatialreal.ai/overview/test-avatars
