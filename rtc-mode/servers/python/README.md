# Pure RTC Token Server (Python)

## Purpose

Issues LiveKit token and ensures room exists.
No agent dispatch in this sample.

## Run

```bash
cp .env.example .env
uv sync
uv run app.py
```

Default: `http://localhost:8081`

## API

- `GET /health`
- `POST /token`

## Reference

- LiveKit cloud: https://cloud.livekit.io/
