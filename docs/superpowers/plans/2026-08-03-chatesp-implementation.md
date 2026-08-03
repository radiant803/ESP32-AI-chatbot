# ChatESP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a flashable ESP32 WROOM-32 direct-gateway chatbot named ChatESP with live model discovery for OpenAI, Anthropic, Google Gemini, and Ollama.

**Architecture:** A PlatformIO Arduino project runs an ESP32 HTTP server, serves an embedded single-page web app, discovers models through provider APIs, and translates one normalized chat request into provider-specific HTTPS requests. User credentials and Wi-Fi settings live in a clearly marked `src/secrets.h` file.

**Tech Stack:** PlatformIO, Arduino framework, ESP32 WiFi/WebServer/HTTPClient/WiFiClientSecure, ArduinoJson, embedded HTML/CSS/JavaScript, esptool.

## Global Constraints

- Target board is classic ESP32 WROOM-32 / ESP32 DevKit-compatible.
- Wi-Fi SSID/password and provider keys are editable in `src/secrets.h`.
- Ollama uses an editable LAN URL; `localhost` is invalid for reaching a computer.
- Model selectors are populated from live provider responses and contain no preset model list.
- The firmware must not print API keys to serial logs.
- Public provider TLS uses `WiFiClientSecure`; certificate validation is disabled in v1 and documented.
- Request bodies and browser chat history are bounded to preserve ESP32 RAM.

### Task 1: Scaffold the PlatformIO project and secrets template

**Files:**
- Create: `ChatESP/platformio.ini`
- Create: `ChatESP/src/secrets.h.example`
- Create: `ChatESP/.gitignore`
- Create: `ChatESP/README.md`

