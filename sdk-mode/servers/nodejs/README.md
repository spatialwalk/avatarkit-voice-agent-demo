# SDK Mode Token Server (Node.js)

## Run

```bash
cp .env.example .env
pnpm install
pnpm dev
```

Production:

```bash
pnpm build
pnpm start
```

Default: `http://localhost:8090`

## API

- `GET /health`
- `POST /session-token`
  - body: `{ "appId": "..." }` (optional)

## Validation Guardrails

`POST /session-token` returns `500` if:

- `.env` is missing
- `SPATIALREAL_API_KEY` or `SPATIALREAL_APP_ID` is missing
- either value is still placeholder text

## References

- App ID / API Key: https://docs.spatialreal.ai/overview/get-apikeys
- Test avatars: https://docs.spatialreal.ai/overview/test-avatars
- Session token guide: https://docs.spatialreal.ai/server/auth.md
