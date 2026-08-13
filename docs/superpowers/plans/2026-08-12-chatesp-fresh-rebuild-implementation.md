# ChatESP Fresh Rebuild Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the existing ChatESP firmware/UI with a reliable direct ESP32 gateway that securely configures providers, loads live models, chats, and creates downloadable artifacts.

**Architecture:** A small WebServer route layer delegates NVS configuration, provider HTTP translation, and LittleFS artifact storage to focused modules. The embedded browser app owns conversations and file composition while the ESP32 owns keys, provider traffic, and artifact persistence.

**Tech Stack:** ESP32 WROOM-32, Arduino framework, WebServer, WiFiClientSecure, ArduinoJson 7, Preferences/NVS, LittleFS, embedded HTML/CSS/JavaScript, PlatformIO.

## Global Constraints

- Target `esp32dev` / ESP32 WROOM-32 with the existing `partitions.csv`; preserve the 1.8 MB application and 2.2 MB LittleFS layout.
- Keep Wi-Fi SSID/password only in ignored `src/secrets.h`; never print, serialize, or commit secrets.
- Persist provider keys/defaults in NVS only after successful live model discovery; `/api` responses return status, never a key.
- Do not compile any provider model list. Discovery comes from provider endpoints at runtime.
- For the OpenAI hardware test, issue generation only with `gpt-5-nano` after its live discovery response includes it.
- Avoid emojis and nonessential Unicode in source/UI copy.
- Keep generated artifact files at or below 700 KB, reject unsafe filenames, and never execute generated code.
- Use only `apply_patch` for project source/document edits.

---

## File map

- `src/app_types.h` — shared provider, error, and HTTP result types.
- `src/config_store.h/.cpp` — NVS provider secret/default persistence and safe status JSON.
- `src/provider_gateway.h/.cpp` — bounded streamed HTTP calls plus model/chat/agent adapter contracts.
- `src/artifacts.h/.cpp` — LittleFS quota, safe names, and artifact listing/open/delete helpers.
- `src/http_api.h/.cpp` — JSON/multipart route registration and consistent endpoint envelope errors.
- `src/main.cpp` — startup, Wi-Fi/recovery AP, filesystem, API registration, and reconnect loop.
- `src/web_ui.h` — responsive browser application.
- `README.md` — installation, UI configuration, provider, security, and flash documentation.

### Task 1: Define the safe firmware contracts

**Files:**
- Create: `src/app_types.h`
- Modify: `src/config_store.h`, `src/config_store.cpp`, `src/artifacts.h`, `src/artifacts.cpp`
- Test: `pio run`

**Interfaces:**
- Produces `ApiResult`, `ProviderModel`, `ProviderModels`, and `makeError(const String&, const String&, const String&, int)` for API and gateway code.
- Produces `providerConfigured`, `saveProviderSecret`, `deleteProviderSecret`, `loadPreferences`, and `safeConfigJson`.

- [ ] **Step 1: Declare common bounded result types**

```cpp
struct ApiError { String code; String message; String hint; int httpStatus; };
struct ApiResult { bool ok; String payload; ApiError error; };
struct ProviderModel { String id; String name; };
struct ProviderModels { String provider; std::vector<ProviderModel> items; };
```

- [ ] **Step 2: Replace secret-bearing configuration output with safe status**

```cpp
JsonObject provider = doc["providers"][providerId].to<JsonObject>();
provider["configured"] = providerConfigured(providerId);
provider["label"] = providerLabel(providerId);
```

- [ ] **Step 3: Bound configuration and artifact invariants**

```cpp
bool artifactNameSafe(const String& name);  // ASCII, extension, length <= 96
constexpr size_t MAX_ARTIFACT_BYTES = 700 * 1024;
constexpr size_t MAX_PROVIDER_KEY_BYTES = 512;
```

- [ ] **Step 4: Compile the contract layer**

Run: `pio run`

Expected: firmware compiles without any stored secret appearing in output.

