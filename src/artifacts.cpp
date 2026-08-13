#include "artifacts.h"

#include <LittleFS.h>

namespace {

constexpr const char* ARTIFACT_DIRECTORY = "/artifacts";
constexpr const char* TEMPORARY_ARTIFACT = "/.chatesp-upload.tmp";
constexpr const char* BACKUP_ARTIFACT = "/.chatesp-upload.bak";

bool allowedExtension(const String& name) {
  String lower = name;
  lower.toLowerCase();
  return lower.endsWith(".txt") || lower.endsWith(".md") ||
         lower.endsWith(".csv") || lower.endsWith(".json") ||
         lower.endsWith(".html") || lower.endsWith(".js") ||
         lower.endsWith(".ts") || lower.endsWith(".py") ||
         lower.endsWith(".cpp") || lower.endsWith(".h") ||
         lower.endsWith(".docx") || lower.endsWith(".pptx") ||
         lower.endsWith(".xlsx");
}

}  // namespace

bool artifactsBegin() {
  if (!LittleFS.begin(true, "/littlefs", 5, "littlefs")) return false;
  if (!LittleFS.exists(ARTIFACT_DIRECTORY) && !LittleFS.mkdir(ARTIFACT_DIRECTORY)) {
    return false;
  }
  if (LittleFS.exists(TEMPORARY_ARTIFACT)) LittleFS.remove(TEMPORARY_ARTIFACT);
  if (LittleFS.exists(BACKUP_ARTIFACT)) LittleFS.remove(BACKUP_ARTIFACT);
  return true;
}

bool artifactNameSafe(const String& name) {
  if (!name.length() || name.length() > 96 || name[0] == '.' ||
      name.indexOf("..") >= 0 || name.indexOf('/') >= 0 ||
      name.indexOf('\\') >= 0 || !allowedExtension(name)) {
    return false;
  }
  for (size_t index = 0; index < name.length(); ++index) {
    const char character = name[index];
    const bool safe = (character >= 'a' && character <= 'z') ||
                      (character >= 'A' && character <= 'Z') ||
                      (character >= '0' && character <= '9') ||
                      character == '.' || character == '-' || character == '_';
    if (!safe) return false;
  }
  return true;
}

String artifactPath(const String& name) { return String(ARTIFACT_DIRECTORY) + "/" + name; }

String artifactTemporaryPath() { return String(TEMPORARY_ARTIFACT); }

String artifactBackupPath() { return String(BACKUP_ARTIFACT); }

String artifactMimeType(const String& name) {
  String lower = name;
  lower.toLowerCase();
  if (lower.endsWith(".docx")) {
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  }
  if (lower.endsWith(".pptx")) {
    return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
  }
  if (lower.endsWith(".xlsx")) {
    return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  }
  if (lower.endsWith(".json")) return "application/json";
  if (lower.endsWith(".html")) return "text/html; charset=utf-8";
  if (lower.endsWith(".csv")) return "text/csv; charset=utf-8";
  if (lower.endsWith(".js") || lower.endsWith(".ts")) {
    return "text/javascript; charset=utf-8";
  }
  return "text/plain; charset=utf-8";
}

size_t artifactFreeBytes() {
  const size_t total = LittleFS.totalBytes();
  const size_t used = LittleFS.usedBytes();
  return total > used ? total - used : 0;
}

size_t artifactExistingSize(const String& name) {
  if (!artifactNameSafe(name)) return 0;
  File file = LittleFS.open(artifactPath(name), FILE_READ);
  if (!file || file.isDirectory()) return 0;
  const size_t size = file.size();
  file.close();
  return size;
}

bool deleteArtifact(const String& name) {
  return artifactNameSafe(name) && LittleFS.remove(artifactPath(name));
}

bool openArtifact(const String& name, File& file, String& mime) {
  if (!artifactNameSafe(name)) return false;
  file = LittleFS.open(artifactPath(name), FILE_READ);
  if (!file || file.isDirectory()) return false;
  mime = artifactMimeType(name);
  return true;
}

void writeArtifactsJson(JsonObject target) {
  JsonObject storage = target["storage"].to<JsonObject>();
  storage["totalBytes"] = LittleFS.totalBytes();
  storage["usedBytes"] = LittleFS.usedBytes();
  storage["freeBytes"] = artifactFreeBytes();

  JsonArray artifacts = target["artifacts"].to<JsonArray>();
  File directory = LittleFS.open(ARTIFACT_DIRECTORY, FILE_READ);
  if (!directory || !directory.isDirectory()) return;
  for (File file = directory.openNextFile(); file; file = directory.openNextFile()) {
    if (file.isDirectory()) continue;
    const String path = file.name();
    const String name = path.substring(path.lastIndexOf('/') + 1);
    if (!artifactNameSafe(name)) continue;
    JsonObject entry = artifacts.add<JsonObject>();
    entry["name"] = name;
    entry["size"] = file.size();
    entry["mime"] = artifactMimeType(name);
    file.close();
  }
  directory.close();
}
