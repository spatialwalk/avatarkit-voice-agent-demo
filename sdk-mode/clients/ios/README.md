# SDK Mode iOS Client

SwiftUI sample implementing the same avatar conversation pipeline as Web:

`VAD -> ASR (OpenAI) -> LLM (streaming) -> TTS (OpenAI) -> AvatarKit SDK`

## Requirements

- Xcode 16+
- iOS 16+
- Apple Silicon Mac (recommended for simulator rendering)

## Session Token (Manual)

Aligned with Android:

- Do not fetch token from local backend in this sample.
- Paste Session Token manually in UI.
- Token is validated when tapping `Start Conversation`.

- Token guide: `https://docs.spatialreal.ai/overview/get-apikeys#temporary-session-token`

## Quick Start

```bash
brew install xcodegen
cd sdk-mode/clients/ios
xcodegen generate
open AvatarDemo.xcodeproj
```

## SDK Version

- iOS AvatarKit: prebuilt `AvatarKit.xcframework` (downloaded by build script)
- Android AvatarKit: `ai.spatialwalk:avatarkit:1.0.0-beta36`

## Configuration

Edit `AvatarDemo/Config.swift`:

- SpatialReal App ID / API Key: https://docs.spatialreal.ai/overview/get-apikeys
- SpatialReal Avatar ID (test avatars): https://docs.spatialreal.ai/overview/test-avatars
- Temporary Session Token: https://docs.spatialreal.ai/overview/get-apikeys#temporary-session-token
- OpenAI API Key: https://platform.openai.com/api-keys

- `appID`
- `avatarID`
- `openAIApiKey`
- `openAISttLanguage`
- `avatarSampleRate`

`Session Token` is not stored in `Config.swift`; paste it in UI at runtime.

## Notes

- iOS `AvatarKit.xcframework` is downloaded automatically on first build.
- Simulator supports mic input from Mac.
- If `sessionTokenInvalid` appears, check token type, token age, app/environment match.
