#include "config_store.h"

#include "hal.h"

#if defined(ESP32)
#include <Preferences.h>
#else
#include <EEPROM.h>
#endif

namespace {

struct ProviderInfo {
  const char* id;
  const char* label;
  const char* slot;  // storage key, at most 15 characters for NVS
  bool isUrl;
};

constexpr ProviderInfo PROVIDERS[] = {
    {"openai", "OpenAI", "openai_key", false},
    {"anthropic", "Anthropic", "anthropic_key", false},
    {"google", "Google Gemini", "google_key", false},
    {"tavily", "Tavily search", "tavily_key", false},
    {"brave", "Brave Search", "brave_key", false},
    {"ollama", "Ollama", "ollama_url", true},
    {"searxng", "SearXNG", "searxng_url", true},
};

const ProviderInfo* find(const String& id) {
  for (const ProviderInfo& p : PROVIDERS) {
    if (id == p.id) return &p;
  }
  return nullptr;
}

bool printableAscii(const String& value) {
  for (size_t i = 0; i < value.length(); ++i) {
    const char c = value[i];
    if (c < 32 || c > 126) return false;
  }
  return true;
}

#if defined(ESP32)
Preferences prefs;
#else
constexpr size_t EEPROM_BYTES = 2048;
JsonDocument eeprom;

// The EEPROM library keeps a RAM copy of the whole sector while open, which the ESP8266 cannot spare during TLS.
// So the sector is only opened for the moment it is read or written.
void eepromFlush() {
  String blob;
  serializeJson(eeprom, blob);
  if (blob.length() > EEPROM_BYTES - 8) return;
  EEPROM.begin(EEPROM_BYTES);
  EEPROM.write(0, 'C');
  EEPROM.write(1, 'E');
  EEPROM.write(2, 1);
  EEPROM.write(3, blob.length() & 0xFF);
  EEPROM.write(4, (blob.length() >> 8) & 0xFF);
  for (size_t i = 0; i < blob.length(); ++i) EEPROM.write(5 + i, blob[i]);
  EEPROM.commit();
  EEPROM.end();
}
#endif

}  // namespace

bool configBegin() {
#if defined(ESP32)
  return prefs.begin("chatesp", false);
#else
  EEPROM.begin(EEPROM_BYTES);
  if (EEPROM.read(0) == 'C' && EEPROM.read(1) == 'E' && EEPROM.read(2) == 1) {
    const size_t len = EEPROM.read(3) | (EEPROM.read(4) << 8);
    if (len > 0 && len <= EEPROM_BYTES - 8) {
      String blob;
      blob.reserve(len);
      for (size_t i = 0; i < len; ++i) blob += static_cast<char>(EEPROM.read(5 + i));
      deserializeJson(eeprom, blob);
    }
  }
  EEPROM.end();
  return true;
#endif
}

String cfgGet(const char* key) {
#if defined(ESP32)
  return prefs.getString(key, "");
#else
  return eeprom[key].is<const char*>() ? eeprom[key].as<String>() : String();
#endif
}

bool cfgPut(const char* key, const String& value) {
#if defined(ESP32)
  return prefs.putString(key, value) == value.length();
#else
  eeprom[key] = value;
  eepromFlush();
  return true;
#endif
}

bool cfgDel(const char* key) {
#if defined(ESP32)
  return !prefs.isKey(key) || prefs.remove(key);
#else
  eeprom.remove(key);
  eepromFlush();
  return true;
#endif
}

bool knownProvider(const String& provider) { return find(provider) != nullptr; }
bool providerIsUrl(const String& provider) {
  const ProviderInfo* p = find(provider);
  return p && p->isUrl;
}
const char* providerLabel(const String& provider) {
  const ProviderInfo* p = find(provider);
  return p ? p->label : "Unknown";
}
String credentialFor(const String& provider) {
  const ProviderInfo* p = find(provider);
  return p ? cfgGet(p->slot) : String();
}
bool credentialConfigured(const String& provider) { return credentialFor(provider).length() > 0; }

bool normalizeCredential(const String& provider, const String& raw, String& out) {
  const ProviderInfo* p = find(provider);
  if (!p) return false;
  out = "";
  if (p->isUrl) {
    out = raw;
    out.trim();
    if (out.length() < 10 || out.length() > MAX_URL_BYTES || !printableAscii(out)) return false;
    if (!out.startsWith("http://") && !out.startsWith("https://")) return false;
    if (out.indexOf('@') >= 0 || out.indexOf('?') >= 0 || out.indexOf('#') >= 0) return false;
    while (out.endsWith("/")) out.remove(out.length() - 1);
    const int hostStart = out.indexOf("://") + 3;
    return out.length() > hostStart && out.indexOf('/', hostStart) < 0 && out.indexOf(' ') < 0;
  }
  // API keys are ASCII tokens; drop pasted whitespace, including invisible Unicode separators.
  out.reserve(raw.length());
  for (size_t i = 0; i < raw.length(); ++i) {
    const uint8_t c = static_cast<uint8_t>(raw[i]);
    if (c >= 33 && c <= 126) out += static_cast<char>(c);
  }
  return out.length() > 0 && out.length() <= MAX_CREDENTIAL_BYTES;
}

bool saveCredential(const String& provider, const String& raw) {
  const ProviderInfo* p = find(provider);
  String value;
  return p && normalizeCredential(provider, raw, value) && cfgPut(p->slot, value);
}
bool deleteCredential(const String& provider) {
  const ProviderInfo* p = find(provider);
  return p && cfgDel(p->slot);
}

bool savePreferences(const String& provider, const String& model, float temperature) {
  if ((provider.length() && !knownProvider(provider)) || model.length() > 128 || temperature < 0 || temperature > 2) return false;
  for (size_t i = 0; i < model.length(); ++i) {
    const char c = model[i];
    if (!(isalnum(c) || c == '-' || c == '_' || c == '.' || c == ':' || c == '/')) return false;
  }
  return cfgPut("default_pr", provider) && cfgPut("default_mo", model) && cfgPut("default_tmp", String(temperature, 2));
}

void writeConfiguration(JsonObject target) {
  JsonObject providers = target["providers"].to<JsonObject>();
  for (const ProviderInfo& p : PROVIDERS) {
    JsonObject entry = providers[p.id].to<JsonObject>();
    entry["label"] = p.label;
    const String value = cfgGet(p.slot);
    entry["configured"] = value.length() > 0;
    if (p.isUrl && value.length()) {
      const int scheme = value.indexOf("://");
      entry["scheme"] = value.substring(0, scheme);
      entry["host"] = value.substring(scheme + 3);
    }
  }
  JsonObject preferences = target["preferences"].to<JsonObject>();
  preferences["provider"] = cfgGet("default_pr");
  preferences["model"] = cfgGet("default_mo");
  const String temperature = cfgGet("default_tmp");
  preferences["temperature"] = temperature.length() ? temperature.toFloat() : 0.7f;
}
