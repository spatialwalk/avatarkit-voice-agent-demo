# LiveKit Voice Agent with Turn Detection

A voice agent using LiveKit's agents framework with Volcengine doubao e2e realtime model and external turn detection.

## Features

- **Voice Interaction**: Real-time voice conversation with AI
- **Text Input**: Send text messages to the agent
- **Turn Detection**: External turn detection using MultilingualModel + Silero VAD
- **Voice Activity Indicator**: Visual feedback when user is speaking
- **Transcript View**: Display of conversation history

## Project Structure

```
livekit-e2e-with-turn-detect/
├── backend/
│   ├── agent.py              # Main agent with turn detection
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
- Volcengine account with realtime model and STT access

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

# Volcengine Realtime Model
VOLCENGINE_REALTIME_APP_ID=your_app_id
VOLCENGINE_REALTIME_ACCESS_TOKEN=your_token

# Volcengine STT (for turn detection)
VOLCENGINE_STT_APP_ID=your_stt_app_id
VOLCENGINE_STT_ACCESS_TOKEN=your_stt_token
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
npm install
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
npm run dev
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

### Backend

- **Volcengine RealtimeModel**: End-to-end speech model (doubao)
- **MultilingualModel**: External turn detector from `livekit.plugins.turn_detector`
- **Silero VAD**: Voice activity detection
- **Volcengine STT**: Provides transcripts for turn detection

### Frontend

- **LiveKitRoom**: Manages room connection
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
