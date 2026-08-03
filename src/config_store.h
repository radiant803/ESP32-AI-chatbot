#pragma once

#include <Arduino.h>

void configStoreBegin();
String configuredSecret(const String& provider);
String configuredOllamaUrl();
bool saveProviderSecret(const String& provider, const String& value);
bool deleteProviderSecret(const String& provider);
bool saveOllamaUrl(const String& value);
bool deleteOllamaUrl();
bool saveDefaults(const String& provider, const String& model, float temperature);
void loadDefaults(String& provider, String& model, float& temperature);
String configStatusJson();

