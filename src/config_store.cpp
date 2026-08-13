#include "config_store.h"

#include <Preferences.h>

#include "app_types.h"

namespace {

Preferences preferences;
constexpr char NVS_NAMESPACE[] = "chatesp";

const char* keyForProvider(const String& provider) {
  if (provider == "openai") return "openai_key";
  if (provider == "anthropic") return "anthropic_key";
  if (provider == "google") return "google_key";
  return nullptr;
}

String hostOnly(const String& url) {
  String host = url;
  const int scheme = host.indexOf("://");
  if (scheme >= 0) host = host.substring(scheme + 3);
  const int slash = host.indexOf('/');
  if (slash >= 0) host = host.substring(0, slash);
  return host.substring(0, 96);
}

bool printableAscii(const String& value) {
  for (size_t index = 0; index < value.length(); ++index) {
    const char character = value[index];
    if (character < 32 || character > 126) return false;
  }
  return true;
}

}  // namespace

bool configStoreBegin() { return preferences.begin(NVS_NAMESPACE, false); }

bool providerConfigured(const String& provider) {
  if (provider == "ollama") return configuredOllamaUrl().length() > 0;
  return configuredSecret(provider).length() > 0;
}

String configuredSecret(const String& provider) {
  const char* key = keyForProvider(provider);
  if (key == nullptr) return String();
  String normalized;
  normalizeProviderSecret(preferences.getString(key, ""), normalized);
  return normalized;
}

String configuredOllamaUrl() { return preferences.getString("ollama_url", ""); }

bool normalizeProviderSecret(const String& rawValue, String& normalizedValue) {
  normalizedValue = "";
  normalizedValue.reserve(rawValue.length());
  for (size_t index = 0; index < rawValue.length(); ++index) {
    const uint8_t character = static_cast<uint8_t>(rawValue[index]);
    // Provider API keys are ASCII tokens. Ignore pasted Unicode whitespace,
    // including U+2028, rather than sending invisible bytes to the provider.
    if (character >= 33 && character <= 126) normalizedValue += static_cast<char>(character);
  }
  return normalizedValue.length() > 0 && normalizedValue.length() <= MAX_PROVIDER_KEY_BYTES &&
         printableAscii(normalizedValue);
}

bool saveProviderSecret(const String& provider, const String& rawValue) {
  const char* key = keyForProvider(provider);
  if (key == nullptr) return false;
  String value;
  if (!normalizeProviderSecret(rawValue, value)) {
    return false;
  }
  return preferences.putString(key, value) == value.length();
}

bool deleteProviderSecret(const String& provider) {
  const char* key = keyForProvider(provider);
  return key != nullptr && (!preferences.isKey(key) || preferences.remove(key));
}

bool normalizeOllamaUrl(const String& rawValue, String& normalizedValue) {
  normalizedValue = rawValue;
  normalizedValue.trim();
  if (normalizedValue.length() < 10 ||
      normalizedValue.length() > MAX_OLLAMA_URL_BYTES ||
      (!normalizedValue.startsWith("http://") &&
       !normalizedValue.startsWith("https://")) ||
      normalizedValue.indexOf('@') >= 0 || normalizedValue.indexOf('?') >= 0 ||
      normalizedValue.indexOf('#') >= 0 || !printableAscii(normalizedValue)) {
    return false;
  }
  while (normalizedValue.endsWith("/")) {
    normalizedValue.remove(normalizedValue.length() - 1);
  }
  const int scheme = normalizedValue.indexOf("://");
  const int firstHostCharacter = scheme + 3;
  if (scheme < 0 || normalizedValue.length() <= firstHostCharacter ||
      normalizedValue.indexOf('/', firstHostCharacter) >= 0 ||
      normalizedValue.indexOf(' ', firstHostCharacter) >= 0) {
    return false;
  }
  return true;
}

bool saveOllamaUrl(const String& rawValue) {
  String normalized;
  if (!normalizeOllamaUrl(rawValue, normalized)) return false;
  return preferences.putString("ollama_url", normalized) == normalized.length();
}

bool deleteOllamaUrl() {
  return !preferences.isKey("ollama_url") || preferences.remove("ollama_url");
}

bool validModelId(const String& value) {
  if (!value.length() || value.length() > MAX_MODEL_ID_BYTES) return false;
  for (size_t index = 0; index < value.length(); ++index) {
    const char character = value[index];
    const bool safe = (character >= 'a' && character <= 'z') ||
                      (character >= 'A' && character <= 'Z') ||
                      (character >= '0' && character <= '9') ||
                      character == '-' || character == '_' || character == '.' ||
                      character == ':';
    if (!safe) return false;
  }
  return true;
}

bool savePreferences(const String& provider, const String& model,
                     float temperature) {
  if (!knownProvider(provider) || (model.length() && !validModelId(model)) ||
      temperature < 0.0f || temperature > 2.0f) {
    return false;
  }
  const bool providerSaved =
      preferences.putString("default_pr", provider) == provider.length();
  const bool modelSaved =
      preferences.putString("default_mo", model) == model.length();
  const bool temperatureSaved = preferences.putFloat("default_tmp", temperature) > 0;
  return providerSaved && modelSaved && temperatureSaved;
}

void loadPreferences(String& provider, String& model, float& temperature) {
  provider = preferences.getString("default_pr", "openai");
  if (!knownProvider(provider)) provider = "openai";
  model = preferences.getString("default_mo", "");
  if (model.length() && !validModelId(model)) model = "";
  temperature = preferences.getFloat("default_tmp", 0.7f);
  if (temperature < 0.0f || temperature > 2.0f) temperature = 0.7f;
}

void writeSafeConfiguration(JsonObject target) {
  JsonObject providers = target["providers"].to<JsonObject>();
  for (const char* provider : {"openai", "anthropic", "google"}) {
    JsonObject entry = providers[provider].to<JsonObject>();
    entry["label"] = providerLabel(provider);
    entry["configured"] = providerConfigured(provider);
  }

  JsonObject ollama = providers["ollama"].to<JsonObject>();
  ollama["label"] = providerLabel("ollama");
  ollama["configured"] = providerConfigured("ollama");
  const String ollamaUrl = configuredOllamaUrl();
  ollama["host"] = hostOnly(ollamaUrl);
  ollama["scheme"] = ollamaUrl.startsWith("https://") ? "https" : "http";

  String provider;
  String model;
  float temperature = 0.7f;
  loadPreferences(provider, model, temperature);
  JsonObject defaults = target["preferences"].to<JsonObject>();
  defaults["provider"] = provider;
  defaults["model"] = model;
  defaults["temperature"] = temperature;
}
