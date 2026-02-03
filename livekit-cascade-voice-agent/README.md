# LiveKit Cascade Voice Agent

A voice agent using LiveKit's agents framework with a cascade pipeline: Silero VAD + Volcengine STT + Turn Detection + OpenAI LLM + Volcengine TTS.

## Features

- **Cascade Pipeline**: Modular VAD → STT → Turn Detection → LLM → TTS architecture
- **Voice Interaction**: Real-time voice conversation with AI
- **Text Input**: Send text messages to the agent
- **Turn Detection**: Smart turn detection using MultilingualModel
- **Voice Activity Indicator**: Visual feedback when user is speaking
- **Transcript View**: Display of conversation history

## Project Structure

```
livekit-cascade-voice-agent/
├── backend/
│   ├── agent.py              # Main agent with cascade pipeline
│   ├── token_server.py       # Token generation API
│   ├── pyproject.toml        # Python dependencies (uv)
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── main.tsx
│   │   ├── App.tsx
│   │   └── components/
│   │       ├── VoiceAgent.tsx
│   │       ├── AudioVisualizer.tsx
│   │       ├── ChatInput.tsx
│   │       └── TranscriptView.tsx
│   ├── index.html
│   ├── package.json
│   └── vite.config.ts
└── README.md
```

## Prerequisites

- Python 3.9+
- Node.js 18+
- [uv](https://docs.astral.sh/uv/) (Python package manager)
- LiveKit Cloud account or self-hosted LiveKit server
- Volcengine account with STT and TTS access
- OpenAI API key (or compatible API)

## Setup

### 1. Environment Variables

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

# Volcengine STT (Speech-to-Text)
VOLCENGINE_STT_APP_ID=your_stt_app_id
VOLCENGINE_STT_ACCESS_TOKEN=your_stt_token
VOLCENGINE_STT_CLUSTER=volcengine_streaming_common

# Volcengine TTS (Text-to-Speech)
VOLCENGINE_TTS_APP_ID=your_tts_app_id
VOLCENGINE_TTS_ACCESS_TOKEN=your_tts_token
VOLCENGINE_TTS_CLUSTER=volcano_tts
VOLCENGINE_TTS_VOICE=zh_female_tianmeixiaoyuan_moon_bigtts
```

### 2. Backend Setup

```bash
cd backend

# Install dependencies
uv sync
```

### 3. Frontend Setup

```bash
cd frontend

# Install dependencies
pnpm install
```

## Running the Application

### 1. Start the Token Server

```bash
cd backend
uv run python token_server.py
```

The token server will run on http://localhost:8080

### 2. Start the Voice Agent

In a new terminal:

```bash
cd backend
uv run python agent.py dev
```

### 3. Start the Frontend

In a new terminal:

```bash
cd frontend
pnpm dev
```

Open http://localhost:3000 in your browser.

## Usage

1. Click "Connect" to join the voice room
2. Allow microphone access when prompted
3. Start speaking or type a message
4. The voice activity indicator will show when you're speaking
5. The agent will respond via voice
6. Transcripts appear in the conversation view

## Architecture

### Cascade Pipeline

```
User Audio → Silero VAD → Volcengine STT → Turn Detection → OpenAI LLM → Volcengine TTS → Agent Audio
```

- **Silero VAD**: Voice activity detection - detects when user starts/stops speaking
- **Volcengine STT**: Speech-to-text - transcribes user speech
- **MultilingualModel**: Turn detection - determines when user has finished their turn
- **OpenAI LLM**: Language model - generates conversational responses
- **Volcengine TTS**: Text-to-speech - synthesizes agent voice

### Frontend

- **LiveKitRoom**: Manages room connection
- **RoomAudioRenderer**: Plays agent audio
- **AudioVisualizer**: Shows voice activity via audio analysis
- **ChatInput**: Text message input with Enter to send
- **TranscriptView**: Displays conversation with auto-scroll

## Troubleshooting

### Microphone not working
- Ensure browser has microphone permissions
- Check that no other application is using the microphone

### Agent not responding
- Verify all environment variables are set correctly
- Check the agent terminal for error messages
- Ensure the LiveKit server URL is correct

### Token server errors
- Verify LIVEKIT_API_KEY and LIVEKIT_API_SECRET are set
- Check that the token server is running on port 8080

## License

MIT