### Task 2: Rebuild provider discovery and chat gateway

**Files:**
- Create: `src/provider_gateway.h`, `src/provider_gateway.cpp`
- Modify: `platformio.ini`
- Test: `pio run`

**Interfaces:**
- Consumes `ApiResult`, `ProviderModels`, preferences/configuration readers.
- Produces `discoverModels(const String&, const String&, const String&, ProviderModels&)`, `chatCompletion(const String&, const String&, const String&, float)`, and `agentPlan(const String&, const String&, const String&, float)`.

- [ ] **Step 1: Implement a capped streamed HTTP request helper**

```cpp
ApiResult requestJson(const HttpRequest& request, JsonDocument& response) {
  // Set a 25 second timeout, send headers/body, and deserialize success from getStreamPtr().
  // For non-2xx status, read at most 1536 bytes and return a mapped ApiError.
}
```

- [ ] **Step 2: Normalize provider failure codes**

```cpp
if (status < 0) return makeError("network_unreachable", "The ESP32 could not reach the provider.", "Check Wi-Fi, DNS, TLS, and the Ollama LAN URL.", 502);
if (status == 401 || status == 403) return makeError("authentication_failed", "The provider rejected the credential.", "Paste a current key and run Test & Save again.", status);
if (status == 429) return makeError("rate_limited", "The provider is rate-limiting this request.", "Wait a moment, then retry.", 429);
if (status >= 500) return makeError("provider_unavailable", "The provider is temporarily unavailable.", "Retry later; your saved key is unchanged.", 502);
```

- [ ] **Step 3: Implement dynamic discovery adapters**

```cpp
ApiResult fetchOpenAiModels(const String& key, ProviderModels& out);       // GET /v1/models
ApiResult fetchAnthropicModels(const String& key, ProviderModels& out);    // GET /v1/models, max 3 pages
ApiResult fetchGeminiModels(const String& key, ProviderModels& out);       // GET /v1beta/models, generateContent filter
ApiResult fetchOllamaModels(const String& baseUrl, ProviderModels& out);   // GET <host>/api/tags
```

- [ ] **Step 4: Implement current message request shapes**

```cpp
// OpenAI: POST /v1/responses and extract output_text/content output text.
// Anthropic: POST /v1/messages, x-api-key + anthropic-version.
// Gemini: POST /v1beta/models/{id}:generateContent, x-goog-api-key.
// Ollama: POST /api/chat with stream:false.
```

- [ ] **Step 5: Validate model names and agent plans**

```cpp
bool validModelId(const String& value); // length <= 128, printable, no URL path control chars
bool validateArtifactPlan(JsonDocument& plan, ApiError& error);
```

- [ ] **Step 6: Compile provider gateway**

Run: `pio run`

Expected: a successful build; no `HTTPClient::getString()` provider response path remains.

### Task 3: Build transactional configuration and route layer

**Files:**
- Create: `src/http_api.h`, `src/http_api.cpp`
- Modify: `src/main.cpp`
- Test: `pio run`, browser/HTTP smoke test after flashing

**Interfaces:**
- Consumes the Task 1 and Task 2 contracts and `WebServer`.
- Produces `registerApiRoutes(WebServer&)`.

- [ ] **Step 1: Add a uniform JSON response envelope**

```cpp
void sendOk(WebServer& server, JsonDocument& body);
void sendError(WebServer& server, const ApiError& error);
```

- [ ] **Step 2: Implement Test & Save with transient credentials**

```cpp
// POST /api/providers/validate
// 1. validate request fields; 2. discover with submitted key; 3. reject zero models;
// 4. write NVS only after success; 5. return discovered models and safe status.
```

- [ ] **Step 3: Implement safe configuration and preferences routes**

```cpp
GET /api/health
GET /api/providers
GET /api/providers/models?provider=<provider-id>
PUT /api/preferences
DELETE /api/providers/key?provider=<provider-id>
```

- [ ] **Step 4: Implement bounded chat, agent, and multipart artifact routes**

