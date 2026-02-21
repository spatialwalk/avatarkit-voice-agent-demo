# LiveKit Agents x SpatialReal

A voice agent using LiveKit's agents framework with a cascade pipeline: Silero VAD + Deepgram STT + OpenAI LLM + Cartesia TTS, with lip-sync avatar powered by SpatialReal.

## Setup

### 1. Environment Variables

#### Backend

Copy the example environment file and fill in your credentials:

```bash
cd backend
cp .env.example .env
```

Edit `.env` with your credentials:

```bash
# LiveKit
LIVEKIT_URL=wss://your-project.livekit.cloud
LIVEKIT_API_KEY=your_api_key
LIVEKIT_API_SECRET=your_api_secret

# OpenAI-compatible LLM
LLM_API_KEY=your_openai_api_key
LLM_MODEL=gpt-4o-mini
# LLM_BASE_URL=https://api.openai.com/v1  # Optional: for OpenAI-compatible APIs

# Deepgram STT (Speech-to-Text)
DEEPGRAM_API_KEY=your_deepgram_api_key
DEEPGRAM_MODEL=nova-3
DEEPGRAM_LANGUAGE=en-US

# Cartesia TTS (Text-to-Speech)
CARTESIA_API_KEY=your_cartesia_api_key
CARTESIA_MODEL=sonic-2
CARTESIA_LANGUAGE=en
CARTESIA_VOICE=f786b574-daa5-4673-aa0c-cbe3e8534c02

# Spatialreal Avatar
SPATIALREAL_API_KEY=your_key
SPATIALREAL_APP_ID=your_app_id
SPATIALREAL_AVATAR_ID=your_avatar_id
SPATIALREAL_CONSOLE_ENDPOINT=https://console.us-west.spatialwalk.cloud/v1/console
SPATIALREAL_INGRESS_ENDPOINT=wss://api.us-west.spatialwalk.cloud/v2/driveningress
```

#### Frontend

Copy the frontend example environment file:

```bash
cd frontend
cp .env.example .env
```

Edit `frontend/.env` with your SpatialReal avatar settings:

```bash
VITE_SPATIALREAL_APP_ID=your_app_id
VITE_SPATIALREAL_AVATAR_ID=your_avatar_id
VITE_SPATIALREAL_ENVIRONMENT=intl
```

### 2. Backend Setup

```bash
cd backend

uv sync && uv run agent.py download-files
```

### 3. Frontend Setup

```bash
cd frontend

pnpm i
```

## Running the Application

### 1. Start the Token Server

```bash
cd backend

uv run token_server.py
```

The token server will run on http://localhost:8080

### 2. Start the Voice Agent

In a new terminal:

```bash
cd backend

uv run agent.py dev
```

### 3. Start the Frontend

In a new terminal:

```bash
cd frontend

pnpm dev
```

Open http://localhost:3000 in your browser.

## Documentation

Detailed documentation can be found [here](https://docs.spatialreal.ai/guide/rtc-mode)
