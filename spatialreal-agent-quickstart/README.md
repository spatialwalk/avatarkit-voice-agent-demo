# SpatialReal Agent Quickstart

End-to-end voice agent quickstart with:

- Frontend: Vue + AvatarKit RTC + LiveKit client
- Backend: Flask token server + LiveKit Agents worker + SpatialReal plugin

## Architecture

- Frontend requests `/token` from backend
- Backend returns LiveKit JWT and dispatches `voice-assistant`
- Agent worker joins room and starts Gemini Live + SpatialReal avatar session
- Frontend connects to LiveKit and renders avatar with `AvatarPlayer`

## Prerequisites

- Node.js 18+
- pnpm
- Python 3.10+
- uv
- LiveKit Cloud credentials (https://cloud.livekit.io)
- Google Gemini API key (https://aistudio.google.com/api-keys)
- SpatialReal credentials (https://app.spatialreal.ai/apps)

## Setup

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

Fill both `.env` files with real values.

Install dependencies:

```bash
# backend
cd backend
uv sync

# frontend
cd ../frontend
pnpm install
```

## Run

Use 3 terminals:

```bash
# Terminal 1
cd backend
uv run token_server.py
```

```bash
# Terminal 2
cd backend
uv run agent.py dev
```

```bash
# Terminal 3
cd frontend
pnpm dev
```

Open `http://localhost:3000`, click **Connect**, then **Start Mic**.

## Project Structure

```text
spatialreal-agent-quickstart/
├── backend/
│   ├── .env.example
│   ├── agent.py
│   ├── pyproject.toml
│   └── token_server.py
└── frontend/
    ├── .env.example
    ├── index.html
    ├── package.json
    ├── src/
    │   ├── App.vue
    │   ├── env.d.ts
    │   ├── main.ts
    │   └── style.css
    ├── tsconfig.app.json
    ├── tsconfig.json
    ├── tsconfig.node.json
    └── vite.config.ts
```
