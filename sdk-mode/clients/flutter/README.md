# SDK Mode — Flutter Client

Flutter client for [SDK Mode](../../README.md). The client drives the avatar directly via the AvatarKit SDK — no backend server needed. Pre-recorded PCM audio files are sent to the avatar for testing.

## Prerequisites

- Flutter 3.10.0+ / Dart 3.0.0+
- Physical device or emulator/simulator (iOS 16+, Android API 24+)
- App ID and Session Token from [SpatialReal Developer Platform](https://dash.spatialreal.ai)

## Setup

1. Install dependencies:

   ```bash
   flutter pub get
   ```

2. Run on iOS:

   ```bash
   cd ios && pod install && cd ..
   flutter run
   ```

   Run on Android:

   ```bash
   flutter run
   ```

3. In the app, enter your **App ID** and **Session Token**, select environment, then tap **Initialize SDK**.

4. On the Playground screen, select a character and tap **Start** to connect. Choose an audio file on the right to send it to the avatar.

## How it works

```
Pre-recorded PCM audio → controller.send(chunk, end: isLast)
                              ↓
                    AvatarKit SDK (WebSocket to SpatialReal)
                              ↓
                    Avatar renders animation
```
