# ChatESP

ChatESP turns an ESP32 WROOM-32 into a browser-first, direct AI gateway. It hosts its own responsive web app, stores provider configuration in ESP32 NVS flash, discovers models live, and routes text chat directly to OpenAI, Anthropic, Google Gemini, or a LAN Ollama server.

## What is included

- Responsive ChatESP web interface with mobile navigation and browser-local conversations.
- OpenAI, Anthropic, Google Gemini, and Ollama configuration.
- Live model discovery only; the firmware and UI do not contain a preset model list.
- Transactional **Test & Save** configuration: a typed key is stored only after the provider returns usable live models.
- Clear differences between invalid credentials, provider rate limits, a missing model, a timeout, and a network/TLS/DNS failure.
- Per-chat provider/model/temperature selection, persisted only in the current browser.
- Bounded Agent mode for text/code, DOCX, PPTX, and XLSX artifacts. The browser composes the file, downloads it, then saves it to LittleFS for later download/delete.

## First flash

1. Create the private Wi-Fi file:

   ```sh
   cp src/secrets.h.example src/secrets.h
   ```

2. Edit only these lines in `src/secrets.h`:

   ```cpp
   static const char* WIFI_SSID = "YOUR_WIFI_NAME";
   static const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";
   ```

   Keep this file private. It is ignored by Git. Provider keys are deliberately not compiled into firmware.

3. Build and flash:

   ```sh
   pio run
   pio run -t upload --upload-port /dev/cu.usbserial-0001
   ```

   If `pio` is not on your PATH, use `python3 -m platformio` instead. Replace the upload port with the one your board enumerates as.

4. Open the LAN URL printed after boot, for example `http://192.168.x.x/`.

The ESP32 also starts `ChatESP-Setup` at `http://192.168.4.1/` as a recovery access point. It uses the same password as `WIFI_PASSWORD`, so use at least an eight-character Wi-Fi password.

## Configure a provider

1. Open **Settings**.
2. Choose OpenAI, Anthropic, Google Gemini, or Ollama.
3. Paste a cloud API key, or enter an Ollama LAN URL such as `http://192.168.1.20:11434`.
4. Select **Test & Save**.

ChatESP makes a live model-list request using the submitted value. It persists a cloud key or Ollama URL in NVS only if that request succeeds and returns usable models. A failed test leaves the previously saved configuration unchanged. The browser only receives a configured/not-configured status; it never receives a stored key.

After a successful test, choose a returned model and use **Save chat defaults** if wanted. The chat header uses the same live model list. Use **Delete stored key** (or URL) to remove configuration from flash.

## Agent artifacts

Turn on **Agent** beside the composer and ask for a file. The selected provider makes a bounded JSON plan; the browser validates and composes the requested artifact, downloads it immediately, and uploads it to the ESP32.

- Text and code files work without browser internet access.
- DOCX, PPTX, and XLSX load pinned open-source browser libraries only when requested, so those formats require browser internet access.
- Generated code is never run.
- Each stored artifact is limited to 700 KB. Use **Artifacts** to download or delete it.

## Storage and limits

The included partition table reserves approximately 1.8 MB for firmware and 2.2 MB for LittleFS artifacts. The current firmware uses roughly 1.13 MB of firmware flash and 47 KB of RAM at build time, leaving approximately 703 KB in the application partition. Normal application reflashing preserves NVS configuration and artifacts; erasing the whole flash removes them.

## Security notes

This is a LAN-only prototype. Cloud provider TLS certificate validation is disabled to fit the constrained direct-gateway design, and the web app has no user authentication. Keep the ESP32 on a trusted private network, use dedicated scoped API keys, and delete keys/artifacts before giving the device to someone else. Do not expose ChatESP directly to the public internet.

## Troubleshooting

- **`network_unreachable`**: the ESP32 could not complete DNS/TLS/network access. Confirm station Wi-Fi and retry; do not assume the key is bad.
- **`authentication_failed`**: the cloud provider rejected the key. Paste a current key and use Test & Save again.
- **`rate_limited`**: wait briefly and retry.
- **`model_or_endpoint_not_found`**: refresh live models and select an ID returned by the provider.
- **Ollama cannot connect**: use the computer's LAN IP and port, not `localhost` or `127.0.0.1`.

For serial output:

```sh
pio device monitor --port /dev/cu.usbserial-0001 -b 115200
```
