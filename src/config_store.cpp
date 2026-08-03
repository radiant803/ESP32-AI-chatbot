#include "config_store.h"
#include "secrets.h"
#include <ArduinoJson.h>
#include <Preferences.h>
#include <WiFi.h>

namespace {
Preferences prefs;
constexpr char NAMESPACE[] = "chatesp";
const char* keyFor(const String& provider) {
  if (provider == "openai") return "openai_key";
  if (provider == "anthropic") return "anthropic_key";
  if (provider == "google") return "google_key";
  return nullptr;
}
String fallbackFor(const String& provider) {
  if (provider == "openai") return String(OPENAI_API_KEY);
  if (provider == "anthropic") return String(ANTHROPIC_API_KEY);
  if (provider == "google") return String(GOOGLE_API_KEY);
  return String();
}
String hostOnly(const String& url) {
  String out = url; int scheme = out.indexOf("://"); if (scheme >= 0) out = out.substring(scheme + 3); int slash = out.indexOf('/'); if (slash >= 0) out = out.substring(0, slash); int colon = out.indexOf(':'); if (colon >= 0) out = out.substring(0, colon); return out.substring(0, 96);
}
}

void configStoreBegin() { prefs.begin(NAMESPACE, false); }

String configuredSecret(const String& provider) {
  const char* key = keyFor(provider); if (!key) return String();
  String stored = prefs.getString(key, ""); return stored.length() ? stored : fallbackFor(provider);
}

String configuredOllamaUrl() { String stored = prefs.getString("ollama_url", ""); return stored.length() ? stored : String(OLLAMA_BASE_URL); }

bool saveProviderSecret(const String& provider, const String& raw) {
  const char* key = keyFor(provider); if (!key) return false;
  String value = raw; value.trim(); if (!value.length() || value.length() > 512) return false;
  return prefs.putString(key, value) == value.length();
}

bool deleteProviderSecret(const String& provider) { const char* key = keyFor(provider); return key && (!prefs.isKey(key) || prefs.remove(key)); }
bool saveOllamaUrl(const String& raw) { String value = raw; value.trim(); if (!value.startsWith("http://") && !value.startsWith("https://")) return false; if (value.length() > 160) return false; return prefs.putString("ollama_url", value) == value.length(); }
bool deleteOllamaUrl() { return !prefs.isKey("ollama_url") || prefs.remove("ollama_url"); }

bool saveDefaults(const String& provider, const String& model, float temperature) {
  if (provider != "openai" && provider != "anthropic" && provider != "google" && provider != "ollama") return false;
  if (model.length() > 160 || temperature < 0 || temperature > 2) return false;
  bool ok = prefs.putString("default_provider", provider) > 0; ok = (prefs.putString("default_model", model) > 0 || !model.length()) && ok; ok = prefs.putFloat("temperature", temperature) > 0 && ok; return ok;
}

void loadDefaults(String& provider, String& model, float& temperature) { provider = prefs.getString("default_provider", "openai"); model = prefs.getString("default_model", ""); temperature = prefs.getFloat("temperature", 0.7f); }

String configStatusJson() {
  JsonDocument d; JsonObject p = d["providers"].to<JsonObject>();
  for (const char* name : {"openai", "anthropic", "google"}) p[name]["hasKey"] = configuredSecret(name).length() > 0;
  d["ollama"]["configured"] = configuredOllamaUrl().length() > 0; d["ollama"]["urlHost"] = hostOnly(configuredOllamaUrl());
  String provider, model; float temperature; loadDefaults(provider, model, temperature); d["defaults"]["provider"] = provider; d["defaults"]["model"] = model; d["defaults"]["temperature"] = temperature;
  d["wifi"]["connected"] = WiFi.status() == WL_CONNECTED; d["wifi"]["ip"] = WiFi.localIP().toString(); String out; serializeJson(d, out); return out;
}