```cpp
POST /api/chat
POST /api/agent/plan
GET|POST|DELETE /api/artifacts
GET /api/artifacts/download?name=<safe-file-name>
```

- [ ] **Step 5: Compile routes and startup**

Run: `pio run`

Expected: all route modules link with no unresolved symbols.

### Task 4: Rebuild the responsive browser application

**Files:**
- Modify: `src/web_ui.h`
- Test: `pio run`; manual 320 px, 768 px, and desktop browser checks after flash

**Interfaces:**
- Consumes only documented endpoints from Task 3.
- Produces local-storage conversation version `chatesp.v2` and DOM controls for setup, chat, agent, and artifacts.

- [ ] **Step 1: Build the responsive app shell and state store**

```js
const STORE_KEY = "chatesp.v2";
const state = { conversations: [], activeId: null, providers: null, agent: false };
function saveState() { localStorage.setItem(STORE_KEY, JSON.stringify(compactState())); }
```

- [ ] **Step 2: Implement provider configuration as an explicit transaction**

```js
await request("/api/providers/validate", "POST", { provider, apiKey, ollamaUrl });
// On success, clear input, update live model selector, then enable chat.
```

- [ ] **Step 3: Implement chat header/model picker and conversation controls**

```js
async function refreshModels(provider) {
  const response = await request("/api/providers/models?provider=" + encodeURIComponent(provider));
  state.models[provider] = response.models;
  renderModelPicker();
}
function createConversation() {
  const id = crypto.randomUUID ? crypto.randomUUID() : String(Date.now());
  state.conversations.unshift({ id, title: "New chat", messages: [], provider: "", model: "", temperature: 0.7, updatedAt: Date.now() });
  state.activeId = id;
  saveState();
}
```

- [ ] **Step 4: Implement accessible composer and actionable errors**

```css
@media (max-width: 640px) { .sidebar { transform: translateX(-100%); } .composer { grid-template-columns: 1fr auto; } }
```

- [ ] **Step 5: Implement bounded Agent artifact composition**

```js
const plan = await request("/api/agent/plan", "POST", chatPayload);
const blob = await composeArtifact(validatePlan(plan.artifact));
await uploadArtifact(blob, plan.artifact.filename);
```

- [ ] **Step 6: Compile UI embed**

Run: `pio run`

Expected: UI source embeds successfully and source contains no API-key literal.

### Task 5: Document, flash, and verify the rebuild

**Files:**
- Modify: `README.md`
- Test: `pio run`, `pio run -t upload --upload-port /dev/cu.usbserial-0001`, health/UI smoke checks

**Interfaces:**
- Consumes the compiled firmware and LAN device.
- Produces a flashed ESP32 and an accurate operations guide.

- [ ] **Step 1: Rewrite operating instructions**

```md
Configure provider keys from Settings -> Test & Save.
Keys are stored in NVS, never returned to the browser, and can be removed with Delete key.
```

- [ ] **Step 2: Perform source secret scan**

Run: `rg -n --hidden -g '!src/secrets.h' -g '!/.pio/**' -e 'sk-' -e 'AIza' -e 'api[_-]?key[[:space:]]*[:=]' .`

Expected: no user credential in tracked project files.

- [ ] **Step 3: Compile and flash**

Run: `pio run -t upload --upload-port /dev/cu.usbserial-0001`

Expected: PlatformIO reports a successful upload.

- [ ] **Step 4: Verify on the LAN**

Run: `curl --connect-timeout 5 http://<ESP32-IP>/api/health`

Expected: `{ "ok": true }` plus safe IP/storage fields. In the browser, use Test & Save, select a discovered model, and send the one permitted OpenAI smoke request with `gpt-5-nano` only.

- [ ] **Step 5: Verify artifacts without a cloud dependency**

Run: create a text artifact using Agent mode, download it, confirm it appears in Artifacts, then delete it.

Expected: artifact quota and delete controls work with no residual temporary upload.
