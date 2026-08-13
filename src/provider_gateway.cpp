#include "provider_gateway.h"

#include <HTTPClient.h>
#include <WiFi.h>
#include <WiFiClient.h>
#include <WiFiClientSecure.h>

#include <algorithm>

#include "artifacts.h"
#include "config_store.h"

namespace {

constexpr uint32_t PROVIDER_TIMEOUT_MS = 25000;
constexpr uint32_t AGENT_TIMEOUT_MS = 50000;
constexpr uint32_t MODEL_DISCOVERY_TIMEOUT_MS = 12000;
constexpr size_t MAX_PROVIDER_RESPONSE_BYTES = 60000;
constexpr size_t MAX_ERROR_BODY_BYTES = 1536;
constexpr size_t MAX_DISCOVERED_MODELS = 160;
constexpr size_t MAX_CHAT_MESSAGES = 12;
constexpr size_t MAX_MESSAGE_CHARS = 1400;
constexpr size_t MAX_AGENT_PLAN_BYTES = 15000;

String urlEncode(const String& source) {
  const char hex[] = "0123456789ABCDEF";
  String encoded;
  encoded.reserve(source.length() * 3);
  for (size_t index = 0; index < source.length(); ++index) {
    const unsigned char character = static_cast<unsigned char>(source[index]);
    const bool unreserved = (character >= 'a' && character <= 'z') ||
                            (character >= 'A' && character <= 'Z') ||
                            (character >= '0' && character <= '9') ||
                            character == '-' || character == '_' ||
                            character == '.' || character == '~';
    if (unreserved) {
      encoded += static_cast<char>(character);
    } else {
      encoded += '%';
      encoded += hex[character >> 4];
      encoded += hex[character & 0x0F];
    }
  }
  return encoded;
}

String readCapped(WiFiClient& stream, size_t limit) {
  String body;
  body.reserve(limit + 1);
  const uint32_t deadline = millis() + 1800;
  while (body.length() < limit && millis() < deadline) {
    while (stream.available() && body.length() < limit) {
      const int character = stream.read();
      if (character >= 0) body += static_cast<char>(character);
    }
    if (!stream.connected() && !stream.available()) break;
    delay(1);
  }
  body.trim();
  return body;
}

String providerErrorDetail(const String& body) {
  if (!body.length()) return String();
  JsonDocument document;
  if (deserializeJson(document, body)) return String();
  String detail = document["error"]["message"].as<String>();
  if (!detail.length()) detail = document["message"].as<String>();
  detail.trim();
  detail.replace('\r', ' ');
  detail.replace('\n', ' ');
  if (detail.length() > 220) detail = detail.substring(0, 220) + "...";
  return detail;
}

String httpStatusSuffix(int status) {
  return status > 0 ? " (HTTP " + String(status) + ")." : ".";
}

String providerHint(const String& fallback, const String& detail) {
  return detail.length() ? "Provider details: " + detail : fallback;
}

ApiResult mapHttpFailure(int status, const String& detail = String()) {
  if (status < 0) {
    return apiFailure("network_unreachable", "The ESP32 could not reach the provider.",
                      "Check Wi-Fi, DNS, TLS, and the Ollama LAN URL.", 502);
  }
  if (status == 401 || status == 403) {
    return apiFailure("authentication_failed", "The provider rejected the credential" + httpStatusSuffix(status),
                      providerHint("Paste a current key and run Test & Save again.", detail), status);
  }
  if (status == 404) {
    return apiFailure("model_or_endpoint_not_found", "The provider could not find that model or endpoint" + httpStatusSuffix(status),
                      providerHint("Refresh live models and choose one returned by the provider.", detail), 404);
  }
  if (status == 408 || status == 504) {
    return apiFailure("provider_timeout", "The provider request timed out.",
                      "Retry after checking the network connection.", 504);
  }
  if (status == 429) {
    return apiFailure("rate_limited", "The provider is rate-limiting this request" + httpStatusSuffix(status),
                      providerHint("Wait a moment, then retry.", detail), 429);
  }
  if (status >= 500) {
    return apiFailure("provider_unavailable", "The provider is temporarily unavailable" + httpStatusSuffix(status),
                      providerHint("Retry later; the saved configuration was not changed.", detail), 502);
  }
  return apiFailure("provider_request_failed", "The provider rejected this request" + httpStatusSuffix(status),
                    providerHint("Check the selected model and provider account settings.", detail), status > 0 ? status : 502);
}

ApiResult requestJson(const String& provider, const String& method,
                      const String& url, const String& body,
                      const String& credential, JsonDocument& response,
                      uint32_t timeoutMs = PROVIDER_TIMEOUT_MS) {
  if (WiFi.status() != WL_CONNECTED) {
    return apiFailure("network_unreachable", "The ESP32 is not connected to Wi-Fi.",
                      "Connect it to the internet, then retry.", 503);
  }

  HTTPClient http;
  WiFiClient plainClient;
  WiFiClientSecure secureClient;
  const bool https = url.startsWith("https://");
  if (https) secureClient.setInsecure();
  const bool started = https ? http.begin(secureClient, url) : http.begin(plainClient, url);
  if (!started) {
    return apiFailure("connection_setup_failed", "The ESP32 could not open a provider connection.",
                      "Check the provider URL and Wi-Fi connection.", 502);
  }

  http.setTimeout(timeoutMs);
  http.setConnectTimeout(timeoutMs);
  http.useHTTP10(true);
  http.setReuse(false);
  http.addHeader("Accept", "application/json");
  if (method == "POST") http.addHeader("Content-Type", "application/json");
  if (provider == "openai") {
    http.addHeader("Authorization", "Bearer " + credential);
  } else if (provider == "anthropic") {
    http.addHeader("x-api-key", credential);
    http.addHeader("anthropic-version", "2023-06-01");
  } else if (provider == "google") {
    http.addHeader("x-goog-api-key", credential);
  }

  const int status = method == "GET" ? http.GET() : http.POST(body);
  if (status < 200 || status >= 300) {
    String detail;
    if (status > 0) {
      WiFiClient* stream = http.getStreamPtr();
      if (stream != nullptr) detail = providerErrorDetail(readCapped(*stream, MAX_ERROR_BODY_BYTES));
    }
    http.end();
    return mapHttpFailure(status, detail);
  }

  const int reportedLength = http.getSize();
  if (reportedLength > static_cast<int>(MAX_PROVIDER_RESPONSE_BYTES)) {
    http.end();
    return apiFailure("provider_response_too_large", "The provider response is too large for this ESP32.",
                      "Choose a provider/model with a smaller response or retry later.", 502);
  }

  WiFiClient* stream = http.getStreamPtr();
  if (stream == nullptr) {
    http.end();
    return apiFailure("provider_response_missing", "The provider returned no readable response stream.",
                      "Retry the request.", 502);
  }
  const DeserializationError parseError = deserializeJson(response, *stream);
  http.end();
  if (parseError) {
    return apiFailure("provider_response_invalid", "The provider returned invalid JSON.",
                      "Retry the request or choose another provider.", 502);
  }
  return apiSuccess();
}

void appendModel(ProviderModels& output, String id, String name) {
  id.trim();
  if (id.startsWith("models/")) id = id.substring(7);
  if (!validModelId(id)) return;
  for (const ProviderModel& current : output.items) {
    if (current.id == id) return;
  }
  if (output.items.size() >= MAX_DISCOVERED_MODELS) {
    output.truncated = true;
    return;
  }
  name.trim();
  if (!name.length()) name = id;
  if (name.length() > 120) name = name.substring(0, 120);
  output.items.push_back({id, name});
}

void sortModels(ProviderModels& output) {
  std::sort(output.items.begin(), output.items.end(),
            [](const ProviderModel& left, const ProviderModel& right) {
              return left.name < right.name;
            });
}

ApiResult finishDiscovery(ProviderModels& output) {
  sortModels(output);
  if (output.items.empty()) {
    return apiFailure("no_usable_models", "The provider returned no usable chat model IDs.",
                      "Confirm account access and try Test & Save again.", 422);
  }
  return apiSuccess();
}

ApiResult fetchOpenAiModels(const String& key, ProviderModels& output) {
  JsonDocument response;
  ApiResult result = requestJson("openai", "GET", "https://api.openai.com/v1/models", "", key, response,
                                 MODEL_DISCOVERY_TIMEOUT_MS);
  if (!result.ok) return result;
  JsonArray data = response["data"].as<JsonArray>();
  if (data.isNull()) {
    return apiFailure("provider_response_invalid", "OpenAI returned an unexpected model list.",
                      "Retry Test & Save.", 502);
  }
  for (JsonObject item : data) {
    appendModel(output, item["id"].as<String>(), item["id"].as<String>());
  }
  return finishDiscovery(output);
}

ApiResult fetchAnthropicModels(const String& key, ProviderModels& output) {
  String afterId;
  for (uint8_t page = 0; page < 3; ++page) {
    String url = "https://api.anthropic.com/v1/models?limit=1000";
    if (afterId.length()) url += "&after_id=" + urlEncode(afterId);
    JsonDocument response;
    ApiResult result = requestJson("anthropic", "GET", url, "", key, response,
                                   MODEL_DISCOVERY_TIMEOUT_MS);
    if (!result.ok) return result;
    JsonArray data = response["data"].as<JsonArray>();
    if (data.isNull()) {
      return apiFailure("provider_response_invalid", "Anthropic returned an unexpected model list.",
                        "Retry Test & Save.", 502);
    }
    for (JsonObject item : data) {
      String name = item["display_name"].as<String>();
      if (!name.length()) name = item["displayName"].as<String>();
      appendModel(output, item["id"].as<String>(), name);
    }
    if (!(response["has_more"] | false)) break;
    afterId = response["last_id"].as<String>();
    if (!afterId.length()) break;
  }
  return finishDiscovery(output);
}

bool supportsGenerateContent(JsonObject model) {
  JsonArray methods = model["supportedGenerationMethods"].as<JsonArray>();
  if (methods.isNull()) methods = model["supportedActions"].as<JsonArray>();
  if (methods.isNull()) return false;
  for (JsonVariant method : methods) {
    if (method.as<String>() == "generateContent") return true;
  }
  return false;
}

ApiResult fetchGeminiModels(const String& key, ProviderModels& output) {
  // Gemini's page tokens are opaque and short-lived. One complete, bounded page
  // is sufficient for the ESP32 selector and avoids replaying an expired token.
  JsonDocument response;
  ApiResult result = requestJson("google", "GET",
                                 "https://generativelanguage.googleapis.com/v1beta/models?pageSize=100",
                                 "", key, response, MODEL_DISCOVERY_TIMEOUT_MS);
  if (!result.ok) return result;
  JsonArray data = response["models"].as<JsonArray>();
  if (data.isNull()) {
    return apiFailure("provider_response_invalid", "Google returned an unexpected model list.",
                      "Retry Test & Save.", 502);
  }
  for (JsonObject item : data) {
    if (!supportsGenerateContent(item)) continue;
    String id = item["name"].as<String>();
    String name = item["displayName"].as<String>();
    if (!name.length()) name = item["display_name"].as<String>();
    appendModel(output, id, name);
  }
  return finishDiscovery(output);
}

ApiResult fetchOllamaModels(const String& baseUrl, ProviderModels& output) {
  JsonDocument response;
  ApiResult result = requestJson("ollama", "GET", baseUrl + "/api/tags", "", "", response,
                                 MODEL_DISCOVERY_TIMEOUT_MS);
  if (!result.ok) return result;
  JsonArray data = response["models"].as<JsonArray>();
  if (data.isNull()) {
    return apiFailure("provider_response_invalid", "Ollama returned an unexpected model list.",
                      "Check that the URL points to an Ollama server.", 502);
  }
  for (JsonObject item : data) {
    String id = item["model"].as<String>();
    if (!id.length()) id = item["name"].as<String>();
    appendModel(output, id, item["name"].as<String>());
  }
  return finishDiscovery(output);
}

ApiResult parseMessages(const String& messagesJson, JsonDocument& output) {
  if (deserializeJson(output, messagesJson) || !output.is<JsonArray>()) {
    return apiFailure("invalid_messages", "Messages must be a JSON array.",
                      "Start a new chat and try again.", 400);
  }
  JsonArray messages = output.as<JsonArray>();
  if (messages.isNull() || messages.size() == 0 || messages.size() > MAX_CHAT_MESSAGES) {
    return apiFailure("invalid_messages", "The conversation has too many messages.",
                      "Start a new chat to keep the request small.", 400);
  }
  for (JsonObject message : messages) {
    const String role = message["role"].as<String>();
    const String content = message["content"].as<String>();
    if (!((role == "system") || (role == "user") || (role == "assistant"))) {
      return apiFailure("invalid_messages", "A chat message has an unsupported role.",
                        "Start a new chat and retry.", 400);
    }
    if (!content.length() || content.length() > MAX_MESSAGE_CHARS) {
      return apiFailure("invalid_messages", "A chat message is empty or too long.",
                        "Start a new chat and keep each message under 1,400 characters.", 400);
    }
  }
  return apiSuccess();
}

String systemPrompt(JsonArray messages) {
  String output;
  for (JsonObject message : messages) {
    if (message["role"].as<String>() != "system") continue;
    if (output.length()) output += "\n\n";
    output += message["content"].as<String>();
  }
  return output;
}

String openAiInput(JsonArray messages) {
  String input;
  input.reserve(MAX_CHAT_MESSAGES * 180);
  for (JsonObject message : messages) {
    const String role = message["role"].as<String>();
    if (role == "system") continue;
    input += role == "assistant" ? "Assistant: " : "User: ";
    input += message["content"].as<String>();
    input += "\n\n";
  }
  input += "Assistant:";
  return input;
}

String jsonText(JsonVariantConst value) {
  if (value.isNull() || !value.is<const char*>()) return String();
  const char* text = value.as<const char*>();
  return text == nullptr ? String() : String(text);
}

String extractOpenAiText(JsonDocument& response) {
  // output_text is an SDK-only convenience property. Raw REST responses carry
  // text in completed output message content blocks instead.
  String text;
  JsonArray output = response["output"].as<JsonArray>();
  for (JsonObject item : output) {
    if (jsonText(item["type"]) != "message") continue;
    for (JsonObject content : item["content"].as<JsonArray>()) {
      const String type = jsonText(content["type"]);
      if (type == "output_text") text += jsonText(content["text"]);
      if (type == "refusal") text += jsonText(content["refusal"]);
    }
  }
  return text;
}

String extractAnthropicText(JsonDocument& response) {
  String text;
  for (JsonObject content : response["content"].as<JsonArray>()) {
    if (content["type"].as<String>() == "text") text += content["text"].as<String>();
  }
  return text;
}

String extractGeminiText(JsonDocument& response) {
  String text;
  JsonArray candidates = response["candidates"].as<JsonArray>();
  if (candidates.isNull() || candidates.size() == 0) return text;
  for (JsonObject part : candidates[0]["content"]["parts"].as<JsonArray>()) {
    text += part["text"].as<String>();
  }
  return text;
}

ApiResult responseWithText(const String& provider, const String& model, String text) {
  text.trim();
  if (!text.length()) {
    return apiFailure("provider_empty_response", "The provider returned no text content.",
                      "Choose another live model or retry.", 502);
  }
  if (text.length() > 14000) text = text.substring(0, 14000);
  JsonDocument payload;
  payload["provider"] = provider;
  payload["model"] = model;
  payload["content"] = text;
  String encoded;
  serializeJson(payload, encoded);
  return apiSuccess(encoded);
}

bool validArtifactPlan(JsonDocument& plan, ApiError& error) {
  JsonObject artifact = plan["artifact"].as<JsonObject>();
  if (artifact.isNull()) {
    error = ApiError("agent_plan_invalid", "Agent output did not include an artifact.",
                     "Ask for a document, presentation, spreadsheet, text file, or code file.", 502);
    return false;
  }
  const String type = artifact["type"].as<String>();
  const String filename = artifact["filename"].as<String>();
  if (!artifactNameSafe(filename) ||
      !(type == "docx" || type == "pptx" || type == "xlsx" || type == "text" || type == "code")) {
    error = ApiError("agent_plan_invalid", "Agent output contained an unsafe artifact type or filename.",
                     "Try the request again with a simple file name.", 502);
    return false;
  }
  String lower = filename;
  lower.toLowerCase();
  const bool rightExtension = (type == "docx" && lower.endsWith(".docx")) ||
                              (type == "pptx" && lower.endsWith(".pptx")) ||
                              (type == "xlsx" && lower.endsWith(".xlsx")) ||
                              (type == "text" && (lower.endsWith(".txt") || lower.endsWith(".md"))) ||
                              (type == "code" && !lower.endsWith(".docx") && !lower.endsWith(".pptx") && !lower.endsWith(".xlsx"));
  if (!rightExtension) {
    error = ApiError("agent_plan_invalid", "Artifact type and filename extension do not match.",
                     "Ask the agent to use the matching extension.", 502);
    return false;
  }
  if (artifact["sections"].is<JsonArray>() && artifact["sections"].size() > 8) {
    error = ApiError("agent_plan_too_large", "Agent plan contains too many document sections.",
                     "Ask for a shorter document.", 502);
    return false;
  }
  if (artifact["slides"].is<JsonArray>() && artifact["slides"].size() > 8) {
    error = ApiError("agent_plan_too_large", "Agent plan contains too many slides.",
                     "Ask for eight slides or fewer.", 502);
    return false;
  }
  if (artifact["sheets"].is<JsonArray>() && artifact["sheets"].size() > 3) {
    error = ApiError("agent_plan_too_large", "Agent plan contains too many worksheets.",
                     "Ask for three sheets or fewer.", 502);
    return false;
  }
  return true;
}

String extractJsonObject(String value) {
  value.trim();
  if (value.startsWith("```")) {
    const int firstNewline = value.indexOf('\n');
    const int lastFence = value.lastIndexOf("```");
    if (firstNewline >= 0 && lastFence > firstNewline) {
      value = value.substring(firstNewline + 1, lastFence);
      value.trim();
    }
  }
  const int firstBrace = value.indexOf('{');
  const int lastBrace = value.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    value = value.substring(firstBrace, lastBrace + 1);
  }
  return value;
}

}  // namespace

