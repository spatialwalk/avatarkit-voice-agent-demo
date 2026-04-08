# Host Mode — Flutter Client

Flutter client for [Host Mode](../../README.md). All AI processing (ASR → LLM → TTS) runs on the **backend**; the client records audio or sends text, then renders the avatar response.

## Prerequisites

- Flutter 3.10.0+ / Dart 3.0.0+
- Physical device or emulator/simulator (iOS 16+, Android API 24+)
- Host mode backend running (see `../../servers/python/`)

## Credentials

- **App ID** and **API Key**: Obtain from [SpatialReal Developer Platform](https://dash.spatialreal.ai). The API Key is configured in the backend `.env` file (`../../servers/python/.env`), not in the client.
- **App ID** is the only credential the client needs — it is written to `lib/config.dart` (auto-configured by `start.sh`, or edit manually).

## Setup

1. Install dependencies:

   ```bash
   flutter pub get
   ```

2. Edit `lib/config.dart` with your App ID and backend URL:

   ```dart
   static const String appID = 'your_app_id';  // from https://dash.spatialreal.ai
   static const String hostServerURL = 'http://localhost:8765';   // emulator/simulator
   // static const String hostServerURL = 'http://192.168.x.x:8765';  // physical device
   ```

   > **Tip:** Run `../../start.sh` to auto-configure both `appID` and `hostServerURL` from the backend `.env`.

3. Run on iOS:

   ```bash
   cd ios && pod install && cd ..
   flutter run
   ```

   Run on Android:

   ```bash
   flutter run
   ```

## How it works

```
User (mic/text) → Flutter App → WebSocket /ws/agent → Backend
                                                           ↓
                                               ASR → LLM → TTS + Host Bridge
                                                           ↓
           Flutter App ← JSON { audio PCM + frames } ← Backend
                ↓
    controller.yieldAudioData() + yieldAnimations()
                ↓
           Avatar renders
```
