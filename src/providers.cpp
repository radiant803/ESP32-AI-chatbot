#include "providers.h"
#include "secrets.h"
#include "config_store.h"

#include <ArduinoJson.h>
#include <HTTPClient.h>
#include <WiFiClient.h>
#include <WiFiClientSecure.h>

namespace {
constexpr size_t MAX_RESPONSE_BYTES = 60000;

ProviderResult fail(const String& message, int status = 400) {
  return {false, status, message, String()};
}

ProviderResult requestJson(const String& method, const String& url,
                           const String& body, const String& authHeader,
                           const String& extraHeader = String()) {
  HTTPClient http;
  WiFiClientSecure secure;
  WiFiClient plain;
  const bool isHttps = url.startsWith("https://");
  if (isHttps) secure.setInsecure();
  if (!(isHttps ? http.begin(secure, url) : http.begin(plain, url))) {
    return fail("Could not open provider connection", 502);
  }
  http.setTimeout(25000);
  http.addHeader("Content-Type", "application/json");
  if (authHeader.length()) http.addHeader("Authorization", authHeader);
  if (extraHeader.length()) {
    if (url.indexOf("anthropic.com") >= 0) {
      http.addHeader("x-api-key", extraHeader);
      http.addHeader("anthropic-version", "2023-06-01");
    } else if (url.indexOf("generativelanguage.googleapis.com") >= 0) {
      http.addHeader("x-goog-api-key", extraHeader);
    } else {
      http.addHeader("x-api-key", extraHeader);
    }
  }
  int status = method == "GET" ? http.GET() : http.POST(body);
  String response = http.getString();
  http.end();
  if (response.length() > MAX_RESPONSE_BYTES) return fail("Provider response too large", 502);
  if (status < 0) {
    return fail("Provider network error " + String(status) + "; ESP32 could not complete the TLS/DNS connection", 502);
  }
  if (status < 200 || status >= 300) {
    String detail = response.substring(0, 400);
    return fail("Provider returned HTTP " + String(status) + ": " + detail, status > 0 ? status : 502);
  }
  return {true, status, String(), response};
}

ProviderResult normalizedModels(const String& provider, const String& raw, const char* arrayKey, bool googleModels = false) {
  JsonDocument input;
  if (deserializeJson(input, raw)) return fail("Provider returned invalid model JSON", 502);
  JsonDocument output;
  output["provider"] = provider;
  JsonArray models = output["models"].to<JsonArray>();
  JsonArray source = input[arrayKey].as<JsonArray>();
  for (JsonObject item : source) {
    if (googleModels) {
      bool supportsChat = false;
      for (const char* method : item["supportedGenerationMethods"].as<JsonArray>()) {
        if (String(method) == "generateContent") { supportsChat = true; break; }
      }
      if (!supportsChat) continue;
    }
    String rawId = item["id"] | item["name"] | item["model"] | "";
    if (!rawId.length()) continue;
    JsonObject entry = models.add<JsonObject>();
    String modelId = googleModels ? String(item["baseModelId"] | rawId) : rawId;
    entry["id"] = modelId.startsWith("models/") ? modelId.substring(7) : modelId;
    entry["name"] = item["display_name"] | item["displayName"] | rawId;
  }
  String result;
  serializeJson(output, result);
  return {true, 200, String(), result};
}

String openAiMessages(const String& messagesJson) { return messagesJson; }

}  // namespace

