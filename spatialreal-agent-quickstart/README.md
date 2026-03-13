# SpatialReal Agent Quickstart

End-to-end voice agent quickstart with:

- Frontend: React + AvatarKit UI components + LiveKit client
- Backend: Flask token server + LiveKit Agents worker + SpatialReal plugin

## Architecture

- Frontend requests `/token` from backend
- Backend returns LiveKit JWT and dispatches `voice-assistant`
- Agent worker joins room and starts Gemini Live + SpatialReal avatar session
- Frontend connects to LiveKit and renders avatar with `SpatialRealAvatarProvider`

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

The frontend already includes:

- `src/components/spatialreal-avatar/*`
- `src/components/ui/button.tsx`

So you do not need to run extra `shadcn add` commands for this quickstart.

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
    ├── components.json
    ├── src/
    │   ├── App.tsx
    │   ├── main.tsx
    │   ├── index.css
    │   ├── hooks/
    │   │   └── useSpatialRealAvatar.ts
    │   ├── lib/
    │   │   └── utils.ts
    │   ├── types/
    │   │   └── spatialreal-avatar.ts
    │   └── components/
    │       ├── spatialreal-avatar/
    │       └── ui/
    ├── tsconfig.app.json
    ├── tsconfig.json
    ├── tsconfig.node.json
    └── vite.config.ts
```
