#include "http_api.h"

#include <ArduinoJson.h>
#include <LittleFS.h>
#include <WiFi.h>

#include "app_types.h"
#include "artifacts.h"
#include "config_store.h"
#include "provider_gateway.h"

namespace {

constexpr size_t MAX_JSON_BODY_BYTES = 18000;
constexpr const char* FIRMWARE_VERSION = "2.0.0";

WebServer* apiServer = nullptr;
File uploadFile;
size_t uploadBytes = 0;
bool uploadFailed = false;
bool uploadTooLarge = false;

void sendDocument(int status, JsonDocument& document) {
  String body;
  serializeJson(document, body);
  apiServer->send(status, "application/json; charset=utf-8", body);
}

void sendOk(JsonDocument& document, int status = 200) {
  document["ok"] = true;
  sendDocument(status, document);
}

void sendError(const ApiError& error) {
  JsonDocument document;
  document["ok"] = false;
  JsonObject payload = document["error"].to<JsonObject>();
  payload["code"] = error.code;
  payload["message"] = error.message;
  payload["hint"] = error.hint;
  sendDocument(error.httpStatus, document);
}

void sendFailure(const String& code, const String& message, const String& hint,
                 int status) {
  sendError(ApiError(code, message, hint, status));
}

bool parseJsonBody(JsonDocument& document) {
  if (!apiServer->hasArg("plain")) {
    sendFailure("request_body_missing", "A JSON request body is required.",
                "Retry the action from the ChatESP page.", 400);
    return false;
  }
  const String body = apiServer->arg("plain");
  if (!body.length() || body.length() > MAX_JSON_BODY_BYTES ||
      deserializeJson(document, body) || !document.is<JsonObject>()) {
    sendFailure("request_body_invalid", "The request body is invalid or too large.",
                "Keep the conversation short and retry.", 400);
    return false;
  }
  return true;
}

void writeConfiguration(JsonDocument& document) {
  JsonObject configuration = document["configuration"].to<JsonObject>();
  writeSafeConfiguration(configuration);
}

void writeHealth(JsonDocument& document) {
  document["firmware"] = "ChatESP";
  document["version"] = FIRMWARE_VERSION;
  JsonObject wifi = document["wifi"].to<JsonObject>();
  const bool stationConnected = WiFi.status() == WL_CONNECTED;
  wifi["stationConnected"] = stationConnected;
  wifi["stationIp"] = stationConnected ? WiFi.localIP().toString() : String();
  wifi["setupApIp"] = WiFi.softAPIP().toString();
  JsonObject storage = document["storage"].to<JsonObject>();
  storage["totalBytes"] = LittleFS.totalBytes();
  storage["usedBytes"] = LittleFS.usedBytes();
  storage["freeBytes"] = artifactFreeBytes();
}

void handleHealth() {
  JsonDocument document;
  writeHealth(document);
  sendOk(document);
}

void handleProviders() {
  JsonDocument document;
  writeConfiguration(document);
  sendOk(document);
}

void handleBootstrap() {
  JsonDocument document;
  writeConfiguration(document);
  writeHealth(document);
  sendOk(document);
}

void handleValidateProvider() {
  JsonDocument body;
  if (!parseJsonBody(body)) return;
  const String provider = body["provider"].as<String>();
  if (!knownProvider(provider)) {
    sendFailure("unsupported_provider", "Choose a supported provider.",
                "Use OpenAI, Anthropic, Google Gemini, or Ollama.", 400);
    return;
  }

  String submittedKey = body["apiKey"].as<String>();
  String submittedUrl = body["ollamaUrl"].as<String>();
  if (provider == "ollama") {
    String normalized;
    if (!normalizeOllamaUrl(submittedUrl, normalized)) {
      sendFailure("ollama_url_invalid", "Enter a valid Ollama LAN URL.",
                  "Use a URL such as http://192.168.1.20:11434.", 400);
      return;
    }
    submittedUrl = normalized;
  } else {
    String normalizedKey;
    if (!normalizeProviderSecret(submittedKey, normalizedKey)) {
      sendFailure("credential_invalid", "Enter a non-empty API key to test.",
                  "Paste the key again; invisible whitespace is removed automatically.", 400);
      return;
    }
    submittedKey = normalizedKey;
  }

  ProviderModels models;
  ApiResult discovery = discoverModels(provider, submittedKey, submittedUrl, models);
  if (!discovery.ok) {
    sendError(discovery.error);
    return;
  }

  const bool saved = provider == "ollama" ? saveOllamaUrl(submittedUrl)
                                             : saveProviderSecret(provider, submittedKey);
  if (!saved) {
    sendFailure("configuration_save_failed", "Live models were found but the ESP32 could not save configuration.",
                "Retry once; if it persists, reflash or erase NVS intentionally.", 507);
    return;
  }

  JsonDocument document;
  writeModelsJson(document.to<JsonObject>(), models);
  writeConfiguration(document);
  sendOk(document);
}

void handleModels() {
  if (!apiServer->hasArg("provider")) {
    sendFailure("provider_missing", "A provider is required.",
                "Choose a provider and refresh live models.", 400);
    return;
  }
  const String provider = apiServer->arg("provider");
  ProviderModels models;
  ApiResult result = discoverModels(provider, String(), String(), models);
  if (!result.ok) {
    sendError(result.error);
    return;
  }
  JsonDocument document;
  writeModelsJson(document.to<JsonObject>(), models);
  sendOk(document);
}

void handlePreferences() {
  JsonDocument body;
  if (!parseJsonBody(body)) return;
  const String provider = body["provider"].as<String>();
  const String model = body["model"].as<String>();
  const float temperature = body["temperature"] | 0.7f;
  if (!savePreferences(provider, model, temperature)) {
    sendFailure("preferences_invalid", "Provider, model, or temperature is invalid.",
                "Choose a live model and use a temperature from 0 to 2.", 400);
    return;
  }
  JsonDocument document;
  writeConfiguration(document);
  sendOk(document);
}

void handleDeleteProviderKey() {
  if (!apiServer->hasArg("provider")) {
    sendFailure("provider_missing", "A provider is required.",
                "Choose the provider key to delete.", 400);
    return;
  }
  const String provider = apiServer->arg("provider");
  if (!knownProvider(provider)) {
    sendFailure("unsupported_provider", "Choose a supported provider.",
                "Use OpenAI, Anthropic, Google Gemini, or Ollama.", 400);
    return;
  }
  const bool deleted = provider == "ollama" ? deleteOllamaUrl()
                                               : deleteProviderSecret(provider);
  if (!deleted) {
    sendFailure("configuration_delete_failed", "The ESP32 could not delete that configuration.",
                "Retry the deletion.", 507);
    return;
  }
  JsonDocument document;
  writeConfiguration(document);
  sendOk(document);
}

bool readChatRequest(JsonDocument& body, String& provider, String& model,
                     String& messages, float& temperature) {
  if (!parseJsonBody(body)) return false;
  provider = body["provider"].as<String>();
  model = body["model"].as<String>();
  JsonArray messageArray = body["messages"].as<JsonArray>();
  if (!knownProvider(provider) || !validModelId(model) || messageArray.isNull()) {
    sendFailure("chat_request_invalid", "Choose a provider, a live model, and a message.",
                "Open Settings to refresh live models.", 400);
    return false;
  }
  serializeJson(messageArray, messages);
  temperature = constrain(body["temperature"] | 0.7f, 0.0f, 2.0f);
  return true;
}

void handleChat() {
  JsonDocument body;
  String provider;
  String model;
  String messages;
  float temperature = 0.7f;
  if (!readChatRequest(body, provider, model, messages, temperature)) return;
  ApiResult result = chatCompletion(provider, model, messages, temperature);
  if (!result.ok) {
    sendError(result.error);
    return;
  }
  JsonDocument document;
  if (deserializeJson(document, result.payload)) {
    sendFailure("response_encode_failed", "The provider response could not be prepared.",
                "Retry the message.", 502);
    return;
  }
  sendOk(document);
}

void handleAgentPlan() {
  JsonDocument body;
  String provider;
  String model;
  String messages;
  float temperature = 0.3f;
  if (!readChatRequest(body, provider, model, messages, temperature)) return;
  ApiResult result = createAgentPlan(provider, model, messages, temperature);
  if (!result.ok) {
    sendError(result.error);
    return;
  }
  JsonDocument plan;
  if (deserializeJson(plan, result.payload)) {
    sendFailure("agent_plan_invalid", "The agent plan could not be prepared.",
                "Try a simpler request.", 502);
    return;
  }
  JsonDocument document;
  document["artifact"].set(plan["artifact"]);
  sendOk(document);
}

void handleArtifacts() {
  JsonDocument document;
  writeArtifactsJson(document.to<JsonObject>());
  sendOk(document);
}

void clearTemporaryUpload() {
  if (uploadFile) uploadFile.close();
  if (LittleFS.exists(artifactTemporaryPath())) LittleFS.remove(artifactTemporaryPath());
}

void handleArtifactUploadChunk() {
  HTTPUpload& upload = apiServer->upload();
  if (upload.status == UPLOAD_FILE_START) {
    clearTemporaryUpload();
    uploadBytes = 0;
    uploadFailed = false;
    uploadTooLarge = false;
    uploadFile = LittleFS.open(artifactTemporaryPath(), FILE_WRITE);
    if (!uploadFile) uploadFailed = true;
    return;
  }
  if (upload.status == UPLOAD_FILE_WRITE) {
    if (uploadFailed || uploadBytes + upload.currentSize > MAX_ARTIFACT_BYTES) {
      uploadFailed = true;
      uploadTooLarge = true;
      return;
    }
    const size_t written = uploadFile.write(upload.buf, upload.currentSize);
    uploadBytes += written;
    if (written != upload.currentSize) uploadFailed = true;
    return;
  }
  if (upload.status == UPLOAD_FILE_END) {
    if (uploadFile) uploadFile.close();
    return;
  }
  if (upload.status == UPLOAD_FILE_ABORTED) {
    uploadFailed = true;
    clearTemporaryUpload();
  }
}

void handleArtifactUpload() {
  const String name = apiServer->arg("name");
  if (!artifactNameSafe(name) || !uploadBytes || uploadFailed ||
      !LittleFS.exists(artifactTemporaryPath())) {
    clearTemporaryUpload();
    sendFailure("artifact_upload_failed", "The artifact could not be saved.",
                "Use a safe filename and a file under 700 KB.",
                uploadTooLarge ? 413 : 507);
    return;
  }

  const String destination = artifactPath(name);
  const String backup = artifactBackupPath();
  LittleFS.remove(backup);
  bool previousMoved = false;
  if (LittleFS.exists(destination)) {
    previousMoved = LittleFS.rename(destination, backup);
    if (!previousMoved) {
      clearTemporaryUpload();
      sendFailure("artifact_replace_failed", "The previous artifact could not be replaced.",
                  "Delete it from Artifacts and retry.", 507);
      return;
    }
  }
  if (!LittleFS.rename(artifactTemporaryPath(), destination)) {
    if (previousMoved) LittleFS.rename(backup, destination);
    clearTemporaryUpload();
    sendFailure("artifact_upload_failed", "The artifact could not be finalized.",
                "Check free ESP32 storage and retry.", 507);
    return;
  }
  if (previousMoved) LittleFS.remove(backup);
  uploadBytes = 0;
  JsonDocument document;
  writeArtifactsJson(document.to<JsonObject>());
  sendOk(document, 201);
}

void handleArtifactDownload() {
  const String name = apiServer->arg("name");
  File file;
  String mime;
  if (!openArtifact(name, file, mime)) {
    sendFailure("artifact_not_found", "That artifact no longer exists.",
                "Refresh the Artifacts list.", 404);
    return;
  }
  apiServer->sendHeader("Content-Disposition", "attachment; filename=\"" + name + "\"");
  apiServer->streamFile(file, mime);
  file.close();
}

void handleArtifactDelete() {
  const String name = apiServer->arg("name");
  if (!deleteArtifact(name)) {
    sendFailure("artifact_not_found", "That artifact no longer exists.",
                "Refresh the Artifacts list.", 404);
    return;
  }
  JsonDocument document;
  writeArtifactsJson(document.to<JsonObject>());
  sendOk(document);
}

void handleNotFound() {
  if (apiServer->uri().startsWith("/api/")) {
    sendFailure("route_not_found", "That API route does not exist.",
                "Refresh ChatESP and retry.", 404);
    return;
  }
  apiServer->send(404, "text/plain; charset=utf-8", "Not found");
}

}  // namespace

void registerApiRoutes(WebServer& server) {
  apiServer = &server;
  server.on("/api/health", HTTP_GET, handleHealth);
  server.on("/api/providers", HTTP_GET, handleProviders);
  server.on("/api/bootstrap", HTTP_GET, handleBootstrap);
  server.on("/api/providers/validate", HTTP_POST, handleValidateProvider);
  server.on("/api/providers/models", HTTP_GET, handleModels);
  server.on("/api/preferences", HTTP_PUT, handlePreferences);
  server.on("/api/providers/key", HTTP_DELETE, handleDeleteProviderKey);
  server.on("/api/chat", HTTP_POST, handleChat);
  server.on("/api/agent/plan", HTTP_POST, handleAgentPlan);
  server.on("/api/artifacts", HTTP_GET, handleArtifacts);
  server.on("/api/artifacts", HTTP_DELETE, handleArtifactDelete);
  server.on("/api/artifacts", HTTP_POST, handleArtifactUpload, handleArtifactUploadChunk);
  server.on("/api/artifacts/download", HTTP_GET, handleArtifactDownload);
  server.onNotFound(handleNotFound);
}
