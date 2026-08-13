#pragma once

#include <Arduino.h>
#include <ArduinoJson.h>

constexpr size_t MAX_PROVIDER_KEY_BYTES = 512;
constexpr size_t MAX_OLLAMA_URL_BYTES = 160;
constexpr size_t MAX_MODEL_ID_BYTES = 128;

bool configStoreBegin();

bool providerConfigured(const String& provider);
String configuredSecret(const String& provider);
String configuredOllamaUrl();

bool normalizeProviderSecret(const String& rawValue, String& normalizedValue);
bool saveProviderSecret(const String& provider, const String& rawValue);
bool deleteProviderSecret(const String& provider);
bool saveOllamaUrl(const String& rawValue);
bool deleteOllamaUrl();

bool savePreferences(const String& provider, const String& model,
                     float temperature);
void loadPreferences(String& provider, String& model, float& temperature);

bool validModelId(const String& value);
bool normalizeOllamaUrl(const String& rawValue, String& normalizedValue);
void writeSafeConfiguration(JsonObject target);
