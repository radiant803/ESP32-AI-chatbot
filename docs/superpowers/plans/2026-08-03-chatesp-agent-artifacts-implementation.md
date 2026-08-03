# ChatESP Agent and Artifacts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add optional Agent mode that generates structured artifact plans, composes files in the browser, stores them in ESP32 LittleFS, and exposes download/delete controls.

**Architecture:** The ESP32 asks the selected provider for one bounded JSON artifact plan and stores completed browser-generated files in LittleFS. The browser lazy-loads open-source generators for DOCX/PPTX/XLSX and uses native Blob APIs for code/text. A custom 4 MB partition reserves about 1.8 MB for the app and about 2.2 MB for artifacts; this serial-flash layout intentionally does not include OTA slots.

**Tech Stack:** ESP32 Arduino, PlatformIO, ArduinoJson 7, LittleFS, WebServer, existing provider adapters, browser JavaScript, docx, PptxGenJS, SheetJS CE, native Blob APIs.

## Global Constraints

- Agent mode never executes generated code or evaluates model-provided JavaScript.
- Artifact names are sanitized; path traversal is rejected.
- Agent prompts, plans, uploads, and stored files are bounded.
- API keys remain on the ESP32 and never enter artifact metadata.
- The interface remains local-network HTTP without authentication.
- Code/text artifacts work without external libraries; DOCX/PPTX/XLSX require browser internet access for lazy-loaded libraries.
- Agent mode is a bounded planner/composer, not an autonomous tool-running loop.
- Browser library URLs must pin a specific version and include Subresource Integrity where the CDN supports it.
- Artifact bytes must be streamed with multipart upload; base64 JSON uploads are prohibited because WebServer buffers request bodies in RAM.

### Task 1: Add custom partition table and LittleFS artifact store

**Files:**
- Create: `ChatESP/partitions.csv`
- Create: `ChatESP/src/artifacts.h`
- Create: `ChatESP/src/artifacts.cpp`
- Modify: `ChatESP/platformio.ini`

**Interfaces:**
- `void artifactsBegin()` mounts LittleFS.
- `String artifactsListJson()` returns filename, size, MIME metadata, and total/used/free LittleFS capacity.
- `bool artifactNameSafe(const String& name)` validates a filename.
- `bool saveArtifact(const String& name, const String& mime, const uint8_t* data, size_t length)` stores one artifact.
- `bool deleteArtifact(const String& name)` removes one exact artifact.
- `bool openArtifact(const String& name, File& file, String& mime)` opens a sanitized file for streaming.

- [ ] **Step 1: Define the partition layout**

  Create a 4 MB CSV with NVS/PHY regions, a 1.8 MB factory app at `0x10000`, and the remaining roughly 2.1 MB as LittleFS. Do not define OTA application slots or `otadata`; flashing is serial-only in this version.

- [ ] **Step 2: Configure PlatformIO**

  Set `board_build.partitions = partitions.csv` and `board_build.filesystem = littlefs`.

- [ ] **Step 3: Implement safe paths and limits**

  Accept ASCII-safe names only, reject `/`, `\\`, `..`, empty names, and names over 96 characters; cap each artifact to 700 KB and use `/artifacts/` paths.

- [ ] **Step 4: Implement metadata/list/delete/stream helpers**

  Return filename, size, MIME, and total/used/free capacity without reading file contents into RAM. Do not expose creation timestamps until the project includes a clock and durable metadata index. Files are only removed through the explicit delete control—there is no automatic cleanup that could silently discard a user's work.

- [ ] **Step 5: Build-check the partition and store**

  Run `pio run` and inspect app/filesystem size output.

### Task 2: Add agent plan generation and artifact HTTP routes

**Files:**
- Modify: `ChatESP/src/main.cpp`
- Modify: `ChatESP/src/providers.h`
- Modify: `ChatESP/src/providers.cpp`
- Modify: `ChatESP/src/artifacts.cpp` if streaming helpers require route support

