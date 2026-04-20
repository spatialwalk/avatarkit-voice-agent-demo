# SDK Mode Android Client

Kotlin + Compose sample implementing the same pipeline as Web / iOS:

`VAD -> ASR -> LLM (stream) -> TTS -> Avatar`

## Requirements

- Android Studio (latest stable)
- JDK 17
- Android API 24+
- arm64-v8a device (real device recommended)

## Session Token (Manual)

Aligned with iOS:

- The app does not request a local token server.
- Paste session token manually in UI.
- Token is validated when `Start Conversation` is tapped.

- Token guide: `https://docs.spatialreal.ai/overview/get-apikeys#temporary-session-token`

## SDK Version

- Android AvatarKit: `ai.spatialwalk:avatarkit:1.0.0-beta36`
- iOS AvatarKit: prebuilt `AvatarKit.xcframework` (downloaded by iOS build script)

## Stage Background

Uses local static asset:

- `app/src/main/res/drawable/avatar_bg.webp`

## Configuration

```bash
cp local.properties.example local.properties
```

Fill at least:

- SpatialReal App ID / API Key: https://docs.spatialreal.ai/overview/get-apikeys
- SpatialReal Avatar ID (test avatars): https://docs.spatialreal.ai/overview/test-avatars
- Temporary Session Token: https://docs.spatialreal.ai/overview/get-apikeys#temporary-session-token
- OpenAI API Key: https://platform.openai.com/api-keys

- `SPATIALREAL_APP_ID`
- `SPATIALREAL_AVATAR_ID`
- `OPENAI_API_KEY`
- `OPENAI_USE_PROXY=false`

`Session Token` is not configured in files; it is pasted at runtime in UI.

## Build

```bash
JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home" ./gradlew :app:assembleDebug
```

Install with Android Studio or adb.

## Run Flow

1. Initialize Avatar.
2. Paste Session Token in UI.
3. Tap `Start Conversation`.
4. Speak and pause to trigger one full round.

## Dependency Rules

**All third-party libraries used in demo source code must be explicitly declared in `build.gradle.kts`.**

Do NOT rely on transitive dependencies from the AvatarKit SDK (or any other library). The SDK's internal dependencies (e.g. OkHttp, Ktor) may change between versions, and transitive dependencies are not guaranteed to be exposed to consumers.

Example: if demo code imports `okhttp3.*`, then `implementation(libs.okhttp)` must appear in `app/build.gradle.kts` — even if it "works" locally through SDK transitive deps.

### Verification before publishing

Run a clean build to catch missing dependencies:

```bash
# Clear local caches that might hide missing deps
rm -rf ~/.gradle/caches/modules-2/files-2.1/ai.spatialwalk
rm -rf app/build

# Build from scratch
./gradlew :app:assembleDebug --refresh-dependencies
```

If this fails with "Unresolved reference", the demo is missing an explicit dependency declaration.

## Notes

- This sample calls OpenAI directly from client for demo use.
- If you see `sessionTokenInvalid`, verify token type, expiration, app ID, and environment.
