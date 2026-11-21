#include <Arduino.h>

#include "artifacts.h"
#include "config_store.h"
#include "hal.h"
#include "proxy.h"
#include "http_api.h"

// Optional compile-time Wi-Fi fallback. Prefer provisioning from the web app (Settings -> Device).
#if __has_include("secrets.h")
#include "secrets.h"
#define CE_HAS_SECRETS 1
#endif

namespace {

constexpr const char* SETUP_AP_SSID = "ChatESP-Setup";
constexpr const char* SETUP_AP_PASSWORD = "chatesp-setup";  // printed on the serial console at boot
constexpr uint32_t WIFI_CONNECT_WINDOW_MS = 15000;
constexpr uint32_t WIFI_RECONNECT_INTERVAL_MS = 15000;

HttpServer server(80);
uint32_t lastReconnect = 0;
bool apOn = false;
uint32_t stateSince = 0;  // when the station link last changed between up and down

// The recovery AP shares the radio with the station link and hurts throughput, so it only runs while
// the device is not on a home network (and returns automatically if that link is lost).
void startAp() {
  WiFi.mode(WIFI_AP_STA);
  WiFi.softAPConfig(IPAddress(192, 168, 4, 1), IPAddress(192, 168, 4, 1), IPAddress(255, 255, 255, 0));
  WiFi.softAP(SETUP_AP_SSID, SETUP_AP_PASSWORD);
  apOn = true;
}
void stopAp() {
  WiFi.softAPdisconnect(true);
  WiFi.mode(WIFI_STA);
  apOn = false;
}

void connectStation() {
  String ssid = cfgGet("wifi_ssid"), pass = cfgGet("wifi_pass");
#if defined(CE_HAS_SECRETS)
  if (!ssid.length()) {
    ssid = WIFI_SSID;
    pass = WIFI_PASSWORD;
  }
#endif
  if (!ssid.length()) return;
  WiFi.begin(ssid.c_str(), pass.c_str());
  const uint32_t started = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - started < WIFI_CONNECT_WINDOW_MS) delay(250);
}

void startNetwork() {
  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  // Modem sleep adds ~2 s of latency per request and stalls large transfers.
#if defined(ESP32)
  WiFi.setSleep(false);
#else
  WiFi.setSleepMode(WIFI_NONE_SLEEP);
#endif
  WiFi.hostname("chatesp");
  startAp();
  connectStation();
  if (WiFi.status() == WL_CONNECTED) stopAp();
  stateSince = millis();
  Serial.println();
  if (apOn) Serial.printf("ChatESP setup network: %s (password %s) at http://%s/\n", SETUP_AP_SSID, SETUP_AP_PASSWORD, WiFi.softAPIP().toString().c_str());
  if (WiFi.status() == WL_CONNECTED) Serial.printf("ChatESP LAN URL: http://%s/  or  http://chatesp.local/\n", WiFi.localIP().toString().c_str());
  else Serial.println("Not connected to a Wi-Fi network yet; join the setup network and open Settings -> Device.");
}

}  // namespace

void setup() {
  Serial.begin(115200);
  delay(250);
  Serial.printf("\nChatESP %s on %s\n", CE_VERSION, CE_CHIP);
  if (!configBegin()) Serial.println("Configuration storage unavailable");
  if (!artifactsBegin()) Serial.println("LittleFS mount failed (run uploadfs)");
  startNetwork();
  if (MDNS.begin("chatesp")) MDNS.addService("http", "tcp", 80);
  registerApiRoutes(server);
  server.begin();
  Serial.printf("HTTP server ready, %u bytes free heap\n", halFreeHeap());
}

void loop() {
  server.handleClient();
#if defined(ESP8266)
  MDNS.update();
  proxyIdleTick();
#endif
  if (g_wifiChanged) {
    g_wifiChanged = false;
    delay(300);  // let the HTTP response flush
    WiFi.disconnect();
    connectStation();
  }
  if (g_restartAt && static_cast<int32_t>(millis() - g_restartAt) >= 0) halRestart();
  const bool up = WiFi.status() == WL_CONNECTED;
  static bool wasUp = false;
  if (up != wasUp) {
    wasUp = up;
    stateSince = millis();
  }
  if (up && apOn && millis() - stateSince > 5000) stopAp();
  if (!up && !apOn && millis() - stateSince > 20000) startAp();
  if (!up && millis() - lastReconnect >= WIFI_RECONNECT_INTERVAL_MS) {
    lastReconnect = millis();
    WiFi.reconnect();
  }
  delay(2);
}
