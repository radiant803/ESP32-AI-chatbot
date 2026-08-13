# ChatESP Fresh Rebuild Design

## Purpose

Rebuild ChatESP as a responsive, direct ESP32 WROOM-32 web gateway for OpenAI, Anthropic, Google Gemini, and Ollama. The ESP32 hosts the application and keeps provider credentials in NVS; the browser is a control surface and never receives a stored secret back.

## Product decisions

- Support four provider IDs: `openai`, `anthropic`, `google`, and `ollama`.
- Discover models from the selected provider at runtime. No model IDs are compiled into the UI or firmware.
- Treat a provider key update as a **Test & Save** transaction: use the submitted secret for discovery first, persist it only after a successful response with at least one usable model.
- Show a specific, action-oriented failure state for missing configuration, DNS/TLS/network failure, timeout, rejected credentials, quota/rate limit, and unsupported provider responses. A transport failure must never be labelled an invalid API key.
- Maintain the browser's conversation list in local storage. Persist only provider configuration, default selection, and artifacts on the ESP32.
- Keep Agent mode bounded: the model produces a validated artifact plan; the browser composes the file with pinned client-side open-source libraries; the ESP32 stores, lists, downloads, and explicitly deletes the resulting file. Generated code is never executed.

## Architecture

`main.cpp` owns Wi-Fi, LittleFS/NVS startup, HTTP server lifecycle, and reconnect behaviour. `http_api.cpp` owns routes and turns requests into small typed calls. `provider_gateway.cpp` owns the provider-specific request/response mappings behind a common result shape. `config_store.cpp` owns all NVS reads/writes and never serializes a secret. `artifacts.cpp` owns safe LittleFS paths and quotas. `web_ui.h` embeds a single self-contained browser app.

The ESP32 stays a gateway rather than a proxy service: the browser calls only its local IP, and the ESP32 makes provider requests. UI state never depends on a static model list. Provider model data is always fetched on explicit setup, provider change, refresh, or first use.

## Provider contracts

| Provider | Discovery | Chat | Authentication |
| --- | --- | --- | --- |
| OpenAI | `GET /v1/models` | `POST /v1/responses` | `Authorization: Bearer` |
| Anthropic | `GET /v1/models` with pagination | `POST /v1/messages` | `x-api-key`, `anthropic-version: 2023-06-01` |
| Google Gemini | `GET /v1beta/models` with `pageSize` | `POST /v1beta/models/{id}:generateContent` | `x-goog-api-key` header |
| Ollama | `GET /api/tags` | `POST /api/chat` | configured LAN URL |

The gateway normalizes discovery to `{ provider, models: [{ id, name }] }`. It preserves provider-issued model IDs, filters Gemini results to models advertising `generateContent`, sorts results by display name, and rejects zero-model discoveries as a failed validation. Anthropic pagination is followed within a small bounded page count. OpenAI discovery is not a permission guarantee, so a model-request error remains clearly distinct from key validation.

For the current hardware test, use only `gpt-5-nano` after discovery confirms that exact ID is available. Do not issue any other OpenAI generation request during verification.

## HTTP API

| Route | Behaviour |
| --- | --- |
| `GET /api/health` | Returns Wi-Fi, station/AP IP, firmware name/version, and storage summary; never credentials. |
| `GET /api/providers` | Returns masked configuration status, Ollama host, defaults, and provider labels. |
| `POST /api/providers/validate` | Accepts a transient key or Ollama URL; fetches live models; saves only on success; returns models and safe status. |
| `GET /api/providers/models?provider=...` | Fetches live models with the saved configuration. |
| `PUT /api/preferences` | Stores default provider/model/temperature after validating types and limits. |
| `DELETE /api/providers/key?provider=...` | Removes one saved provider key or the Ollama URL and returns safe status. |
| `POST /api/chat` | Sends a bounded, normalized conversation to the selected provider. |
| `POST /api/agent/plan` | Requests and validates a bounded JSON artifact plan. |
| `GET`, `POST`, `DELETE /api/artifacts...` | Lists storage, accepts multipart upload, downloads, and deletes safe artifact names. |

Every error response has `{ "ok": false, "error": { "code", "message", "hint" } }`; successful responses include `{ "ok": true }`. No route logs, echoes, or returns a submitted API key.

## Security and resilience

- Wi-Fi credentials stay only in ignored `src/secrets.h`. Provider keys are NVS values written through the browser and omitted from every JSON response.
- Provider requests use HTTPS for cloud providers. TLS validation is intentionally disabled on this constrained prototype, so the device must remain LAN-only; the UI and README state this plainly.
- Request body limits, model count limits, response-size limits, chat-history limits, response token bounds, multipart file quotas, safe filenames, and LittleFS free-space checks prevent memory and storage exhaustion.
- A password-protected recovery AP remains available alongside station mode. The usual URL is the station IP in `/api/health`; the recovery URL is `http://192.168.4.1/` only when needed.
- HTTP calls are parsed from the response stream instead of `HTTPClient::getString()` to avoid an avoidable large temporary allocation. Small capped error bodies are retained only to build useful diagnostics.

## Browser experience

The UI is a small responsive app with a desktop sidebar and a mobile drawer. The header exposes provider/model selection, a connection indicator, and settings. The composer remains visible without forcing horizontal overflow. It uses plain ASCII labels and inline SVG/CSS icons rather than emojis.

Settings has one provider at a time, a password input, Test & Save, model refresh, delete-key confirmation, Ollama LAN URL validation, default-model selection, and useful status copy. The chat model selector stays disabled until a valid live discovery has completed. Switching providers never silently changes the selected model.

Conversation state is versioned in local storage, limited to a bounded count, and includes provider/model/temperature at the conversation level. New chat, rename, delete, and recent chats are explicit controls. Agent mode has a clear on/off control and a visible artifact progress state.

## Artifact behaviour

The model returns one bounded JSON plan with `type`, `filename`, `title`, and only the fields valid for its requested artifact kind. The browser validates that plan again and composes:

- text/code as UTF-8 blobs;
- DOCX using `docx`;
- PPTX using `PptxGenJS`;
- XLSX using `SheetJS`.

Libraries load lazily from pinned URLs only when their type is requested. The completed file downloads immediately and is uploaded to LittleFS for later download. A failed upload leaves no final artifact. Artifact generation supports text/code without browser internet access.

## Acceptance checks

1. Firmware builds for `esp32dev` and flashes through PlatformIO to `/dev/cu.usbserial-0001`.
2. The web page renders at 320 px wide without horizontal scrolling or clipped composer controls.
3. Entering a valid key and pressing Test & Save returns live models and persists only after success; deleting removes the saved key.
4. A wrong key, unavailable Wi-Fi/DNS/TLS connection, rate limit, or provider response results in a distinct correct error code and hint.
5. Saved-model refresh, main-chat model selector, and default selection use provider-returned IDs only.
6. A `gpt-5-nano` smoke chat can be requested only after it was discovered. No other OpenAI model is used in this hardware test.
7. Agent mode produces/downloads/uploads a text artifact without external libraries and can list/delete it from ESP32 storage.
