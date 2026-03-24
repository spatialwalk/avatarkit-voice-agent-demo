# AvatarKit Voice Agent Demo

A single repo for AvatarKit demos ranging from minimal quickstarts to full voice-agent pipelines.

## Demo Index

- `livekit-agents`: primary RTC demos with two backends (`cascade`, `end-to-end`) and two frontends (`vite-react-spa`, `next`)
- `spatialreal-agent-quickstart`: minimal end-to-end RTC quickstart using a Vue frontend and a LiveKit Agents backend
- `spatialreal-speech-to-avatar-quickstart`: minimal SDK mode quickstart for connecting an avatar and sending demo audio
- `host-mode`: top-level host mode reference demos with a runnable web frontend and Python backend
- `rtc-mode`: standalone RTC connectivity validation without agent orchestration
- `sdk-mode`: top-level SDK mode reference demos imported from `avatarkit-examples`

## Project Structure

```text
avatarkit-voice-agent-demo/
├── host-mode/
├── livekit-agents/
├── rtc-mode/
├── sdk-mode/
├── spatialreal-agent-quickstart/
└── spatialreal-speech-to-avatar-quickstart/
```

## Where To Start

- Most complete demo: `livekit-agents`
- Fastest RTC quickstart: `spatialreal-agent-quickstart`
- Host mode reference: `host-mode`
- Standalone RTC connectivity check: `rtc-mode`
- SDK mode reference: `sdk-mode`

## Notes

- `livekit-agents` is now the canonical full RTC demo, so the imported `livekit-agent-framework-plugin` copy has been removed.
- The imported reference demos now sit at the repo root: `host-mode`, `rtc-mode`, and `sdk-mode`.
- Some folders inside `host-mode` are placeholders; use the Python backend and web frontend there for runnable validation.
- Several demos use the same default ports locally, so run one stack at a time unless you adjust env vars first.

## Links

- Studio: [app.spatialreal.ai](https://app.spatialreal.ai/)
- Playground: [playground.spatialreal.ai](https://playground.spatialreal.ai/)
- Docs: [docs.spatialreal.ai](https://docs.spatialreal.ai/)
