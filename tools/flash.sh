#!/usr/bin/env bash
set -euo pipefail
if [ "$#" -ne 1 ]; then echo "Usage: $0 /dev/cu.usbserial-XXXX" >&2; exit 2; fi
PORT="$1"
command -v pio >/dev/null || { echo "PlatformIO CLI (pio) is required to build firmware." >&2; exit 1; }
pio run
BUILD=".pio/build/esp32dev"
python3 -m esptool --chip esp32 --port "$PORT" --baud 460800 write_flash 0x1000 "$BUILD/bootloader/bootloader.bin" 0x8000 "$BUILD/partitions.bin" 0x10000 "$BUILD/firmware.bin"
