# SpatialReal Speech-to-Avatar Quickstart

Minimal Web quickstart for SpatialReal SDK Mode.

This demo provides two explicit actions:

1. Connect avatar
2. Send demo PCM audio

## Prerequisites

- Node.js 18+
- pnpm
- SpatialReal Studio values:
  - `VITE_SPATIALREAL_APP_ID` (https://app.spatialreal.ai/apps)
  - `VITE_SPATIALREAL_AVATAR_ID` (https://app.spatialreal.ai/avatars/library)
  - `VITE_SPATIALREAL_SESSION_TOKEN` (https://app.spatialreal.ai/apps) [Instruction](https://docs.spatialreal.ai/studio/aki-key#temporary-session-token)

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

The demo using a fixed mono 16kHZ PCM audio file fetched from the URL


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
