# RTC Frontend (Pure RTC)

## Purpose

Join a LiveKit room and render avatar to validate pure RTC path (without Agent plugin).

## Run

```bash
cp .env.example .env
pnpm install
pnpm dev
```

Default URL: `http://localhost:3003`

## Backend Dependency

Run `../../servers/python` in parallel (default `http://localhost:8081`).

## References

- SpatialReal App ID / API Key: https://docs.spatialreal.ai/overview/get-apikeys
- SpatialReal Avatar ID (test avatars): https://docs.spatialreal.ai/overview/test-avatars
- Session token guide: https://docs.spatialreal.ai/server/auth.md
- LiveKit cloud: https://cloud.livekit.io/
