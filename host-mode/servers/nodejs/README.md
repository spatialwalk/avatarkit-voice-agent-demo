# Host Mode Backend (Node.js)

This repository does not provide a full Host mode implementation in Node.js.

Reason: Host mode includes `ASR -> LLM -> TTS + Host Bridge`, and maintaining full parity across languages creates heavy duplication.

Recommendation:

- Use `../python` for production or full verification.
- If Node.js is required, start from thin capabilities (token/proxy) and extend as needed.
