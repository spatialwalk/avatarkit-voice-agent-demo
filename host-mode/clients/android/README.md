# Host Mode — Android Client

Android client for [Host Mode](../../README.md). All AI processing (ASR → LLM → TTS) runs on the **backend**; the client records audio or sends text, then renders the avatar response.

## Prerequisites

- Android Studio (latest stable)
- Physical device or emulator (minSdk 24)
- Host mode backend running (see `../../servers/python/`)

## Setup

1. Copy `local.properties.example` to `local.properties` and edit:

   ```properties
   HOST_SERVER_URL=ws://10.0.2.2:8765/ws/agent
   SPATIALREAL_APP_ID=your_app_id
   ```

   - **Emulator**: use `10.0.2.2` (Android's alias for host loopback)
   - **Physical device**: use your machine's LAN IP (e.g. `ws://192.168.1.100:8765/ws/agent`)

   > **Tip**: Running `../../start.sh` auto-configures `local.properties` with the correct LAN IP and App ID from the backend `.env`.

2. Open the project in Android Studio and sync Gradle.

3. Run on device/emulator.

## How it works

```
User (mic/text) → Android App → WebSocket /ws/agent → Backend
                                                          ↓
                                              ASR → LLM → TTS + Host Bridge
                                                          ↓
         Android App ← JSON { audio PCM + frames } ← Backend
                ↓
       controller.yield(audioData) + yield(frames)
                ↓
           Avatar renders with synced audio
```

## Project Structure

```
app/src/main/java/ai/spatialwalk/avatarkit/hostdemo/
├── MainActivity.kt          # Entry point, initializes SDK
├── data/
│   └── Characters.kt        # Default test avatars
├── viewmodel/
│   └── AvatarViewModel.kt   # WebSocket, mic capture, avatar control
└── ui/
    ├── screens/
    │   └── PlaygroundScreen.kt   # Main UI: avatar view, controls, character list
    └── theme/
        ├── Color.kt
        └── Theme.kt
```