ApiResult discoverModels(const String& provider, const String& transientKey,
                         const String& transientOllamaUrl,
                         ProviderModels& output) {
  if (!knownProvider(provider)) {
    return apiFailure("unsupported_provider", "That provider is not supported.",
                      "Choose OpenAI, Anthropic, Google Gemini, or Ollama.", 400);
  }
  output = ProviderModels();
  output.provider = provider;

  if (provider == "ollama") {
    String baseUrl = transientOllamaUrl.length() ? transientOllamaUrl : configuredOllamaUrl();
    String normalized;
    if (!normalizeOllamaUrl(baseUrl, normalized)) {
      return apiFailure("ollama_url_missing", "A valid Ollama LAN URL is required.",
                        "Use a URL such as http://192.168.1.20:11434.", 400);
    }
    return fetchOllamaModels(normalized, output);
  }

  const String key = transientKey.length() ? transientKey : configuredSecret(provider);
  if (!key.length()) {
    return apiFailure("credential_missing", "No API key is saved for this provider.",
                      "Open Settings and use Test & Save.", 401);
  }
  if (provider == "openai") return fetchOpenAiModels(key, output);
  if (provider == "anthropic") return fetchAnthropicModels(key, output);
  return fetchGeminiModels(key, output);
}

void writeModelsJson(JsonObject target, const ProviderModels& models) {
  target["provider"] = models.provider;
  target["truncated"] = models.truncated;
  JsonArray output = target["models"].to<JsonArray>();
  for (const ProviderModel& model : models.items) {
    JsonObject item = output.add<JsonObject>();
    item["id"] = model.id;
    item["name"] = model.name;
  }
}

