#include "artifacts.h"

#include "hal.h"

namespace {

constexpr const char* ARTIFACT_DIRECTORY = "/artifacts";
constexpr const char* TEMPORARY_ARTIFACT = "/.chatesp-upload.tmp";
constexpr const char* BACKUP_ARTIFACT = "/.chatesp-upload.bak";

bool allowedExtension(const String& name) {
  String lower = name;
  lower.toLowerCase();
  for (const char* ext : {".txt", ".md", ".csv", ".json", ".html", ".svg", ".js", ".ts", ".py", ".cpp", ".h", ".docx", ".pptx", ".xlsx"}) {
    if (lower.endsWith(ext)) return true;
  }
  return false;
}

}  // namespace

bool artifactsBegin() {
  if (!halFsBegin()) return false;
  if (!LittleFS.exists(ARTIFACT_DIRECTORY) && !LittleFS.mkdir(ARTIFACT_DIRECTORY)) return false;
  LittleFS.remove(TEMPORARY_ARTIFACT);
  LittleFS.remove(BACKUP_ARTIFACT);
  return true;
}

bool artifactNameSafe(const String& name) {
  if (!name.length() || name.length() > 96 || name[0] == '.' || name.indexOf("..") >= 0 || !allowedExtension(name)) return false;
  for (size_t i = 0; i < name.length(); ++i) {
    const char c = name[i];
    if (!(isalnum(c) || c == '.' || c == '-' || c == '_')) return false;
  }
  return true;
}

String artifactPath(const String& name) { return String(ARTIFACT_DIRECTORY) + "/" + name; }
String artifactTemporaryPath() { return String(TEMPORARY_ARTIFACT); }
String artifactBackupPath() { return String(BACKUP_ARTIFACT); }

String artifactMimeType(const String& name) {
  String lower = name;
  lower.toLowerCase();
  if (lower.endsWith(".docx")) return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (lower.endsWith(".pptx")) return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
  if (lower.endsWith(".xlsx")) return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  if (lower.endsWith(".json")) return "application/json";
  if (lower.endsWith(".html")) return "text/html; charset=utf-8";
  if (lower.endsWith(".svg")) return "image/svg+xml";
  if (lower.endsWith(".csv")) return "text/csv; charset=utf-8";
  if (lower.endsWith(".js") || lower.endsWith(".ts")) return "text/javascript; charset=utf-8";
  return "text/plain; charset=utf-8";
}

size_t artifactFreeBytes() {
  const size_t total = halFsTotal(), used = halFsUsed();
  return total > used ? total - used : 0;
}

bool deleteArtifact(const String& name) { return artifactNameSafe(name) && LittleFS.remove(artifactPath(name)); }

bool openArtifact(const String& name, File& file, String& mime) {
  if (!artifactNameSafe(name)) return false;
  file = LittleFS.open(artifactPath(name), "r");
  if (!file || file.isDirectory()) return false;
  mime = artifactMimeType(name);
  return true;
}

void writeArtifactsJson(JsonObject target) {
  JsonObject storage = target["storage"].to<JsonObject>();
  storage["totalBytes"] = halFsTotal();
  storage["usedBytes"] = halFsUsed();
  storage["freeBytes"] = artifactFreeBytes();
  JsonArray artifacts = target["artifacts"].to<JsonArray>();
  halListDir(ARTIFACT_DIRECTORY, [&](const String& name, size_t size) {
    if (!artifactNameSafe(name)) return;
    JsonObject entry = artifacts.add<JsonObject>();
    entry["name"] = name;
    entry["size"] = size;
    entry["mime"] = artifactMimeType(name);
  });
}
