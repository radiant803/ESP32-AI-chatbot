#pragma once

#include <Arduino.h>
#include <ArduinoJson.h>
#include <FS.h>

constexpr size_t MAX_ARTIFACT_BYTES = 700 * 1024;

bool artifactsBegin();
bool artifactNameSafe(const String& name);
String artifactPath(const String& name);
String artifactTemporaryPath();
String artifactBackupPath();
String artifactMimeType(const String& name);
size_t artifactFreeBytes();
size_t artifactExistingSize(const String& name);
bool deleteArtifact(const String& name);
bool openArtifact(const String& name, File& file, String& mime);
void writeArtifactsJson(JsonObject target);