ApiResult chatCompletion(const String& provider, const String& model,
                         const String& messagesJson, float temperature,
                         bool requireJsonObject, uint32_t timeoutMs) {
  if (!knownProvider(provider) || !validModelId(model)) {
    return apiFailure("invalid_model", "Choose a model returned by live discovery.",
                      "Refresh models in Settings and select one from the list.", 400);
  }

  JsonDocument messagesDocument;
  ApiResult messagesResult = parseMessages(messagesJson, messagesDocument);
  if (!messagesResult.ok) return messagesResult;
  JsonArray messages = messagesDocument.as<JsonArray>();
  const String key = provider == "ollama" ? String() : configuredSecret(provider);
  String ollamaUrl = provider == "ollama" ? configuredOllamaUrl() : String();
  if (provider != "ollama" && !key.length()) {
    return apiFailure("credential_missing", "No API key is saved for this provider.",
                      "Open Settings and use Test & Save.", 401);
  }
  if (provider == "ollama") {
    String normalized;
    if (!normalizeOllamaUrl(ollamaUrl, normalized)) {
      return apiFailure("ollama_url_missing", "No valid Ollama URL is saved.",
                        "Open Settings and use Test & Save.", 400);
    }
    ollamaUrl = normalized;
  }

  JsonDocument request;
  String url;
  if (provider == "openai") {
    request["model"] = model;
    String openAiInputStr = openAiInput(messages);
    // OpenAI requires the word "json" in the input when json_object format is used.
    if (requireJsonObject) openAiInputStr += "\nRespond with a JSON object.";
    request["input"] = openAiInputStr;
    const String system = systemPrompt(messages);
    if (system.length()) request["instructions"] = system;
    request["max_output_tokens"] = requireJsonObject ? 2048 : 1200;
    request["store"] = false;
    url = "https://api.openai.com/v1/responses";
  } else if (provider == "anthropic") {
    request["model"] = model;
    request["max_tokens"] = 1200;
    request["temperature"] = constrain(temperature, 0.0f, 1.0f);
    const String system = systemPrompt(messages);
    if (system.length()) request["system"] = system;
    JsonArray outputMessages = request["messages"].to<JsonArray>();
    for (JsonObject message : messages) {
      if (message["role"].as<String>() == "system") continue;
      JsonObject outputMessage = outputMessages.add<JsonObject>();
      outputMessage["role"] = message["role"].as<String>();
      outputMessage["content"] = message["content"].as<String>();
    }
    url = "https://api.anthropic.com/v1/messages";
  } else if (provider == "google") {
    JsonArray contents = request["contents"].to<JsonArray>();
    for (JsonObject message : messages) {
      const String role = message["role"].as<String>();
      if (role == "system") continue;
      JsonObject content = contents.add<JsonObject>();
      content["role"] = role == "assistant" ? "model" : "user";
      JsonArray parts = content["parts"].to<JsonArray>();
      parts.add<JsonObject>()["text"] = message["content"].as<String>();
    }
    const String system = systemPrompt(messages);
    if (system.length()) request["systemInstruction"]["parts"][0]["text"] = system;
    request["generationConfig"]["temperature"] = constrain(temperature, 0.0f, 2.0f);
    request["generationConfig"]["maxOutputTokens"] = 1200;
    url = "https://generativelanguage.googleapis.com/v1beta/models/" + model + ":generateContent";
  } else {
    request["model"] = model;
    request["stream"] = false;
    request["messages"].set(messages);
    request["options"]["temperature"] = constrain(temperature, 0.0f, 2.0f);
    request["options"]["num_predict"] = 1200;
    url = ollamaUrl + "/api/chat";
  }

  String body;
  serializeJson(request, body);
  JsonDocument response;
  ApiResult result = requestJson(provider, "POST", url, body, key, response, timeoutMs);
  if (!result.ok) return result;

  if (provider == "openai") return responseWithText(provider, model, extractOpenAiText(response));
  if (provider == "anthropic") return responseWithText(provider, model, extractAnthropicText(response));
  if (provider == "google") return responseWithText(provider, model, extractGeminiText(response));
  return responseWithText(provider, model, response["message"]["content"].as<String>());
}

