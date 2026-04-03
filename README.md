<p align="center">
  <img src="./assets/banner.png" alt="AvatarKit Voice Agent Demo" width="100%" />
</p>

<p align="left">
  <a href="#license"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License" /></a>
  <img src="https://img.shields.io/badge/platform-Web%20%7C%20iOS%20%7C%20Android%20%7C%20Flutter-orange.svg" alt="Platform" />
</p>

---

## About This Repo

A collection of demo projects showing how to integrate [AvatarKit](https://docs.spatialreal.ai/) into voice agent applications. Covers multiple integration modes (SDK, Host, RTC), frontend frameworks (React, Vue, Next.js), and backend strategies — from minimal quickstarts to production-ready pipelines.

- **End-to-end examples** — Each demo is self-contained with frontend, backend, and environment config
- **Multiple architectures** — Client-side pipeline, server-side pipeline, and RTC-based agent frameworks
- **Multi-provider backends** — Swap between OpenAI, Google Gemini, Deepgram, Cartesia, Azure, AWS, and more
- **Cross-platform references** — Web, iOS, Android, and Flutter client implementations

## Demos

Sorted from simplest to most advanced:

| Demo | Mode | Backend | Frontend | Difficulty | Description |
|------|------|---------|----------|:----------:|-------------|
| [spatialreal-speech-to-avatar-quickstart](./spatialreal-speech-to-avatar-quickstart) | SDK | — | Vue | ⭐ | Minimal avatar + audio streaming |
| [spatialreal-agent-quickstart](./spatialreal-agent-quickstart) | RTC | LiveKit Agents | React (AvatarKit UI) | ⭐ | Fastest RTC voice agent quickstart |
| [sdk-mode](./sdk-mode) | SDK | Token only | Web (React), iOS, Android | ⭐⭐ | Client-side conversation pipeline |
| [livekit-agents](./livekit-agents) | RTC | Cascade / End-to-End | React, Next.js | ⭐⭐ | Full-featured voice agent pipeline |
| [rtc-mode](./rtc-mode) | RTC | Token only | Web (React) | ⭐⭐⭐ | RTC connectivity validation |
| [host-mode](./host-mode) | Host | Python | Web (JS), iOS, Android, Flutter | ⭐⭐⭐⭐ | Full server-side pipeline with multi-platform clients |

> **New here?** Start with [`spatialreal-agent-quickstart`](./spatialreal-agent-quickstart) — it's the fastest way to get a working voice agent with a lip-synced avatar.

## LiveKit Agent Quick Start

```bash
# Clone the repo
git clone https://github.com/spatialwalk/avatarkit-voice-agent-demo.git
cd avatarkit-voice-agent-demo/spatialreal-agent-quickstart

# Set up environment variables
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
# Fill both .env files with your credentials

# Install dependencies
cd backend && uv sync && cd ..
cd frontend && pnpm install && cd ..
```

Then open three terminals:

```bash
# Terminal 1 — Token server
cd backend && uv run token_server.py

# Terminal 2 — Agent worker
cd backend && uv run agent.py dev

# Terminal 3 — Frontend
cd frontend && pnpm dev
```

Open `http://localhost:3000`, click **Connect**, then **Start Mic**.

## Prerequisites

| Tool | Version |
|------|---------|
| Node.js | 18+ |
| pnpm | latest |
| Python | 3.10+ |
| uv | latest |

You will also need:

- A **SpatialReal** account — [Create one in Studio](https://app.spatialreal.ai/)
- A **LiveKit Cloud** account (or self-hosted LiveKit server) — [cloud.livekit.io](https://cloud.livekit.io/)
- API keys for your chosen LLM / TTS / STT providers

## Links

- [Studio](https://app.spatialreal.ai/) — Manage apps, avatars, and API keys
- [Playground](https://playground.spatialreal.ai/) — Try avatars in the browser
- [Documentation](https://docs.spatialreal.ai/) — Guides and API reference

## Community & Support

- [Discord](https://discord.com/invite/dRSUTdPCjm) — Chat with the community


## License

MIT
