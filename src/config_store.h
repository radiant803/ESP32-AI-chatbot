#pragma once

#include <Arduino.h>
#include <ArduinoJson.h>

constexpr size_t MAX_CREDENTIAL_BYTES = 512;
constexpr size_t MAX_URL_BYTES = 160;

bool configBegin();

// Raw key/value access (NVS on ESP32, an EEPROM-backed JSON blob on ESP8266; both survive uploadfs).
String cfgGet(const char* key);
bool cfgPut(const char* key, const String& value);
bool cfgDel(const char* key);

// Providers: openai, anthropic, google, tavily, brave (API keys); ollama, searxng (LAN URLs).
bool knownProvider(const String& provider);
bool providerIsUrl(const String& provider);
const char* providerLabel(const String& provider);
String credentialFor(const String& provider);
bool credentialConfigured(const String& provider);
bool normalizeCredential(const String& provider, const String& raw, String& out);
bool saveCredential(const String& provider, const String& raw);
bool deleteCredential(const String& provider);

bool savePreferences(const String& provider, const String& model, float temperature);
void writeConfiguration(JsonObject target);
