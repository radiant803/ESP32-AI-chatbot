# ChatESP UI and Persistent Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the current ChatESP page with the supplied light workspace UI and add persistent browser-editable provider settings plus local conversations.

**Architecture:** ESP32 NVS stores provider secrets and Ollama configuration through a small config API. The embedded browser app owns conversations in localStorage and renders chat, setup, settings, and help views. Existing provider adapters read NVS first and compile-time secrets second.

**Tech Stack:** ESP32 Arduino, PlatformIO, ArduinoJson 7, Preferences/NVS, WebServer, embedded HTML/CSS/JavaScript, browser localStorage.

## Global Constraints

- API keys are never logged, rendered, returned, or included in browser conversation objects.
- Keys persist across reboot and normal application reflashing, and are removed only through explicit delete or full flash erase.
- Conversations stay in browser localStorage, not ESP32 flash.
- The UI receives key presence/masked status, never full stored secrets.
- Inputs and chat history are bounded for ESP32 RAM and browser storage.
- The interface remains local-network HTTP without authentication; README warns against public exposure.
- Existing live model discovery remains dynamic with no preset model list.

### Task 1: Add NVS-backed configuration storage

**Files:**
- Create: `ChatESP/src/config_store.h`
- Create: `ChatESP/src/config_store.cpp`
- Modify: `ChatESP/platformio.ini`

**Interfaces:**
- `void configStoreBegin()` initializes `Preferences`.
- `String configuredSecret(const String& provider)` returns NVS value or compile-time fallback.
- `bool saveProviderSecret(const String& provider, const String& value)` validates and writes one value.
- `bool deleteProviderSecret(const String& provider)` deletes one NVS value.
- `String configuredOllamaUrl()` returns NVS URL or `OLLAMA_BASE_URL` fallback.
- `bool saveDefaults(const String& provider, const String& model, float temperature)` and `void loadDefaults(...)` persist UI defaults.
- `String configStatusJson()` returns masked JSON with `hasKey`, Ollama host-only status, defaults, Wi-Fi state, and IP.

- [ ] **Step 1: Add `Preferences` dependency and storage namespace**

  Use the built-in ESP32 `Preferences` library with namespace `chatesp`, keys `openai_key`, `anthropic_key`, `google_key`, `ollama_url`, `default_provider`, `default_model`, and `temperature`.

- [ ] **Step 2: Implement fallback and bounded writes**

  Map provider names to NVS keys, cap secrets at 512 characters, cap Ollama URL at 160 characters, trim whitespace, and reject unsupported providers or empty values.

- [ ] **Step 3: Implement masked status serialization**

  Return booleans and a sanitized URL host only; never serialize the stored key string.

- [ ] **Step 4: Build-check storage code**

  Run `pio run` and fix compile errors.

### Task 2: Route provider adapters through NVS configuration

**Files:**
- Modify: `ChatESP/src/providers.cpp`
- Modify: `ChatESP/src/providers.h` if declarations are needed

**Interfaces:**
- All existing `fetchModels(provider)` and `generateChat(provider, model, messagesJson, temperature)` signatures remain unchanged.
- Provider keys and Ollama URL are obtained only through `configuredSecret()` and `configuredOllamaUrl()`.

- [ ] **Step 1: Replace compile-time key reads**

  Use local `String` values from config store for OpenAI, Anthropic, and Google requests, preserving existing provider headers and error messages.

- [ ] **Step 2: Replace compile-time Ollama URL reads**

  Use the NVS-first URL for `/api/tags` and `/api/chat`.

- [ ] **Step 3: Verify no secrets are logged or returned**

  Search providers and config code for key serialization/serial output and run a successful build.

### Task 3: Add configuration API routes

**Files:**
- Modify: `ChatESP/src/main.cpp`
- Modify: `ChatESP/src/config_store.h`

**Interfaces:**
- `GET /api/config` returns masked configuration status.
- `POST /api/config` accepts provider, apiKey, ollamaUrl, defaultModel, and temperature.
- `DELETE /api/config/key?provider=...` deletes exactly one stored provider secret or Ollama URL.

- [ ] **Step 1: Initialize config storage in `setup()`**

  Call `configStoreBegin()` before Wi-Fi and route registration.

- [ ] **Step 2: Implement GET config route**

  Call `configStatusJson()` and return JSON without key material.

- [ ] **Step 3: Implement save route**

  Parse and bound the body, write only supplied fields, persist defaults, and return HTTP 400 for invalid provider/value and HTTP 500 for NVS failure.

- [ ] **Step 4: Implement delete route**

  Validate provider and remove only that provider’s NVS value, returning updated masked status.

- [ ] **Step 5: Build-check firmware routes**

  Run PlatformIO compile and confirm the new routes are registered once.

### Task 4: Replace the embedded web UI

**Files:**
- Replace: `ChatESP/src/web_ui.h`

**Interfaces:**
- `const char CHAT_ESP_HTML[] PROGMEM` serves the complete responsive application.
- JavaScript uses `/api/config`, `/api/models`, `/api/chat`, and `/api/config/key`.

- [ ] **Step 1: Implement the reference layout and navigation**

  Add the light canvas, purple accent, sidebar, Chat/Settings/Help views, connection badge, and responsive breakpoints based on the supplied references.

- [ ] **Step 2: Implement local conversation storage**

  Store conversations under `chatesp.conversations`, cap to 12 conversations and 12 messages each, derive titles from the first user message, and support New chat, open, rename, and delete.

- [ ] **Step 3: Implement provider setup**

  Load masked config, show provider/API-key/Ollama controls, fetch live models on provider change, test connection by calling model discovery, save settings, and never put saved keys into conversation state.

- [ ] **Step 4: Implement settings key management**

  Show masked presence only, provide Save/Update and Delete key actions, clear secret inputs after saving, and update status after delete.

- [ ] **Step 5: Implement chat composer and starter cards**

  Support Enter-to-send, Shift+Enter newline, live provider/model header, starter prompts, bounded message rendering, errors, and reset/new conversation.

- [ ] **Step 6: Build-check embedded HTML**

  Compile with PlatformIO and confirm flash usage remains within the default partition.

### Task 5: Update documentation and verify on hardware

**Files:**
- Modify: `ChatESP/README.md`
- Modify: `ChatESP/docs/superpowers/specs/2026-08-03-chatesp-ui-nvs-design.md` only if implementation-specific details need correction

**Interfaces:**
- README documents browser key setup, persistence/delete behavior, local conversation storage, and security limitations.

- [ ] **Step 1: Document migration behavior**

  Explain that values in NVS take precedence over `secrets.h`, deleting a browser key exposes the compile-time fallback if one exists, and full erase removes NVS.

- [ ] **Step 2: Rebuild and flash**

  Run `pio run -t upload --upload-port /dev/cu.usbserial-0001`.

- [ ] **Step 3: Verify config lifecycle**

  Use the printed URL to GET `/api/config`, save a test key through the UI/API, verify `hasKey: true`, delete it, and verify `hasKey: false` without exposing its contents.

- [ ] **Step 4: Verify conversation lifecycle**

  Create, reopen, rename, delete, and reload a conversation in the browser; verify messages remain local and chat still calls the ESP32.

- [ ] **Step 5: Verify visual layout**

  Render/inspect the page at desktop and narrow viewport sizes and correct clipping, overflow, or unreadable text before handoff.

