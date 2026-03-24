# Host Mode

Host mode uses a single full backend implementation strategy:

- Main backend: `servers/python` (`ASR -> LLM -> TTS + Host Bridge`)
- Client folders: `frontend / ios / android / flutter`

## Run (Frontend + Python)

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

Open: `http://localhost:3002`

## References

- App ID / API Key: https://docs.spatialreal.ai/overview/get-apikeys
- Test avatars: https://docs.spatialreal.ai/overview/test-avatars
- Regions / endpoints: https://docs.spatialreal.ai/overview/regions

## Notes

- `servers/nodejs` and `servers/go` are extension placeholders only.
- Use `servers/python` for full host pipeline validation.