ProviderResult fetchModels(const String& provider) {
  if (provider == "openai") {
    String key = configuredSecret("openai"); if (!key.length()) return fail("OpenAI API key is not configured", 401);
    auto r = requestJson("GET", "https://api.openai.com/v1/models", "", "Bearer " + key);
    return r.ok ? normalizedModels(provider, r.payload, "data") : r;
  }
  if (provider == "anthropic") {
    String key = configuredSecret("anthropic"); if (!key.length()) return fail("Anthropic API key is not configured", 401);
    auto r = requestJson("GET", "https://api.anthropic.com/v1/models", "", "", key);
    return r.ok ? normalizedModels(provider, r.payload, "data") : r;
  }
  if (provider == "google") {
    String key = configuredSecret("google"); if (!key.length()) return fail("Google API key is not configured", 401);
    auto r = requestJson("GET", "https://generativelanguage.googleapis.com/v1beta/models?key=" + key, "", "", key);
    return r.ok ? normalizedModels(provider, r.payload, "models", true) : r;
  }
  if (provider == "ollama") {
    String base = configuredOllamaUrl(); if (!base.length()) return fail("Ollama URL is not configured", 400);
    auto r = requestJson("GET", base + "/api/tags", "", "");
    return r.ok ? normalizedModels(provider, r.payload, "models") : r;
  }
  return fail("Unsupported provider", 400);
}

ProviderResult generateChat(const String& provider, const String& model,
                            const String& messagesJson, float temperature) {
  if (!model.length()) return fail("A model is required", 400);
  JsonDocument messagesDoc;
  if (deserializeJson(messagesDoc, messagesJson) || !messagesDoc.is<JsonArray>()) return fail("Invalid messages JSON", 400);
  String body;
  String url;
  String auth;
  String extra;
  JsonDocument request;
  if (provider == "openai") {
    String key = configuredSecret("openai"); if (!key.length()) return fail("OpenAI API key is not configured", 401);
    request["model"] = model; request["messages"] = messagesDoc.as<JsonArray>(); request["temperature"] = temperature;
    url = "https://api.openai.com/v1/chat/completions"; auth = "Bearer " + key;
  } else if (provider == "anthropic") {
    String key = configuredSecret("anthropic"); if (!key.length()) return fail("Anthropic API key is not configured", 401);
    JsonArray source = messagesDoc.as<JsonArray>(); JsonArray out = request["messages"].to<JsonArray>();
    String system;
    for (JsonObject item : source) { const char* role = item["role"] | "user"; if (String(role) == "system") { if (system.length()) system += "\n\n"; system += item["content"] | ""; } else { JsonObject m = out.add<JsonObject>(); m["role"] = role; m["content"] = item["content"] | ""; } }
    if (system.length()) request["system"] = system;
    request["model"] = model; request["max_tokens"] = 1024; request["temperature"] = temperature;
    url = "https://api.anthropic.com/v1/messages"; extra = key;
  } else if (provider == "google") {
    String key = configuredSecret("google"); if (!key.length()) return fail("Google API key is not configured", 401);
    JsonArray contents = request["contents"].to<JsonArray>();
    String system;
    for (JsonObject item : messagesDoc.as<JsonArray>()) { String role = item["role"] | "user"; if (role == "system") { if (system.length()) system += "\n\n"; system += item["content"] | ""; continue; } JsonObject c = contents.add<JsonObject>(); c["role"] = role == "assistant" ? "model" : "user"; JsonArray parts = c["parts"].to<JsonArray>(); parts.add<JsonObject>()["text"] = item["content"] | ""; }
    if (system.length()) request["systemInstruction"]["parts"][0]["text"] = system;
    request["generationConfig"]["temperature"] = temperature; url = "https://generativelanguage.googleapis.com/v1beta/models/" + model + ":generateContent?key=" + key; extra = key;
  } else if (provider == "ollama") {
    String base = configuredOllamaUrl(); if (!base.length()) return fail("Ollama URL is not configured", 400);
    request["model"] = model; request["messages"] = messagesDoc.as<JsonArray>(); request["stream"] = false; url = base + "/api/chat";
  } else return fail("Unsupported provider", 400);
  serializeJson(request, body);
  auto r = requestJson("POST", url, body, auth, extra);
  if (!r.ok) return r;
  JsonDocument response;
  if (deserializeJson(response, r.payload)) return fail("Provider returned invalid chat JSON", 502);
  JsonDocument normalized; normalized["provider"] = provider; normalized["model"] = model;
  String content;
  if (provider == "openai") content = response["choices"][0]["message"]["content"] | "";
  else if (provider == "anthropic") content = response["content"][0]["text"] | "";
  else if (provider == "google") content = response["candidates"][0]["content"]["parts"][0]["text"] | "";
  else content = response["message"]["content"] | "";
  if (!content.length()) return fail("Provider returned no text content", 502);
  normalized["content"] = content; String payload; serializeJson(normalized, payload); return {true, 200, String(), payload};
}