**Interfaces:**
- Produces a PlatformIO environment named `esp32dev` using `board = esp32dev` and Arduino framework.
- Defines secret macros/const char values for `WIFI_SSID`, `WIFI_PASSWORD`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_API_KEY`, and `OLLAMA_BASE_URL`.

- [ ] **Step 1: Write project metadata and dependency configuration**

  Use ArduinoJson 7.x as a PlatformIO library dependency and set serial monitor speed to 115200.

- [ ] **Step 2: Add the secrets template and ignore local secrets**

  Make `secrets.h.example` compile-ready with empty key strings and a commented LAN Ollama URL; ignore `src/secrets.h`.

- [ ] **Step 3: Write setup and flashing documentation**

  Document `cp src/secrets.h.example src/secrets.h`, edit values, `python -m pip install esptool`, `pio run`, `pio run -t upload`, and manual `esptool` commands using the generated `.pio/build/esp32dev/firmware.bin`. Explain selecting `/dev/cu.*` on macOS and the physical-key warning.

- [ ] **Step 4: Verify the scaffold**

  Run `pio project config` if PlatformIO is available; otherwise inspect the files and record that compilation awaits PlatformIO installation.

### Task 2: Implement provider adapters and normalized HTTP JSON helpers

**Files:**
- Create: `ChatESP/src/providers.h`
- Create: `ChatESP/src/providers.cpp`

**Interfaces:**
- `struct ProviderResult { bool ok; int status; String error; String payload; }`.
- `ProviderResult fetchModels(const String& provider)` returns normalized `{ "provider": ..., "models": [...] }` JSON.
- `ProviderResult generateChat(const String& provider, const String& model, const String& messagesJson, float temperature)` returns normalized `{ "provider": ..., "model": ..., "content": ... }` JSON.

- [ ] **Step 1: Add bounded HTTP and JSON utilities**

  Implement HTTPS setup, timeout, response-size checks, non-2xx conversion to JSON errors, and helpers that serialize errors without logging credential values.

- [ ] **Step 2: Implement live model discovery**

  Implement OpenAI `/v1/models`, Anthropic `/v1/models`, Google `v1beta/models`, and Ollama `/api/tags`; extract returned IDs at runtime and filter only entries that are usable for chat based on provider response metadata where available.

- [ ] **Step 3: Implement chat translation**

  Implement OpenAI-compatible chat completions, Anthropic messages with separated system prompt, Google `generateContent` contents/parts, and Ollama `/api/chat`; parse each provider response into one `content` string.

- [ ] **Step 4: Add provider-specific validation**

  Return clear errors for missing keys, blank model, malformed message JSON, unsupported provider, and blank Ollama URL.

- [ ] **Step 5: Compile-check provider code**

  Run `pio run`; if unavailable, use a documented fallback syntax review and do not claim a successful firmware build.

### Task 3: Implement ESP32 server routes and Wi-Fi lifecycle

**Files:**
- Create: `ChatESP/src/main.cpp`
- Modify: `ChatESP/src/providers.h` if route-facing declarations need adjustment

**Interfaces:**
- `GET /` serves the embedded UI from `web_ui.h`.
- `GET /api/health` returns Wi-Fi state and local IP.
- `GET /api/models?provider=...` calls `fetchModels`.
- `POST /api/chat` validates the normalized request and calls `generateChat`.

- [ ] **Step 1: Add Wi-Fi connection code**

  Use the editable secrets values, print connection progress and IP to serial, and keep the server responsive with a bounded reconnect loop.

- [ ] **Step 2: Add HTTP routes and CORS-free same-origin handling**

  Parse query/body values, cap request body size, set JSON content type, and return correct 4xx/5xx status codes and structured error objects.

- [ ] **Step 3: Add serial diagnostics**

  Log route, provider, model ID, and status only; never log key strings or full Authorization headers.

- [ ] **Step 4: Compile-check the firmware**

  Run `pio run` and fix compiler warnings/errors until the ESP32 environment builds.

### Task 4: Add the embedded ChatESP web interface

**Files:**
- Create: `ChatESP/src/web_ui.h`

**Interfaces:**
- `const char CHAT_ESP_HTML[]` contains the complete HTML/CSS/JavaScript page.
- JavaScript calls `/api/health`, `/api/models`, and `/api/chat` using same-origin `fetch`.

- [ ] **Step 1: Build the compact responsive layout**

  Include ChatESP branding, provider/model controls, temperature control, message list, prompt textarea, send/reset actions, and a connection/error status area.

- [ ] **Step 2: Implement live model loading**

  Reload `/api/models` on provider change, render only returned models, disable send while loading, and display empty/error states rather than inserting fallback models.

- [ ] **Step 3: Implement bounded conversation sending**

  Keep at most 12 messages and 16,000 total prompt characters in the browser, send the normalized request, append the response, and preserve history when errors occur.

- [ ] **Step 4: Verify browser syntax and embedded size**

  Check the literal compiles as a C++ string and inspect the generated firmware size after Task 3 integration.

### Task 5: Integrate, document, and attempt hardware upload

**Files:**
- Modify: `ChatESP/README.md`
- Create: `ChatESP/tools/flash.sh`

**Interfaces:**
- `tools/flash.sh <serial-port>` invokes `esptool.py` with the generated firmware and bootloader/partition artifacts or explains when PlatformIO upload is preferred.

- [ ] **Step 1: Add the flash helper**

  Validate that exactly one explicit serial-port argument is provided, call `pio run` first, then invoke `esptool.py` with the PlatformIO-generated bootloader, partitions, and firmware addresses.

- [ ] **Step 2: Run full static/build verification**

  Run `pio run`, inspect size output, confirm `src/secrets.h` is ignored, and search the UI/firmware for hardcoded model IDs.

- [ ] **Step 3: Detect the connected device**

  List `/dev/cu.*` and `/dev/tty.*` devices. If a likely ESP32 serial device exists, flash it with the helper; otherwise report the exact command needed once the board is connected.

- [ ] **Step 4: Verify serial boot output**

  Open a 115200-baud monitor if the port is available, record the IP address, and document the first browser URL and provider setup steps.