**Interfaces:**
- `ProviderResult generateAgentPlan(const String& provider, const String& model, const String& messagesJson, float temperature)` returns `{artifact:{type,filename,title,...}}`.
- `POST /api/agent` returns a bounded validated plan.
- `GET /api/artifacts` returns metadata.
- `POST /api/artifacts/upload` accepts one streamed multipart file with `name` and `mime` form fields.
- `GET /api/artifacts/download?name=...` streams one file.
- `DELETE /api/artifacts?name=...` deletes one file.

- [ ] **Step 1: Add the provider-neutral agent prompt**

  Require strict JSON with supported artifact types, no markdown fences, bounded text/slide/sheet/row counts, safe filename, and no executable instructions; reject invalid JSON or unsupported types. Preserve system instructions for Anthropic and Google during this route rather than silently discarding them.

- [ ] **Step 2: Implement `generateAgentPlan`**

  Use existing provider request adapters with the same API-key/NVS path, cap the plan response, and normalize provider content into the artifact object.

- [ ] **Step 3: Implement `/api/agent`**

  Validate provider/model/messages, cap request size, call `generateAgentPlan`, and return structured 400/401/502 errors without logging secrets.

- [ ] **Step 4: Implement streamed artifact upload**

  Handle `WebServer::upload()` multipart chunks, reject invalid form fields or files over 700 KB, sanitize names, write chunks directly to LittleFS, and return HTTP 507 when storage is insufficient. Never construct the full file or base64 payload in RAM.

- [ ] **Step 5: Implement list/download/delete routes**

  Stream downloads with MIME and safe `Content-Disposition`, and return structured errors for missing or unsafe names.

- [ ] **Step 6: Build-check all routes**

  Run PlatformIO compilation and confirm LittleFS symbols link successfully.

### Task 3: Add browser-side artifact generators and agent toggle

**Files:**
- Modify: `ChatESP/src/web_ui.h`

**Interfaces:**
- `runAgent(text)` calls `/api/agent`, selects a generator by artifact type, uploads the finished bytes, and refreshes the artifact list.
- `loadArtifacts()` calls `/api/artifacts`.
- `deleteArtifact(name)` calls the DELETE route.

- [ ] **Step 1: Add Agent toggle and composer state**

  Add a visible toggle next to the composer; show Planning, Composing, Uploading, and Error states without losing the conversation.

- [ ] **Step 2: Add lazy library loaders**

  Load pinned `docx`, `PptxGenJS`, and SheetJS CE URLs only when their artifact type is requested; use SRI where available and display a clear offline-library error if a script cannot load.

- [ ] **Step 3: Implement DOCX generation**

  Convert title/sections into a DOCX blob using headings and paragraphs, with bounded content.

- [ ] **Step 4: Implement PPTX generation**

  Convert slides into a PPTX blob with title and bullet text; never inject model text as executable markup.

- [ ] **Step 5: Implement XLSX generation**

  Convert sheets/columns/rows into a workbook blob with bounded sheet and row counts.

- [ ] **Step 6: Implement code/text generation**

  Create a local Blob download immediately, then upload the same file with `FormData` so an artifact is still useful if ESP32 storage is full.

- [ ] **Step 7: Implement artifact panel**

  Show LittleFS capacity plus artifact filename, type, size, Download link, and Delete button; refresh after upload/delete and on page load.

### Task 4: Document and verify the agent workflow

**Files:**
- Modify: `ChatESP/README.md`

**Interfaces:**
- README documents partition layout, artifacts, browser internet dependency, storage limits, and full-flash erase behavior.

- [ ] **Step 1: Document Agent mode**

  Explain that the ESP32 plans and stores while the browser composes files, and that code is never executed.

- [ ] **Step 2: Rebuild and flash the custom partition**

  Run `pio run -t upload --upload-port /dev/cu.usbserial-0001`. This changes the partition map; warn that the first LittleFS mount formats its artifact partition. Do not use full erase unless NVS credentials and all artifacts should be removed.

- [ ] **Step 3: Verify code/text artifact lifecycle**

  Generate a code artifact, upload it, list it, download it, delete it, and confirm it is gone.

- [ ] **Step 4: Verify office artifact generation**

  Generate one DOCX, PPTX, and XLSX in an internet-connected browser and verify each opens in its target application.

- [ ] **Step 5: Verify security/error paths**

  Test unsafe filename, oversized upload, invalid agent JSON, missing generator library, and full-storage response.
