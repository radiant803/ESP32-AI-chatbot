# ChatESP v2 Design

## Goals
Overhaul v1 into a ChatGPT-class private workspace with a much better UI, agentic file/presentation creation and research,
keeping every v1 behaviour, running on ESP32 only (no companion server) and also on ESP8266.

## Architecture
Browser = application. ESP = key vault + allow-listed streaming proxy + file store + static host.

- `POST /api/proxy` (headers `X-CE-Provider`, `X-CE-Path`, `X-CE-Method`): validates provider and path against a table, adds the stored
  credential, forwards the body over HTTP/1.0, streams the response (status and body) back chunked. Upstream errors pass through unchanged;
  device-originated errors use v1's `{ok:false,error:{code,message,hint}}` envelope.
- `POST /api/providers/test`: same transport with a transient credential; browser saves with `PUT /api/providers/key` only after it parsed
  at least one usable model (transactional Test & Save).
- `GET /api/fetch?url=`: public-web relay for research (blocks private/loopback IPs, 3 redirects, text types only, size cap).
- Unchanged contracts: `/api/bootstrap`, `/api/preferences`, `/api/artifacts*`. New: `/api/wifi*`, `/api/ota`, `/api/reboot`.
- Credentials: openai, anthropic, google, tavily, brave (keys) and ollama, searxng (URLs). NVS on ESP32; EEPROM JSON on ESP8266 so `uploadfs` does not erase them.
- Limits are advertised in `/api/bootstrap` (`device.limits`) and the UI trims history/attachments to fit.

## Web app (`web/src`, no dependencies, concatenated by `web/build.mjs`)
`00-util` DOM/menus/modals · `01-store` IndexedDB + tree-structured chats (branching) + v1 migration · `02-api` device client, provider adapters
(OpenAI Responses, Anthropic Messages, Gemini SSE, Ollama NDJSON), search · `03-md` safe markdown · `04-files` DOCX/XLSX/PPTX, deck themes/render/export ·
`05-engine` turns, system prompt, trimming · `06-modes` agent, presentation, research · `07-ui-core` · `08-pages` · `09-canvas` · `99-main`.

## Bounded agency
Agent: max 8 steps / 4 minutes, JSON action protocol (search, read, calculate, create_file, make_presentation, final), optional per-file approval.
No code execution; HTML previews sandboxed (`sandbox="allow-scripts"` iframe without same-origin).

## Search policy
OpenAI web_search is billed per call and Gemini grounding is quota-limited, so neither is "absolutely free". Default sources are Wikipedia and
DuckDuckGo (keyless); Tavily/Brave/SearXNG optional; native provider search is opt-in with a cost warning. Re-verify pricing before changing the default.

## Verification status
- Web app: exercised in a browser against `web/mock-server.mjs` (onboarding, streaming chat, agent DOCX, deck studio, research report, errors, palette, light/dark, 375 px).
- Firmware: compiles for `esp32dev` (1.04 MB of 1.38 MB slot, 48 KB static RAM) and `esp8266` (499 KB of 1.04 MB, 35 KB static RAM); both LittleFS images build.
- NodeMCU ESP8266EX (flashed 2026-10-26, `/dev/cu.usbserial-0001`): boots, joins Wi-Fi, serves `/api/bootstrap` (about 33 KB free heap), and serves the gzipped
  web app. TLS from the ESP8266 to api.openai.com, api.anthropic.com and generativelanguage.googleapis.com works (each provider's own 401/400 error was proxied back
  to curl in about 5 s per request using fake keys; nothing was stored). Heap stays near 32 KB during TLS.
- Fixes found on hardware: modem sleep disabled (it added ~2 s latency); `streamFile()` truncated large files so static files are written in 1 KB blocks with retry;
  the recovery AP now runs only while the station link is down (AP+STA hurts throughput).
- Open issue: in the test location the ESP8266's link to the router lost 15-50% of ping packets (router itself 0%), RSSI about -65 dBm, so large downloads
  such as the 58 KB app.js are slow or stall (1-40 s). Lowering TX power / 802.11g made it worse. Suspects: weak USB power (board sits behind a hub) or signal.
  Retest after moving it closer and onto a direct USB port: 5/5 downloads of app.js completed (1.6-5.8 s, gzip valid), ping loss 12.5% (small) / 0% (1400-byte), RSSI still about -65 dBm.
  Power was the likely main cause; the link is usable but still not great.
- Real provider traffic on the NodeMCU (2026-11-21, OpenAI, `gpt-5-nano` and `gpt-6-luna` only, about 8K tokens in total):
  - Root causes found and fixed: (1) `sendContent()` ignores partial writes, so large replies lost bytes on a lossy link (now a retrying chunk writer);
    (2) BearSSL error 6 with a 4 KB receive buffer, since cloud APIs send TLS records up to 16 KB (now 16 KB on ESP8266);
    (3) heap too thin at about 30 KB free during TLS (EEPROM RAM copy freed, request body not copied, `max free block` guard returns `low_memory`);
    (4) 2-minute asset caching hid new builds (index.html is `no-cache`; assets use `?v=<hash>` and cache for a week).
  - Browser, served by the ESP8266: model catalog (62 chat models), streaming chat, Stop with partial text kept, regenerate with version pager,
    reasoning slider (gpt-5-nano Minimal to High, gpt-6-luna off/low), Agent (DOCX and TXT stored in device flash and downloadable), 5-slide deck (12 s),
    Research (3 searches, 4 pages read through `/api/fetch`, cited report in 31 s), usage meter and breakdown.
  - Soak: 15 of 15 rounds of page + assets + 21 KB model list + streamed chat; 12 of 12 downloads of the 65 KB app.js; no reboots; free heap about 34 KB idle.
  - App-side safeguards for the small device: device requests run one at a time (`Dev.serial`), `low_memory` is retried automatically,
    and titles and follow-up suggestions are skipped on devices with a request limit under 12 KB or whenever another request is queued.
- Quality pass (2026-11-21): markdown engine rewritten (45 unit tests: aligned tables, nested/task lists, math, footnotes, escapes, highlighting for 9 language families);
  messages patch in place while streaming; live reasoning panel; inline edit, model switch, branch; image turns; Word/Excel output built with docx styles and ExcelJS;
  JSON extraction no longer breaks on code fences inside strings. Verified on the mock and on the NodeMCU with a real gpt-5-nano answer (equation, table, code) at 390 px and desktop widths.
- Still unverified: Anthropic, Gemini and Ollama traffic, firmware update over Wi-Fi, and anything on ESP32 hardware.
