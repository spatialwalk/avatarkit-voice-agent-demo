# SpatialReal Speech-to-Avatar Quickstart

Minimal Web quickstart for SpatialReal SDK Mode.

This demo provides two explicit actions:

1. Connect avatar
2. Send demo PCM audio

## Prerequisites

- Node.js 18+
- pnpm
- SpatialReal Studio values:
  - `VITE_SPATIALREAL_APP_ID`
  - `VITE_SPATIALREAL_AVATAR_ID`
  - `VITE_SPATIALREAL_SESSION_TOKEN` (temporary token)

## Setup

```bash
pnpm install
cp .env.example .env
```

Fill `.env` with your own values.

## Run

```bash
pnpm dev
```

Open `http://localhost:3000`, click **Connect Avatar**, then click **Send Audio**.

## Demo Audio Source

The app uses this fixed PCM URL:

`https://cdn.spatialwalk.cloud/public/website/quickstart_voice.pcm`

## Project Structure

```text
spatialreal-speech-to-avatar-quickstart/
├── .env.example
├── index.html
├── package.json
├── tsconfig.app.json
├── tsconfig.json
├── tsconfig.node.json
├── vite.config.ts
└── src/
    ├── App.vue
    ├── main.ts
    └── style.css
```
