# ChatESP

ChatESP is an ESP32 WROOM-32 web chatbot gateway. The ESP32 hosts the UI and calls OpenAI, Anthropic, Google Gemini, or an Ollama server directly.

```sh
cp src/secrets.h.example src/secrets.h
```

Edit `src/secrets.h` with Wi-Fi credentials and provider keys. For Ollama, use the computer's LAN IP, such as `http://192.168.1.100:11434`, not `localhost`.

Keys are compiled into firmware and can be recovered from the device. Use a dedicated device and rotate keys if it is lost.

## Build and upload

```sh
pio run
pio run -t upload --upload-port /dev/cu.usbserial-0001
pio device monitor --port /dev/cu.usbserial-0001 -b 115200
```

Manual flashing is available after `python3 -m pip install esptool`:

```sh
./tools/flash.sh /dev/cu.usbserial-0001
```

Open the IP address printed in the serial monitor. Models are queried live from the selected provider; no preset model list is used. TLS certificate validation is disabled in v1; do not expose the device directly to the public internet.

This build uses a serial-flash-only custom partition layout: approximately 1.8 MB is reserved for the application and approximately 2.2 MB for LittleFS artifacts. There is no OTA application slot. The first boot after flashing the custom layout mounts (and, when necessary, formats) the new artifact partition. Normal application reflashing preserves NVS keys and artifacts; a full-flash erase removes both.

## Browser settings and conversations

Open Settings in ChatESP to save or update an OpenAI, Anthropic, Google Gemini, or Ollama credential. Provider keys and the Ollama URL are stored in ESP32 NVS flash and survive reboot and normal application reflashing. Use Delete key to remove a stored value; a full flash erase also removes NVS data. The browser receives only masked key status.

Conversations, names, and recent chats are stored in the current browser's local storage. They do not consume ESP32 flash and are not sent to the device except for the active chat request.

## Agent mode and artifacts

Turn on **Agent** beside the message box to ask the selected model for a bounded artifact plan. ChatESP does not run an autonomous tool loop and never executes generated code. The browser safely composes the requested text, code, DOCX, PPTX, or XLSX file, then streams it to the ESP32's LittleFS partition. The Artifacts view shows available space and lets you download or explicitly delete each file.

Each file is limited to 700 KB. Text and code files can be created without browser internet access. DOCX, PPTX, and XLSX generation lazily loads pinned open-source browser libraries from jsDelivr, so those formats require the browser to have internet access. Artifact storage is deliberately local and unauthenticated like the rest of the LAN web interface; do not put sensitive files on a network you do not trust.
