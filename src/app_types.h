#pragma once

#include <Arduino.h>

#include <vector>

struct ApiError {
  String code;
  String message;
  String hint;
  int httpStatus;

  ApiError() : httpStatus(500) {}
  ApiError(const String& errorCode, const String& errorMessage,
           const String& errorHint, int status)
      : code(errorCode), message(errorMessage), hint(errorHint), httpStatus(status) {}
};

struct ApiResult {
  bool ok = false;
  String payload;
  ApiError error;
};

inline ApiResult apiSuccess(const String& payload = String()) {
  ApiResult result;
  result.ok = true;
  result.payload = payload;
  return result;
}

inline ApiResult apiFailure(const String& code, const String& message,
                            const String& hint, int httpStatus) {
  ApiResult result;
  result.error = ApiError(code, message, hint, httpStatus);
  return result;
}

inline bool knownProvider(const String& provider) {
  return provider == "openai" || provider == "anthropic" ||
         provider == "google" || provider == "ollama";
}

inline const char* providerLabel(const String& provider) {
  if (provider == "openai") return "OpenAI";
  if (provider == "anthropic") return "Anthropic";
  if (provider == "google") return "Google Gemini";
  if (provider == "ollama") return "Ollama";
  return "Unknown provider";
}

struct ProviderModel {
  String id;
  String name;
};

struct ProviderModels {
  String provider;
  std::vector<ProviderModel> items;
  bool truncated = false;
};
