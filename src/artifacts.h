#pragma once

#include <Arduino.h>
#include <FS.h>

constexpr size_t MAX_ARTIFACT_BYTES = 700 * 1024;

bool artifactsBegin();
String artifactsListJson();
bool artifactNameSafe(const String& name);
bool saveArtifact(const String& name, const String& mime, const uint8_t* data, size_t length);
bool deleteArtifact(const String& name);
bool openArtifact(const String& name, File& file, String& mime);
String artifactPath(const String& name);
