#pragma once

#include <Arduino.h>

struct ProviderResult {
  bool ok;
  int status;
  String error;
  String payload;
};

ProviderResult fetchModels(const String& provider);
ProviderResult generateChat(const String& provider, const String& model,
                            const String& messagesJson, float temperature);
ProviderResult generateAgentPlan(const String& provider, const String& model,
                                 const String& messagesJson, float temperature);
