# Frontend Demos

This folder contains two frontend demos with the same behavior and UX:

- `vite-react-spa`: Vite + React SPA implementation.
- `next`: Next.js App Router implementation.

Both demos:

- request a token from `POST /token`
- connect to the same LiveKit room flow
- render the SpatialReal avatar
- support voice + text chat + transcript UI

## Structure

```text
frontend/
├── vite-react-spa/
└── next/
```

## Environment variables

Get your SpatialReal app/avatar credentials at: https://app.spatialreal.ai/

### Vite React SPA

Use `frontend/vite-react-spa/.env`:

```bash
VITE_SPATIALREAL_APP_ID=your_app_id
VITE_SPATIALREAL_AVATAR_ID=your_avatar_id
```

### Next.js

Use `frontend/next/.env`:

```bash
NEXT_PUBLIC_SPATIALREAL_APP_ID=your_app_id
NEXT_PUBLIC_SPATIALREAL_AVATAR_ID=your_avatar_id
```

The Next.js demo uses `withAvatarkit` in `frontend/next/next.config.mjs` so WASM assets are copied and resolved correctly (including Turbopack).

## Run locally

Start a backend token server first (`backend/cascade` or `backend/end-to-end`):

```bash
cd ../backend/<cascade-or-end-to-end>
uv run token_server.py
```

Then run one frontend:

### Vite React SPA

```bash
cd vite-react-spa
cp .env.example .env
pnpm i
pnpm dev
```

### Next.js

```bash
cd next
cp .env.example .env
pnpm i
pnpm dev
```

Open http://localhost:3000.
