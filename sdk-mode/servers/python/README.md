# SDK Mode Token Server (Python)

## Purpose

Issues SpatialReal session tokens for SDK mode clients.

## Run

```bash
cp .env.example .env
uv sync
uv run app.py
```

Default: `http://localhost:8090`

## API

- `GET /health`
- `POST /session-token`
  - body: `{ "appId": "..." }` (optional, falls back to env)

## Validation Guardrails

`POST /session-token` returns `500` if:

- `.env` is missing
- `SPATIALREAL_API_KEY` or `SPATIALREAL_APP_ID` is missing
- either value is still a placeholder (for example `your_spatialreal_api_key`)

## References

- App ID / API Key: https://docs.spatialreal.ai/overview/get-apikeys
- Test avatars: https://docs.spatialreal.ai/overview/test-avatars
- Session token guide: https://docs.spatialreal.ai/server/auth.md
