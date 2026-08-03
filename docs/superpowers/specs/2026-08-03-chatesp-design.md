# ChatESP Design Specification

## Goal

ChatESP is an ESP32 WROOM-32 direct gateway that hosts a browser chat interface and calls OpenAI, Anthropic, Google Gemini, or Ollama APIs over Wi-Fi. The browser selects a provider and a model discovered live from that provider; no model names are preconfigured in the firmware.

## Constraints and assumptions

- Target board: classic ESP32 WROOM-32 / ESP32 DevKit-compatible board.
- Build tool: PlatformIO with the Arduino framework; upload/monitor through PlatformIO or `esptool`.
- Wi-Fi SSID and password are intentionally editable in `src/secrets.h`.
- Provider keys are also editable in `src/secrets.h`; the README will warn that firmware-stored keys are recoverable from the device.
- Ollama is accessed through a configurable LAN URL such as `http://192.168.1.100:11434`; `localhost` refers to the ESP32 itself and is not a valid computer address.
- The ESP32 serves HTTP on port 80. TLS is used for public provider APIs through `WiFiClientSecure` with certificate validation disabled in this first version to stay within the ESP32 memory/tooling budget; this limitation is documented.

## Architecture

The firmware has four focused areas:

1. `secrets.h`: user-editable Wi-Fi, API keys, and Ollama base URL.
2. `main.cpp`: Wi-Fi connection, HTTP server routes, request parsing, and serial diagnostics.
3. Provider adapter functions: live model discovery and chat request construction/response normalization for OpenAI-compatible, Anthropic, Gemini, and Ollama APIs.
4. Embedded web UI: a compact single-page application served from flash, with provider/model selectors, chat history, prompt box, send/reset controls, and status/error display.

The browser talks only to the ESP32:

```text
Browser -> GET /api/models?provider=... -> ESP32 -> provider model endpoint
Browser -> POST /api/chat -> ESP32 -> provider chat endpoint -> ESP32 -> Browser
Browser -> GET / -> embedded ChatESP HTML/CSS/JS
```

## API contract

- `GET /api/health` returns `{ "ok": true, "wifi": true, "ip": "..." }`.
- `GET /api/models?provider=openai|anthropic|google|ollama` returns `{ "provider": "...", "models": [{"id":"...","name":"..."}] }` or a structured error.
- `POST /api/chat` accepts `{ "provider":"...", "model":"...", "messages":[{"role":"user|assistant|system","content":"..."}], "temperature": 0..2 }` and returns `{ "provider":"...", "model":"...", "content":"..." }` or a structured error.
- Request bodies are bounded to avoid exhausting RAM. Chat history is capped by the browser and firmware.

Provider mappings:

- OpenAI: `/v1/models`, `/v1/chat/completions`.
- Anthropic: `/v1/models`, `/v1/messages`, with the latest user/assistant turns converted to Anthropic format and the system message separated.
- Google: `v1beta/models`, `models/{model}:generateContent`, with model IDs normalized if the API returns a `models/` prefix.
- Ollama: `/api/tags`, `/api/chat`.

## Error handling

Connection failures, missing keys, non-2xx provider responses, malformed JSON, unsupported providers, and missing model IDs return HTTP 4xx/5xx JSON errors. Serial output includes route/provider/status diagnostics without printing API keys. The UI keeps the current conversation when a request fails and shows a readable error.

## Verification

- Static checks: inspect project structure, compile with PlatformIO, and verify no model list is hardcoded in the selector logic.
- Device checks when connected: flash with `esptool`, open serial monitor, verify Wi-Fi IP, load `/`, call health/model routes, and send one chat request using a configured provider.
- If no serial device is detected, provide the exact command and explain that upload is pending hardware connection/port selection.

## Out of scope for v1

- User authentication, multi-user access control, HTTPS serving from the ESP32, streaming tokens, file uploads, image input, persistent chat history, and secure key storage.

