# Host Mode — iOS Client

iOS client for [Host Mode](../../README.md). All AI processing (ASR → LLM → TTS) runs on the **backend**; the client records audio or sends text, then renders the avatar response.

## Prerequisites

- Xcode 16+
- [XcodeGen](https://github.com/yonaskolb/XcodeGen) (`brew install xcodegen`)
- Physical device or simulator (iOS 16+)
- Host mode backend running (see `../../servers/python/`)

## Setup

1. Generate the Xcode project:

   ```bash
   xcodegen generate
   ```

2. Edit `AvatarDemo/Config.swift` with your credentials:

   ```swift
   static let appID = "your_app_id"
   static let avatarID = "your_avatar_id"
   static let hostServerURL = "http://localhost:8000"   // simulator
   // static let hostServerURL = "http://192.168.x.x:8000"  // physical device
   ```

3. Open `AvatarDemo.xcodeproj` and run.

   AvatarKit.xcframework will be downloaded automatically on first build.

## How it works

```
User (mic/text) → iOS App → POST /api/pipeline/respond → Backend
                                                              ↓
                                                  ASR → LLM → TTS + Host Bridge
                                                              ↓
              iOS App ← JSON { audio PCM + frames } ← Backend
                   ↓
          controller.yieldAudioData() + yieldFramesData()
                   ↓
              Avatar renders
```