ProviderResult generateAgentPlan(const String& provider, const String& model,
                                 const String& messagesJson, float temperature) {
  const char* instruction =
      "You are ChatESP's bounded document planner. Return ONLY one JSON object, no markdown. "
      "Schema: {\"artifact\":{\"type\":\"docx|pptx|xlsx|text|code\",\"filename\":\"safe-name.ext\",\"title\":\"short title\",\"sections\":[{\"heading\":\"...\",\"text\":\"...\"}],\"slides\":[{\"title\":\"...\",\"bullets\":[\"...\"]}],\"sheets\":[{\"name\":\"Sheet1\",\"columns\":[\"...\"],\"rows\":[[\"...\"]]}],\"content\":\"...\"}}. "
      "Use only fields relevant to type. Max 8 sections, 8 slides, 3 sheets, 30 rows per sheet, 8 bullets per slide. "
      "Filename ASCII letters/numbers/dot/dash/underscore only, 96 chars max. Never include executable instructions.";
  JsonDocument source;
  if (deserializeJson(source, messagesJson) || !source.is<JsonArray>()) return fail("Invalid messages JSON", 400);
  JsonDocument combined; JsonArray msgs = combined.to<JsonArray>();
  JsonObject system = msgs.add<JsonObject>(); system["role"] = "system"; system["content"] = instruction;
  for (JsonObject item : source.as<JsonArray>()) { JsonObject out = msgs.add<JsonObject>(); out["role"] = item["role"] | "user"; out["content"] = item["content"] | ""; }
  String combinedJson; serializeJson(msgs, combinedJson);
  ProviderResult result = generateChat(provider, model, combinedJson, temperature);
  if (!result.ok) return result;
  JsonDocument envelope; if (deserializeJson(envelope, result.payload)) return fail("Provider returned invalid agent response", 502);
  String content = envelope["content"] | "";
  JsonDocument plan; if (deserializeJson(plan, content)) return fail("Agent did not return JSON", 502);
  JsonObject artifact = plan["artifact"].as<JsonObject>();
  String type = artifact["type"] | ""; String filename = artifact["filename"] | "";
  if (!(type == "docx" || type == "pptx" || type == "xlsx" || type == "text" || type == "code") || !filename.length() || filename.length() > 96 || filename.indexOf("..") >= 0 || filename.indexOf('/') >= 0 || filename.indexOf('\\') >= 0) return fail("Agent returned an unsupported artifact plan", 502);
  for (size_t i = 0; i < filename.length(); ++i) { char c = filename[i]; if (!((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') || c == '.' || c == '-' || c == '_')) return fail("Agent returned an unsafe filename", 502); }
  if (artifact["sections"].is<JsonArray>() && artifact["sections"].size() > 8) return fail("Agent plan exceeds section limit", 502);
  if (artifact["slides"].is<JsonArray>() && artifact["slides"].size() > 8) return fail("Agent plan exceeds slide limit", 502);
  if (artifact["sheets"].is<JsonArray>() && artifact["sheets"].size() > 3) return fail("Agent plan exceeds sheet limit", 502);
  String out; serializeJson(plan, out); if (out.length() > 15000) return fail("Agent plan is too large", 502);
  return {true, 200, String(), out};
}
