# RTC Mode

This standalone sample validates RTC room connectivity without agent dispatch.

## Run

Backend:

```bash
cd servers/python
cp .env.example .env
uv sync
uv run app.py
```

Frontend:

```bash
cd clients/frontend
cp .env.example .env
pnpm install
pnpm dev
```

Open: `http://localhost:3003`

## References

- SpatialReal App ID / API Key: https://docs.spatialreal.ai/overview/get-apikeys
- SpatialReal Avatar ID (test avatars): https://docs.spatialreal.ai/overview/test-avatars
- Session token guide: https://docs.spatialreal.ai/server/auth.md
- LiveKit cloud: https://cloud.livekit.io/
