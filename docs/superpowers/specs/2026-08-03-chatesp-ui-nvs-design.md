# ChatESP UI and Persistent Settings Design

## Goal

Replace the current dark single-page ChatESP UI with the supplied light workspace design and add browser-managed conversations plus browser-editable provider credentials stored persistently in ESP32 NVS.

## UI

The embedded page uses a light neutral canvas, compact left sidebar, purple accent, rounded cards, and responsive layout. It includes Chat, Provider setup, Settings, and Help views. The sidebar shows New chat, recent local conversations, Settings, and Help. The chat view shows the active conversation title, ESP32 connection state, provider/model, starter prompts when empty, message history, and composer.

Conversations are stored in browser `localStorage`, not ESP32 flash. Each conversation has an ID, title, updated timestamp, provider, model, temperature, and bounded messages. The browser caps conversations and messages to keep local storage manageable. Users can create, open, rename, and delete conversations; New chat creates a blank active conversation.

## Persistent provider settings

ESP32 `Preferences`/NVS stores provider keys and Ollama URL. Keys persist across reboot and normal application reflashing. They are removed only through the Delete key action or a full flash erase. The UI receives only `hasKey` and a masked status, never the full secret.

Stored keys are named `openai_key`, `anthropic_key`, `google_key`, and `ollama_url`. Compile-time values in `secrets.h` are migration fallbacks when the corresponding NVS value is absent. Saving a browser value replaces the NVS value; deleting removes it and allows the compile-time fallback to be used again if present.

## Firmware API

- `GET /api/config` returns `{providers:{openai:{hasKey:true},...}, ollama:{configured:true,urlHost:"..."}, defaults:{provider,model,temperature}, wifi:{connected,ip}}`.
- `POST /api/config` accepts `{provider, apiKey?, ollamaUrl?, defaultModel?, temperature?}`. It validates provider, bounds input lengths, writes NVS, and returns masked status.
- `DELETE /api/config/key?provider=openai|anthropic|google|ollama` removes the selected secret/value and returns the updated masked configuration.
- Existing `/api/models` and `/api/chat` routes use NVS values first, then compile-time fallback values.

## Security and failure behavior

- API keys are never logged, rendered, returned, or included in browser conversation objects.
- Delete is explicit and provider-specific.
- Missing keys produce setup guidance; provider errors preserve the current conversation.
- NVS write failures return a structured HTTP 500 error.
- The UI masks saved values and clears the input after successful save.
- This remains a local-network HTTP interface with no authentication; the README will warn users not to expose it publicly.

## Verification

- Build the firmware with PlatformIO.
- Inspect the UI manually through a static browser preview if possible and verify responsive layout, navigation, local conversation lifecycle, masking, and delete controls.
- Flash the ESP32, save/delete a test key, reboot, and verify masked persistence through `/api/config` without exposing the key.
- Verify live model discovery still returns provider data and chat routes use stored configuration.

