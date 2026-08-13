#pragma once

#include <Arduino.h>
#include <ArduinoJson.h>

#include "app_types.h"

ApiResult discoverModels(const String& provider, const String& transientKey,
                         const String& transientOllamaUrl,
                         ProviderModels& output);
ApiResult chatCompletion(const String& provider, const String& model,
                         const String& messagesJson, float temperature,
                         bool requireJsonObject = false,
                         uint32_t timeoutMs = 25000);
ApiResult createAgentPlan(const String& provider, const String& model,
                          const String& messagesJson, float temperature);
void writeModelsJson(JsonObject target, const ProviderModels& models);