ApiResult createAgentPlan(const String& provider, const String& model,
                          const String& messagesJson, float temperature) {
  JsonDocument source;
  ApiResult sourceResult = parseMessages(messagesJson, source);
  if (!sourceResult.ok) return sourceResult;

  const char* instruction =
      "You are ChatESP's bounded artifact planner. Return only one JSON object, no markdown. "
      "Schema: {\"artifact\":{\"type\":\"docx|pptx|xlsx|text|code\",\"filename\":\"safe-name.ext\",\"title\":\"short title\",\"sections\":[{\"heading\":\"...\",\"text\":\"...\"}],\"slides\":[{\"title\":\"...\",\"bullets\":[\"...\"]}],\"sheets\":[{\"name\":\"Sheet1\",\"columns\":[\"...\"],\"rows\":[[\"...\"]]}],\"content\":\"...\"}}. "
      "Use only fields needed for the selected artifact. Use ASCII filenames of at most 96 characters. "
      "Maximum: 8 sections, 8 slides with 8 bullets each, 3 sheets with 30 rows each. "
      "Never include tool calls, shell commands, or executable instructions.";

  JsonDocument combined;
  JsonArray messages = combined.to<JsonArray>();
  JsonObject system = messages.add<JsonObject>();
  system["role"] = "system";
  system["content"] = instruction;
  JsonArray sourceMessages = source.as<JsonArray>();
  const size_t firstMessage = sourceMessages.size() > (MAX_CHAT_MESSAGES - 1)
                                  ? sourceMessages.size() - (MAX_CHAT_MESSAGES - 1)
                                  : 0;
  for (size_t index = firstMessage; index < sourceMessages.size(); ++index) {
    JsonObject message = sourceMessages[index];
    JsonObject copied = messages.add<JsonObject>();
    copied["role"] = message["role"].as<String>();
    copied["content"] = message["content"].as<String>();
  }
  String combinedJson;
  serializeJson(messages, combinedJson);
  ApiResult completion = chatCompletion(provider, model, combinedJson,
                                         constrain(temperature, 0.0f, 0.5f), true,
                                         AGENT_TIMEOUT_MS);
  if (!completion.ok) return completion;

  JsonDocument completionBody;
  if (deserializeJson(completionBody, completion.payload)) {
    return apiFailure("agent_plan_invalid", "The agent response could not be read.",
                      "Try the request again.", 502);
  }
  String content = extractJsonObject(completionBody["content"].as<String>());
  if (content.length() > MAX_AGENT_PLAN_BYTES) {
    return apiFailure("agent_plan_too_large", "The agent plan is too large for this ESP32.",
                      "Ask for a shorter artifact.", 502);
  }
  JsonDocument plan;
  if (deserializeJson(plan, content)) {
    return apiFailure("agent_plan_invalid", "The model did not return a valid artifact plan.",
                      "Try again with a simpler artifact request.", 502);
  }
  ApiError error;
  if (!validArtifactPlan(plan, error)) {
    ApiResult failed;
    failed.error = error;
    return failed;
  }
  String encoded;
  serializeJson(plan, encoded);
  return apiSuccess(encoded);
}
