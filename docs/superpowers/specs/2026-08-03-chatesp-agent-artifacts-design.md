# ChatESP Agent and Artifacts Design

## Goal

Add an optional Agent mode that turns a user request into a structured artifact plan, composes documents/presentations/spreadsheets/code in the browser, stores the finished file in a dedicated ESP32 LittleFS partition, and provides download/delete controls.

## Agent flow

When the Agent toggle is enabled, the browser sends the active conversation and request to `POST /api/agent`. The ESP32 forwards it to the selected provider/model using the existing provider adapter and returns a bounded JSON plan. The plan contains an artifact type, filename, title, and type-specific structured content. The browser validates the plan, uses a client-side generator, and uploads the resulting file bytes to the ESP32.

Supported artifact types:

- `docx`: title plus ordered sections containing headings and paragraphs.
- `pptx`: title plus ordered slides containing title, body bullets, and optional notes.
- `xlsx`: workbook sheets with names, columns, and rows of scalar values.
- `code`: filename, language, and text content.
- `text`: filename and text content.

Agent mode never executes generated code, evaluates model-provided JavaScript, reads arbitrary local files, or invokes operating-system tools.

## Artifact storage

LittleFS stores artifacts under `/artifacts/<sanitized-name>`. Names are normalized to ASCII-safe filenames, path traversal is rejected, and each file has a maximum size. `GET /api/artifacts` returns metadata only: filename, size, created time, and MIME type. Download streams the file, upload accepts one bounded body, and delete removes one exact artifact path.

The PlatformIO project uses a custom 4 MB partition table with approximately 1.5 MB application space and 1.5 MB LittleFS artifact space, leaving room for bootloader, NVS, OTA metadata, and recovery margin. The README documents that changing partition layouts or erasing flash may remove artifacts.

## HTTP API

- `POST /api/agent` accepts `{provider, model, messages, temperature}` and returns `{artifact:{type,filename,title,...}}` or a structured error.
- `GET /api/artifacts` returns `{artifacts:[...]}`.
- `POST /api/artifacts/upload` accepts `{filename,mime,dataBase64}` with bounded decoded size and returns metadata.
- `GET /api/artifacts/download?name=...` streams a stored file with a safe content disposition.
- `DELETE /api/artifacts?name=...` deletes the exact named artifact.

## Browser UI

The composer gains a clearly labeled Agent toggle. When enabled, the send action shows a planning/composing state. On completion, the result is added to the Artifacts panel with file type, size, Download, and Delete actions. The panel loads from `/api/artifacts` on startup and after upload/delete. If a generator library fails to load, the UI reports the failure without losing the conversation.

Client-side libraries are loaded only when needed: `docx` for DOCX, `PptxGenJS` for PPTX, and SheetJS CE for XLSX. Code/text uses native Blob APIs. External library loading is documented as requiring browser internet access; code/text remains available without those libraries.

## Security and bounds

- Agent prompts and model plans are bounded.
- Artifact names are sanitized and path traversal is rejected.
- Generated code is never executed.
- API keys remain server-side on the ESP32 and are not included in artifact metadata.
- Upload and storage size limits prevent LittleFS exhaustion; a full partition returns HTTP 507.
- The local-network/no-auth limitation remains documented.

## Verification

- Build and flash with the custom partition table.
- Verify `/api/agent` returns valid bounded plans for each artifact type.
- Generate one code/text artifact without external libraries and verify upload/download/delete.
- Generate DOCX/PPTX/XLSX in a browser with internet access and verify files open in their target applications.
- Verify path traversal, oversized upload, invalid plan, missing library, and full-storage errors are handled cleanly.

