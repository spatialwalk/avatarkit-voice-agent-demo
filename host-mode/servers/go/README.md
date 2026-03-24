# Host Mode Backend (Go)

This repository does not provide a full Host mode implementation in Go.

Reason: Host mode includes `ASR -> LLM -> TTS + Host Bridge`, and maintaining full parity across languages creates heavy duplication.

Recommendation:

- Use `../python` for production or full verification.
- If Go is required, start from thin capabilities (token/proxy) and extend as needed.
