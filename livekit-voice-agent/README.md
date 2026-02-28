# LiveKit Voice Agent Demos

Two backend agent demos and two frontend demos that share the same core semantics:

- `backend/cascade`: VAD + STT + LLM + TTS pipeline (Silero + Deepgram + OpenAI-compatible + Cartesia)
- `backend/end-to-end`: realtime speech-to-speech providers (OpenAI, Azure OpenAI, Google, AWS Nova Sonic, Ultravox, xAI)
- `frontend/vite-react-spa`: Vite React SPA demo
- `frontend/next`: Next.js demo with the same UX and behavior as the Vite SPA demo

## Project structure

```text
livekit-voice-agent/
├── frontend/
│   ├── vite-react-spa/
│   └── next/
└── backend/
    ├── cascade/
    └── end-to-end/
```

## 1) Frontend setup

Choose one frontend implementation.

### Vite React SPA

```bash
cd frontend/vite-react-spa
cp .env.example .env
pnpm i
```

Set frontend avatar env vars in `frontend/vite-react-spa/.env`:

```bash
VITE_SPATIALREAL_APP_ID=your_app_id
VITE_SPATIALREAL_AVATAR_ID=your_avatar_id
```

### Next.js

```bash
cd frontend/next
cp .env.example .env
pnpm i
```

Set frontend avatar env vars in `frontend/next/.env`:

```bash
NEXT_PUBLIC_SPATIALREAL_APP_ID=your_app_id
NEXT_PUBLIC_SPATIALREAL_AVATAR_ID=your_avatar_id
```

Get your SpatialReal app/avatar credentials at: https://app.spatialreal.ai/

## 2) Backend setup

Choose one backend implementation.

### Cascade backend

```bash
cd backend/cascade
cp .env.example .env
uv sync
uv run agent.py download-files
```

### End-to-end backend

```bash
cd backend/end-to-end
cp .env.example .env
uv sync
uv run agent.py download-files
```

In `backend/end-to-end/.env`, choose a provider:

```bash
E2E_PROVIDER=openai
```

Supported provider values:

- `openai`
- `azure-openai`
- `google`
- `aws`
- `ultravox`
- `xai`

Then configure credentials for your selected provider in `backend/end-to-end/.env.example`.
For SpatialReal credentials (API key, app ID, avatar ID), use: https://app.spatialreal.ai/

## 3) Run locally

Start backend processes from the backend you selected above:

```bash
cd backend/<cascade-or-end-to-end>
uv run token_server.py
```

In another terminal:

```bash
cd backend/<cascade-or-end-to-end>
uv run agent.py dev
```

In another terminal, start your selected frontend:

```bash
# Vite SPA
cd frontend/vite-react-spa
pnpm dev

# or Next.js
cd frontend/next
pnpm dev
```

Open http://localhost:3000 in your browser.

## Deploy to LiveKit Cloud

Each backend demo includes a production Docker setup compatible with the LiveKit Cloud builds guide:

- `backend/cascade/Dockerfile`
- `backend/cascade/.dockerignore`
- `backend/end-to-end/Dockerfile`
- `backend/end-to-end/.dockerignore`

Deploy steps (run inside the backend folder you want to deploy):

```bash
cd backend/<cascade-or-end-to-end>

# 1) Authenticate and select project
lk cloud auth
# optional: lk project set-default "<your-project>"

# 2) Create deployment (first time)
lk agent create

# 3) Deploy updates later
lk agent deploy
```

Set runtime secrets in LiveKit Cloud (recommended via secrets file):

```bash
lk agent update-secrets --secrets-file .env
```

Notes:

- LiveKit Cloud injects `LIVEKIT_URL`, `LIVEKIT_API_KEY`, and `LIVEKIT_API_SECRET` automatically.
- Keep provider keys and SpatialReal keys in secrets, not in image or source.
- For `backend/end-to-end`, include `E2E_PROVIDER` in your deployment secrets.

Useful commands:

```bash
lk agent status
lk agent logs
```

## Documentation

- LiveKit Agents: https://docs.livekit.io/agents/
- LiveKit Cloud builds: https://docs.livekit.io/deploy/agents/builds/
- LiveKit deployment quickstart: https://docs.livekit.io/deploy/agents/quickstart/
- SpatialReal RTC mode: https://docs.spatialreal.ai/guide/rtc-mode
