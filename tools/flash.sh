#!/usr/bin/env bash
# Builds the web app, then flashes firmware and the LittleFS image to ONE explicitly named board.
# Usage: tools/flash.sh <esp32dev|esp8266> <serial-port>
# The port is required on purpose: never guess which attached board you are about to overwrite.
set -euo pipefail
if [ "$#" -ne 2 ]; then echo "Usage: $0 <esp32dev|esp8266> /dev/cu.usbserial-XXXX" >&2; exit 2; fi
ENV="$1"; PORT="$2"
case "$ENV" in esp32dev|esp8266) ;; *) echo "Unknown environment: $ENV" >&2; exit 2;; esac
cd "$(dirname "$0")/.."
node web/build.mjs
PIO="python3 -m platformio"
$PIO run -e "$ENV" -t upload --upload-port "$PORT"
$PIO run -e "$ENV" -t uploadfs --upload-port "$PORT"
echo "Done. Open the LAN URL printed on the serial monitor, or http://chatesp.local/"
