# ChatESP v2

A private AI workspace served by a microcontroller. The ESP holds your provider keys and streams requests to
**OpenAI, Anthropic, Google Gemini or a LAN Ollama server**; everything else (chats, agents, research,
presentations, files) runs in the browser you open it from. Runs on **ESP32** and **ESP8266 (NodeMCU)**.

## What's new in v2

- A new web app: calm editorial design, light/dark/auto + accents, responsive from 320 px, command palette (`Ctrl/Cmd+K`).
- ChatGPT-class chat: streaming with Stop, regenerate, edit-and-resend with version pager, copy, read aloud, thumbs, dictation,
  image and file attachments (images, text, code, PDF), image generation, search, pin/archive/rename, **Projects**,
  custom instructions, memory, personas, temporary chats, model compare, export, optional PIN screen lock.
- **Agent mode:** plan, search, read pages, calculate, and create DOCX/XLSX/PPTX/HTML/text/code files, with hard step and time caps.
- **Presentations:** prompt to outline to an editable deck (8 layouts, 6 themes, charts, images, speaker notes); export PPTX, HTML, PDF.
- **Research mode:** plans queries, searches, reads sources, writes a cited report; export Markdown/DOCX/PDF; "Go deeper".
- Device tooling: Wi-Fi provisioning from the browser, OTA firmware upload, mDNS (`chatesp.local`), storage manager.
- All v1 features kept: four providers, live model discovery only, transactional Test & Save, distinct error classes,
  keys never returned to the browser, recovery AP, artifact storage, 320 px layout.

## How it works

```
Browser (UI, agents, research, file building) --HTTP--> ESP (key vault + streaming proxy + file store) --TLS--> provider
```

The firmware no longer maps provider formats. The browser builds each provider's request; the ESP checks the endpoint
against an allow-list, adds the stored credential, forwards the body and streams the reply back byte for byte. That is why
streaming, vision, web search and larger outputs now work within a few KB of RAM. The UI is stored gzipped in LittleFS (about 66 KB).

| Chip | Request limit | Notes |
| --- | --- | --- |
| ESP32 | 40 KB per request | Full feature set |
| ESP8266 | 6 KB per request | Long chats are trimmed; images disabled; HTTPS to cloud providers depends on TLS memory (see below) |

## Build and flash

Needs Node 18+ and PlatformIO (`python3 -m platformio` works too).

```sh
node web/build.mjs                      # gzips the web app into data/
tools/flash.sh esp32dev /dev/cu.usbserial-XXXX
tools/flash.sh esp8266  /dev/cu.usbserial-YYYY
```

`flash.sh` requires the port explicitly so it never overwrites a board you did not mean to. The ESP32 partition table changed
(two OTA slots), so the first v2 flash must go over USB; later updates can use Settings -> Device -> Firmware update.
Saved keys live in NVS (ESP32) or an EEPROM sector (ESP8266) and survive `uploadfs`.

First boot: join **ChatESP-Setup** (password `chatesp-setup`, also printed on serial), open `http://192.168.4.1/`,
and use Settings -> Device to enter your Wi-Fi. Optionally copy `src/secrets.h.example` to `src/secrets.h` to compile in a first network.

## Developing the UI without hardware

```sh
node web/build.mjs --dev && node web/mock-server.mjs 8787    # then open http://localhost:8787
```

The mock server implements the device API and fakes provider streams for all four formats, including the agent, deck and research prompts.
Use `--limit=6000` to emulate the ESP8266 request limit.

## Web search

Research and Agent use **Wikipedia** or **DuckDuckGo** (via the device's `/api/fetch` relay) by default, which are free and need no key.
Tavily or Brave keys, or your own SearXNG, are optional upgrades (those services set their own limits and prices). Provider-native
search (OpenAI/Anthropic/Gemini) is off by default because it can add charges to your provider account.

## ESP8266 notes

The NodeMCU build works, but HTTPS to cloud providers needs about 20-30 KB of free heap for TLS and many servers send 16 KB
records. The firmware probes for a smaller TLS fragment size and falls back to larger buffers; if a provider fails with `low_memory`
or `network_unreachable`, use Ollama over plain HTTP on your LAN or an ESP32. On a NodeMCU, TLS to OpenAI, Anthropic and Gemini connected (about 32 KB free heap during the handshake); see `docs/superpowers/specs/2026-10-26-chatesp-v2-design.md` for hardware findings. Use a good USB power source and a decent signal: the ESP8266 radio is easily starved.

## Security notes

LAN-only prototype. The device API has no sign-in; cloud TLS certificates are not validated (constrained hardware); the UI PIN is a
privacy screen, not access control. Use scoped keys, and delete them before giving the device away. Generated code is never run;
HTML previews are sandboxed. `/api/fetch` refuses private and loopback addresses.

## Troubleshooting

- **`authentication_failed`**: the provider rejected the key; paste a current one.
- **`network_unreachable`**: DNS/TLS/Wi-Fi failure; not a bad key.
- **`low_memory`**: the ESP is busy; retry or shorten the request.
- **`request_too_large`**: shorten the chat or attach smaller files (limit shown in Settings -> Device).
- **Ollama can't connect**: use the host's LAN IP and port, not `localhost`.
