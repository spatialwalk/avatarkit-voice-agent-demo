# agents-js backend

TypeScript backend example for `livekit-agents` using:

- `@livekit/agents`
- the current SpatialReal `livekit-plugins-spatialreal-js` / `avatarkit-server` source vendored locally under `src/vendor`
- the existing `/token` flow used by this repository's frontend demos

## Setup

```bash
cp .env.example .env
pnpm install
```

This example uses LiveKit Inference models by default, so it only requires LiveKit and SpatialReal credentials.

The upstream SpatialReal GitHub packages currently do not ship build artifacts when installed as Git dependencies, so this example vendors the minimum runtime source needed for a fresh `pnpm install` to work reliably.

## Run locally

Start the token server:

```bash
pnpm token-server
```

In another terminal, start the agent worker:

```bash
pnpm dev
```

Then run either frontend from `../../frontend`.

## Validation

```bash
pnpm typecheck
pnpm build
```
