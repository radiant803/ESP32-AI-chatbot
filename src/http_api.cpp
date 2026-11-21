#include "http_api.h"

#include "artifacts.h"
#include "config_store.h"
#include "proxy.h"

volatile bool g_wifiChanged = false;
volatile uint32_t g_restartAt = 0;

namespace {

constexpr size_t MAX_SMALL_JSON = 4096;
HttpServer* api = nullptr;
File uploadFile;
size_t uploadBytes = 0;
bool uploadFailed = false;
bool uploadTooLarge = false;
bool otaFailed = false;
String otaError;

void streamFileReliably(File& file, const String& type, bool gzip, const String& cache);

const char FALLBACK_PAGE[] PROGMEM =
    "<!doctype html><meta charset=utf-8><meta name=viewport content='width=device-width,initial-scale=1'>"
    "<title>ChatESP</title><body style='font:16px system-ui;max-width:34rem;margin:12vh auto;padding:0 1rem;line-height:1.5'>"
    "<h1>ChatESP is running</h1><p>The web app files are not on this device yet. From the project folder run:</p>"
    "<pre style='background:#eee;padding:1rem;border-radius:8px;overflow:auto'>node web/build.mjs\npio run -e %CHIP% -t uploadfs</pre>"
    "<p>Then reload this page. The API is already available at <a href='/api/health'>/api/health</a>.</p>";

void sendJson(int status, JsonDocument& doc) {
  String out;
  serializeJson(doc, out);
  api->sendHeader("Cache-Control", "no-store");
  api->send(status, "application/json; charset=utf-8", out);
}
void sendOk(JsonDocument& doc, int status = 200) {
  doc["ok"] = true;
  sendJson(status, doc);
}
void fail(int status, const char* code, const String& message, const String& hint) { sendApiError(*api, status, code, message, hint); }

bool parseBody(JsonDocument& doc) {
  const String body = api->arg("plain");
  if (!body.length() || body.length() > MAX_SMALL_JSON || deserializeJson(doc, body) || !doc.is<JsonObject>()) {
    fail(400, "request_body_invalid", "The request body is invalid or too large.", "Retry from the ChatESP page.");
    return false;
  }
  return true;
}

void writeDevice(JsonObject d) {
  const bool connected = WiFi.status() == WL_CONNECTED;
  d["chip"] = CE_CHIP;
  d["cores"] = halCores();
  d["version"] = CE_VERSION;
  d["hostname"] = "chatesp";
  d["wifiConnected"] = connected;
  d["ip"] = connected ? WiFi.localIP().toString() : WiFi.softAPIP().toString();
  d["setupIp"] = WiFi.softAPIP().toString();
  d["ssid"] = connected ? WiFi.SSID() : String();
  d["rssi"] = connected ? WiFi.RSSI() : 0;
  d["heapFree"] = halFreeHeap();
  d["heapMin"] = halMinHeap();
  d["uptime"] = millis() / 1000;
  JsonObject storage = d["storage"].to<JsonObject>();
  storage["totalBytes"] = halFsTotal();
  storage["usedBytes"] = halFsUsed();
  storage["freeBytes"] = artifactFreeBytes();
  JsonObject limits = d["limits"].to<JsonObject>();
  limits["bodyBytes"] = CE_BODY_LIMIT;
  limits["fetchBytes"] = CE_FETCH_LIMIT;
}

void handleBootstrap() {
  JsonDocument doc;
  writeConfiguration(doc["configuration"].to<JsonObject>());
  writeDevice(doc["device"].to<JsonObject>());
  sendOk(doc);
}

void handleKeyPut() {
  JsonDocument body;
  if (!parseBody(body)) return;
  const String provider = body["provider"].as<String>();
  if (!knownProvider(provider)) {
    fail(400, "unsupported_provider", "Choose a supported provider.", "Use OpenAI, Anthropic, Google Gemini or a search provider.");
    return;
  }
  if (!saveCredential(provider, body["value"].as<String>())) {
    fail(400, "credential_invalid", "That credential is not valid or could not be saved.",
         providerIsUrl(provider) ? "Use a URL such as http://192.168.1.20:11434." : "Paste the key again.");
    return;
  }
  JsonDocument doc;
  writeConfiguration(doc["configuration"].to<JsonObject>());
  sendOk(doc);
}

void handleKeyDelete() {
  const String provider = api->arg("provider");
  if (!knownProvider(provider) || !deleteCredential(provider)) {
    fail(400, "unsupported_provider", "That credential could not be deleted.", "Choose a supported provider.");
    return;
  }
  JsonDocument doc;
  writeConfiguration(doc["configuration"].to<JsonObject>());
  sendOk(doc);
}

void handleTest() {
  JsonDocument body;
  if (!parseBody(body)) return;
  handleCredentialTest(*api, body["provider"].as<String>(), body["value"].as<String>());
}

void handlePreferences() {
  JsonDocument body;
  if (!parseBody(body)) return;
  if (!savePreferences(body["provider"].as<String>(), body["model"].as<String>(), body["temperature"] | 0.7f)) {
    fail(400, "preferences_invalid", "Provider, model or temperature is invalid.", "Choose a live model and a temperature from 0 to 2.");
    return;
  }
  JsonDocument doc;
  writeConfiguration(doc["configuration"].to<JsonObject>());
  sendOk(doc);
}

// ---- Artifacts ----
void clearTemporaryUpload() {
  if (uploadFile) uploadFile.close();
  LittleFS.remove(artifactTemporaryPath());
}

void handleArtifacts() {
  JsonDocument doc;
  writeArtifactsJson(doc.to<JsonObject>());
  sendOk(doc);
}

void handleArtifactUploadChunk() {
  HTTPUpload& upload = api->upload();
  if (upload.status == UPLOAD_FILE_START) {
    clearTemporaryUpload();
    uploadBytes = 0;
    uploadFailed = uploadTooLarge = false;
    uploadFile = LittleFS.open(artifactTemporaryPath(), "w");
    if (!uploadFile) uploadFailed = true;
  } else if (upload.status == UPLOAD_FILE_WRITE) {
    if (uploadFailed || uploadBytes + upload.currentSize > CE_MAX_ARTIFACT_BYTES || upload.currentSize > artifactFreeBytes()) {
      uploadFailed = uploadTooLarge = true;
      return;
    }
    const size_t written = uploadFile.write(upload.buf, upload.currentSize);
    uploadBytes += written;
    if (written != upload.currentSize) uploadFailed = true;
  } else if (upload.status == UPLOAD_FILE_END) {
    if (uploadFile) uploadFile.close();
  } else if (upload.status == UPLOAD_FILE_ABORTED) {
    uploadFailed = true;
    clearTemporaryUpload();
  }
}

void handleArtifactUpload() {
  const String name = api->arg("name");
  if (!artifactNameSafe(name) || !uploadBytes || uploadFailed || !LittleFS.exists(artifactTemporaryPath())) {
    clearTemporaryUpload();
    fail(uploadTooLarge ? 413 : 507, "artifact_upload_failed", "The file could not be stored.", "Use a safe filename and a file under 700 KB with free device storage.");
    return;
  }
  const String destination = artifactPath(name), backup = artifactBackupPath();
  LittleFS.remove(backup);
  const bool hadPrevious = LittleFS.exists(destination);
  if (hadPrevious && !LittleFS.rename(destination, backup)) {
    clearTemporaryUpload();
    fail(507, "artifact_replace_failed", "The previous file could not be replaced.", "Delete it from Files and retry.");
    return;
  }
  if (!LittleFS.rename(artifactTemporaryPath(), destination)) {
    if (hadPrevious) LittleFS.rename(backup, destination);
    clearTemporaryUpload();
    fail(507, "artifact_upload_failed", "The file could not be finalized.", "Check free device storage.");
    return;
  }
  if (hadPrevious) LittleFS.remove(backup);
  uploadBytes = 0;
  JsonDocument doc;
  writeArtifactsJson(doc.to<JsonObject>());
  sendOk(doc, 201);
}

void handleArtifactDownload() {
  const String name = api->arg("name");
  File file;
  String mime;
  if (!openArtifact(name, file, mime)) {
    fail(404, "artifact_not_found", "That file no longer exists.", "Refresh the Files list.");
    return;
  }
  api->sendHeader("Content-Disposition", "attachment; filename=\"" + name + "\"");
  streamFileReliably(file, mime, false, "no-store");
  file.close();
}

void handleArtifactDelete() {
  if (!deleteArtifact(api->arg("name"))) {
    fail(404, "artifact_not_found", "That file no longer exists.", "Refresh the Files list.");
    return;
  }
  handleArtifacts();
}

// ---- Device ----
void handleWifiScan() {
  const int found = WiFi.scanNetworks();
  JsonDocument doc;
  JsonArray networks = doc["networks"].to<JsonArray>();
  for (int i = 0; i < found && networks.size() < 20; ++i) {
    const String ssid = WiFi.SSID(i);
    if (!ssid.length()) continue;
    JsonObject n = networks.add<JsonObject>();
    n["ssid"] = ssid;
    n["rssi"] = WiFi.RSSI(i);
  }
  WiFi.scanDelete();
  sendOk(doc);
}

void handleWifiPut() {
  JsonDocument body;
  if (!parseBody(body)) return;
  const String ssid = body["ssid"].as<String>(), pass = body["password"].as<String>();
  if (!ssid.length() || ssid.length() > 32 || pass.length() > 63 || !cfgPut("wifi_ssid", ssid) || !cfgPut("wifi_pass", pass)) {
    fail(400, "wifi_invalid", "That Wi-Fi name or password is not valid.", "Names are up to 32 characters; passwords up to 63.");
    return;
  }
  g_wifiChanged = true;
  JsonDocument doc;
  sendOk(doc);
}

void handleReboot() {
  g_restartAt = millis() + 800;
  JsonDocument doc;
  sendOk(doc);
}

void handleOtaDone() {
  if (otaFailed || Update.hasError()) {
    fail(500, "ota_failed", otaError.length() ? otaError : String("The firmware update failed."), "Check the .bin was built for this chip, then retry.");
    return;
  }
  g_restartAt = millis() + 1000;
  JsonDocument doc;
  sendOk(doc);
}

void handleOtaChunk() {
  HTTPUpload& upload = api->upload();
  if (upload.status == UPLOAD_FILE_START) {
    otaFailed = false;
    otaError = "";
#if defined(ESP32)
    if (!Update.begin(UPDATE_SIZE_UNKNOWN)) otaFailed = true;
#else
    if (!Update.begin((ESP.getFreeSketchSpace() - 0x1000) & 0xFFFFF000)) otaFailed = true;
#endif
  } else if (upload.status == UPLOAD_FILE_WRITE && !otaFailed) {
    if (Update.write(upload.buf, upload.currentSize) != upload.currentSize) otaFailed = true;
  } else if (upload.status == UPLOAD_FILE_END && !otaFailed) {
    if (!Update.end(true)) otaFailed = true;
  } else if (upload.status == UPLOAD_FILE_ABORTED) {
    Update.end();
    otaFailed = true;
  }
#if defined(ESP32)
  if (otaFailed && !otaError.length()) otaError = Update.errorString();
#else
  if (otaFailed && !otaError.length()) otaError = Update.getErrorString();
#endif
}

// ---- Static web app (gzipped files in LittleFS) ----
String contentTypeFor(const String& path) {
  if (path.endsWith(".html")) return "text/html; charset=utf-8";
  if (path.endsWith(".css")) return "text/css; charset=utf-8";
  if (path.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (path.endsWith(".json")) return "application/json";
  if (path.endsWith(".svg")) return "image/svg+xml";
  if (path.endsWith(".png")) return "image/png";
  return "application/octet-stream";
}

// The ESP8266 core's streamFile() can drop the tail of large files when the TCP send buffer fills, so
// write in small blocks and retry partial writes ourselves. Closing the connection keeps both chips simple.
void streamFileReliably(File& file, const String& type, bool gzip, const String& cache) {
  api->setContentLength(file.size());
  if (cache.length()) api->sendHeader("Cache-Control", cache);
  if (gzip) api->sendHeader("Content-Encoding", "gzip");
  api->send(200, type, "");
  WiFiClient client = api->client();
  client.setNoDelay(true);
  uint8_t block[1024];
  uint32_t lastProgress = millis();
  while (file.available()) {
    const size_t n = file.read(block, sizeof(block));
    for (size_t sent = 0; sent < n;) {
      const size_t written = client.write(block + sent, n - sent);
      if (written) {
        sent += written;
        lastProgress = millis();
      } else {
        if (!client.connected() || millis() - lastProgress > 8000) return;
        delay(2);
      }
    }
    yield();
  }
}

bool serveStatic(String path) {
  if (path == "/" || path.endsWith("/")) path += "index.html";
  if (path.indexOf("..") >= 0) return false;
  const String gz = path + ".gz";
  const bool zipped = LittleFS.exists(gz);
  if (!zipped && !LittleFS.exists(path)) return false;
  File file = LittleFS.open(zipped ? gz : path, "r");
  if (!file) return false;
  // index.html is always revalidated; hashed asset URLs (?v=...) never change content, so they can be cached.
  streamFileReliably(file, contentTypeFor(path), zipped, path.endsWith(".html") ? "no-cache" : "max-age=604800");
  file.close();
  return true;
}

void handleNotFound() {
  const String uri = api->uri();
  if (uri.startsWith("/api/")) {
    fail(404, "route_not_found", "That API route does not exist.", "Reload ChatESP and retry.");
    return;
  }
  if (api->method() == HTTP_GET && serveStatic(uri)) return;
  if ((uri == "/" || uri == "/index.html") && api->method() == HTTP_GET) {
    String page = FPSTR(FALLBACK_PAGE);
    page.replace("%CHIP%", String(CE_CHIP) == "ESP32" ? "esp32dev" : "esp8266");
    api->send(200, "text/html; charset=utf-8", page);
    return;
  }
  api->send(404, "text/plain; charset=utf-8", "Not found");
}

}  // namespace

void registerApiRoutes(HttpServer& server) {
  api = &server;
#if defined(ESP32)
  const char* headers[] = {"X-CE-Provider", "X-CE-Path", "X-CE-Method", "X-CE-Timeout"};
  server.collectHeaders(headers, 4);
#else
  server.collectHeaders("X-CE-Provider", "X-CE-Path", "X-CE-Method", "X-CE-Timeout");
#endif
  server.on("/api/health", HTTP_GET, handleBootstrap);
  server.on("/api/bootstrap", HTTP_GET, handleBootstrap);
  server.on("/api/providers/key", HTTP_PUT, handleKeyPut);
  server.on("/api/providers/key", HTTP_DELETE, handleKeyDelete);
  server.on("/api/providers/test", HTTP_POST, handleTest);
  server.on("/api/preferences", HTTP_PUT, handlePreferences);
  server.on("/api/proxy", HTTP_POST, []() { handleProxy(*api); });
  server.on("/api/fetch", HTTP_GET, []() { handleFetchRelay(*api); });
  server.on("/api/artifacts", HTTP_GET, handleArtifacts);
  server.on("/api/artifacts", HTTP_DELETE, handleArtifactDelete);
  server.on("/api/artifacts", HTTP_POST, handleArtifactUpload, handleArtifactUploadChunk);
  server.on("/api/artifacts/download", HTTP_GET, handleArtifactDownload);
  server.on("/api/wifi/scan", HTTP_GET, handleWifiScan);
  server.on("/api/wifi", HTTP_PUT, handleWifiPut);
  server.on("/api/reboot", HTTP_POST, handleReboot);
  server.on("/api/ota", HTTP_POST, handleOtaDone, handleOtaChunk);
  server.onNotFound(handleNotFound);
}
