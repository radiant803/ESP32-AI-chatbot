#include "hal.h"

uint32_t halFreeHeap() { return ESP.getFreeHeap(); }

uint32_t halMinHeap() {
#if defined(ESP32)
  return ESP.getMinFreeHeap();
#else
  return 0;  // not tracked by the ESP8266 core
#endif
}

int halCores() {
#if defined(ESP32)
  return ESP.getChipCores();
#else
  return 1;
#endif
}

size_t halFsTotal() {
#if defined(ESP32)
  return LittleFS.totalBytes();
#else
  FSInfo info;
  return LittleFS.info(info) ? info.totalBytes : 0;
#endif
}

size_t halFsUsed() {
#if defined(ESP32)
  return LittleFS.usedBytes();
#else
  FSInfo info;
  return LittleFS.info(info) ? info.usedBytes : 0;
#endif
}

bool halFsBegin() {
#if defined(ESP32)
  return LittleFS.begin(true, "/littlefs", 5, "littlefs");
#else
  return LittleFS.begin();
#endif
}

void halRestart() { ESP.restart(); }

bool halIsPrivateIp(const IPAddress& ip) {
  const uint8_t a = ip[0], b = ip[1];
  return a == 0 || a == 10 || a == 127 || (a == 169 && b == 254) ||
         (a == 172 && b >= 16 && b <= 31) || (a == 192 && b == 168) ||
         (a == 100 && b >= 64 && b <= 127) || a >= 224;
}

void halListDir(const char* dir, const std::function<void(const String&, size_t)>& fn) {
#if defined(ESP32)
  File directory = LittleFS.open(dir, "r");
  if (!directory || !directory.isDirectory()) return;
  for (File file = directory.openNextFile(); file; file = directory.openNextFile()) {
    if (file.isDirectory()) continue;
    const String path = file.name();
    fn(path.substring(path.lastIndexOf('/') + 1), file.size());
  }
  directory.close();
#else
  Dir directory = LittleFS.openDir(dir);
  while (directory.next()) {
    if (directory.isDirectory()) continue;
    fn(directory.fileName(), directory.fileSize());
  }
#endif
}
