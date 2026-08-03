#include "artifacts.h"

#include <ArduinoJson.h>
#include <LittleFS.h>

namespace {
constexpr const char* ARTIFACT_DIR = "/artifacts";

String mimeForName(const String& name) {
  String lower = name; lower.toLowerCase();
  if (lower.endsWith(".docx")) return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (lower.endsWith(".pptx")) return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
  if (lower.endsWith(".xlsx")) return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  if (lower.endsWith(".json")) return "application/json";
  if (lower.endsWith(".html")) return "text/html";
  if (lower.endsWith(".md")) return "text/markdown";
  if (lower.endsWith(".py")) return "text/x-python";
  if (lower.endsWith(".js")) return "text/javascript";
  if (lower.endsWith(".csv")) return "text/csv";
  return "text/plain";
}
}

bool artifactsBegin() {
  if (!LittleFS.begin(true)) return false;
  if (!LittleFS.exists(ARTIFACT_DIR)) return LittleFS.mkdir(ARTIFACT_DIR);
  return true;
}

bool artifactNameSafe(const String& name) {
  if (!name.length() || name.length() > 96 || name.indexOf("..") >= 0 || name.indexOf('/') >= 0 || name.indexOf('\\') >= 0) return false;
  for (size_t i = 0; i < name.length(); ++i) {
    char c = name[i];
    if (!((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') || c == '.' || c == '-' || c == '_')) return false;
  }
  return true;
}

String artifactPath(const String& name) { return String(ARTIFACT_DIR) + "/" + name; }

String artifactsListJson() {
  JsonDocument out;
  JsonObject storage = out["storage"].to<JsonObject>();
  storage["totalBytes"] = LittleFS.totalBytes();
  storage["usedBytes"] = LittleFS.usedBytes();
  storage["freeBytes"] = LittleFS.totalBytes() - LittleFS.usedBytes();
  JsonArray artifacts = out["artifacts"].to<JsonArray>();
  File dir = LittleFS.open(ARTIFACT_DIR);
  if (dir && dir.isDirectory()) {
    for (File file = dir.openNextFile(); file; file = dir.openNextFile()) {
      if (file.isDirectory()) continue;
      String path = file.name(); String name = path.substring(path.lastIndexOf('/') + 1);
      JsonObject entry = artifacts.add<JsonObject>(); entry["name"] = name; entry["size"] = file.size(); entry["mime"] = mimeForName(name);
    }
  }
  String json; serializeJson(out, json); return json;
}

bool saveArtifact(const String& name, const String&, const uint8_t* data, size_t length) {
  if (!artifactNameSafe(name) || !data || !length || length > MAX_ARTIFACT_BYTES) return false;
  if (length > LittleFS.totalBytes() - LittleFS.usedBytes()) return false;
  File file = LittleFS.open(artifactPath(name), FILE_WRITE); if (!file) return false;
  size_t written = file.write(data, length); file.close(); return written == length;
}

bool deleteArtifact(const String& name) { return artifactNameSafe(name) && LittleFS.remove(artifactPath(name)); }

bool openArtifact(const String& name, File& file, String& mime) {
  if (!artifactNameSafe(name)) return false;
  file = LittleFS.open(artifactPath(name), FILE_READ); if (!file || file.isDirectory()) return false;
  mime = mimeForName(name); return true;
}
