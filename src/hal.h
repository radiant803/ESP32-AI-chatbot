#pragma once
// Thin hardware abstraction so the same firmware builds for ESP32 and ESP8266.

#include <Arduino.h>
#include <ArduinoJson.h>
#include <LittleFS.h>
#include <functional>

#if defined(ESP32)
#include <ESPmDNS.h>
#include <Update.h>
#include <WebServer.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
using HttpServer = WebServer;
constexpr const char* CE_CHIP = "ESP32";
// Largest request body accepted by /api/proxy. Bounded by free heap during TLS (~40 KB for the session).
constexpr size_t CE_BODY_LIMIT = 40000;
constexpr size_t CE_FETCH_LIMIT = 120000;
constexpr uint32_t CE_MIN_HEAP_FOR_TLS = 70000;
#elif defined(ESP8266)
#include <ESP8266WebServer.h>
#include <ESP8266WiFi.h>
#include <ESP8266mDNS.h>
#include <Updater.h>
#include <WiFiClientSecure.h>
using HttpServer = ESP8266WebServer;
constexpr const char* CE_CHIP = "ESP8266";
constexpr size_t CE_BODY_LIMIT = 6000;
constexpr size_t CE_FETCH_LIMIT = 16000;
constexpr uint32_t CE_MIN_HEAP_FOR_TLS = 30000;
#else
#error "ChatESP supports ESP32 and ESP8266 only"
#endif

constexpr const char* CE_VERSION = "2.0.0";
constexpr size_t CE_MAX_ARTIFACT_BYTES = 700 * 1024;

uint32_t halFreeHeap();
uint32_t halMinHeap();
int halCores();
size_t halFsTotal();
size_t halFsUsed();
bool halFsBegin();
bool halIsPrivateIp(const IPAddress& ip);
void halRestart();
// Calls fn(name, size) for each regular file in dir (non-recursive).
void halListDir(const char* dir, const std::function<void(const String&, size_t)>& fn);
