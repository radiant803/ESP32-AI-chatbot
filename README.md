# ChatESP v2

A private AI workspace served by a microcontroller. The ESP holds your provider keys and streams requests to
**OpenAI (recommended), Anthropic or Google Gemini (beta)**; everything else (chats, agents, research,
presentations, files) runs in the browser you open it from. Runs on **ESP32** and **ESP8266 (NodeMCU)**.

> **Status: OpenAI works best.** Agent mode and the Anthropic and Google Gemini providers are **beta**: they work but can be slow or unreliable, especially on the ESP8266. Ollama support is disabled for now.

## What's new in v2

- A new web app: calm editorial design, light/dark/auto + accents, responsive from 320 px, command palette (`Ctrl/Cmd+K`).
- ChatGPT-class chat: streaming with Stop, regenerate, edit-and-resend with version pager, copy, read aloud, thumbs, dictation,
  image and file attachments (images, text, code, PDF), image generation, search, pin/archive/rename, **Projects**,
  custom instructions, memory, personas, temporary chats, model compare, export, optional PIN screen lock.
- **Agent mode (beta):** plan, search, read pages, calculate, and create DOCX/XLSX/PPTX/HTML/SVG/text/code files. Agent and Design get deep reasoning, a large output budget and a long time limit
  (Settings -> Models: reasoning level, max output tokens, minutes); Chat stays quick and capped.
- **Design mode** (formerly Presentation): slide decks, websites, landing pages, app prototypes, dashboards, UI modules (pricing, forms, navigation, cards), email, posters and SVG graphics.
  It writes a concept brief first, then builds the file with a live preview (phone / tablet / desktop), checks it, lets you refine it in plain language (each change is a version) and exports HTML, SVG, PDF or PPTX.
  Decks keep the editable studio: 8 layouts, 6 themes, charts, images, speaker notes; export PPTX, HTML, PDF.
- **Automatic compaction:** when a request exceeds the board’s byte limit, ChatESP summarizes earlier turns and fits the summary around the latest user message. The latest message is sent verbatim, and recent exchanges are kept when they fit.
- **Research mode:** plans queries, searches, reads sources, writes a cited report; export Markdown/DOCX/PDF; "Go deeper".
- Device tooling: Wi-Fi provisioning from the browser, OTA firmware upload, mDNS (`chatesp.local`), storage manager.
- All v1 features kept: three providers (Ollama disabled), live model discovery only, transactional Test & Save, distinct error classes,
  keys never returned to the browser, recovery AP, artifact storage, 320 px layout.

## Output quality

Answers render like the big chat apps: aligned tables with copy, typeset math (KaTeX, `$...$`, `$$...$$`, `\(...\)`), nested and task lists, footnotes,
syntax-highlighted code with copy / wrap / download / collapse, a live "Thinking" panel that becomes "Thought for 7s", in-place streaming
(no flicker), a scroll-to-latest button, inline message editing (or press Up), "try with another model", branch to a new chat, generated images with a viewer,
and files that look finished: Word documents with real styles, tables, lists and page numbers, and Excel workbooks with a styled frozen header, filters, number/percent/date types and formulas.
Math and Office export load their libraries from a CDN the first time they are needed.

Resilience: if a model rejects a parameter (for example `temperature` on reasoning models) the app reads the provider's message, retries without it and remembers
the choice; truncated or fenced JSON from a model is repaired; step lists never keep spinning after a failure; deleting a chat mid-reply cannot bring it back;
tabs running an old build are told to reload. Research-backed presentations search for benchmark pages, digest each page, cite sources on a Sources slide, and say
plainly when a number could not be verified.

ESP8266 notes: a TLS session needs about 17 KB of contiguous heap, so the firmware parks large request bodies in flash before connecting, pauses mDNS
(`chatesp.local` returns when the board is idle) and refuses a call when memory is short (the app retries). Agent steps also ask for a smaller TLS receive buffer (about 8 KB freed; it falls back to full size if a reply does not arrive intact), the proxy waits a few seconds for a 23 KB free block before opening a connection, and the board abandons a wait when you press Stop. Because per-token streaming events cost several
megabytes and leave only a few KB of heap, Agent and Design on this chip fetch long replies in one piece, so the live code preview shows when the reply lands.

Run the checks with `node web/test/markdown.test.cjs`, `node web/test/reasoning.test.cjs`, `node web/test/json.test.cjs` and `node web/test/design.test.cjs`, and `node --test web/test/compaction.test.cjs`.

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
| ESP8266 | 6 KB per request | Long chats are compacted automatically; images disabled; HTTPS to cloud providers depends on TLS memory (see below) |

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
or `network_unreachable`, use an ESP32 (the ESP8266 has very little spare memory for TLS). On a NodeMCU, TLS to OpenAI, Anthropic and Gemini connected (about 32 KB free heap during the handshake); see `docs/superpowers/specs/2026-10-26-chatesp-v2-design.md` for hardware findings. Use a good USB power source and a decent signal: the ESP8266 radio is easily starved.

## Security notes

LAN-only prototype. The device API has no sign-in; cloud TLS certificates are not validated (constrained hardware); the UI PIN is a
privacy screen, not access control. Use scoped keys, and delete them before giving the device away. Generated code is never run;
HTML previews are sandboxed. `/api/fetch` refuses private and loopback addresses.

## Troubleshooting

- **`authentication_failed`**: the provider rejected the key; paste a current one.
- **`network_unreachable`**: DNS/TLS/Wi-Fi failure; not a bad key.
- **`low_memory`**: the ESP is busy; retry or shorten the request.
- **`request_too_large`**: shorten the chat or attach smaller files (limit shown in Settings -> Device).
