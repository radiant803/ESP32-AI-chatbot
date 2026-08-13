#include <Arduino.h>
#include <WebServer.h>
#include <WiFi.h>

#include "artifacts.h"
#include "config_store.h"
#include "http_api.h"
#include "secrets.h"
#include "web_ui.h"

namespace {

constexpr const char* SETUP_AP_SSID = "ChatESP-Setup";
constexpr uint32_t WIFI_CONNECT_WINDOW_MS = 15000;
constexpr uint32_t WIFI_RECONNECT_INTERVAL_MS = 15000;

WebServer server(80);
uint32_t lastReconnectAttempt = 0;
volatile bool rebindHttpServer = false;

void printNetworkAddresses() {
  Serial.println();
  Serial.print("ChatESP setup URL: http://");
  Serial.println(WiFi.softAPIP());
  if (WiFi.status() == WL_CONNECTED) {
    Serial.print("ChatESP LAN URL: http://");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println("ChatESP station Wi-Fi is still connecting; use the setup URL if needed.");
  }
}

void startNetwork() {
  WiFi.mode(WIFI_AP_STA);
  WiFi.setAutoReconnect(true);
  WiFi.setSleep(false);

  const IPAddress apIp(192, 168, 4, 1);
  const IPAddress gateway(192, 168, 4, 1);
  const IPAddress mask(255, 255, 255, 0);
  WiFi.softAPConfig(apIp, gateway, mask);
  WiFi.softAP(SETUP_AP_SSID, WIFI_PASSWORD);
  WiFi.onEvent([](WiFiEvent_t event, WiFiEventInfo_t) {
    if (event == ARDUINO_EVENT_WIFI_STA_GOT_IP) rebindHttpServer = true;
  });
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  const uint32_t startedAt = millis();
  while (WiFi.status() != WL_CONNECTED &&
         millis() - startedAt < WIFI_CONNECT_WINDOW_MS) {
    delay(250);
  }
  printNetworkAddresses();
}

void handleRoot() {
  server.send_P(200, "text/html; charset=utf-8", CHAT_ESP_HTML);
}

}  // namespace

void setup() {
  Serial.begin(115200);
  delay(250);
  Serial.println("ChatESP 2.0 starting");

  if (!configStoreBegin()) Serial.println("NVS configuration unavailable");
  if (!artifactsBegin()) Serial.println("LittleFS mount failed");
  startNetwork();

  server.on("/", HTTP_GET, handleRoot);
  server.on("/favicon.ico", HTTP_GET, []() { server.send(204); });
  registerApiRoutes(server);
  server.begin();
  rebindHttpServer = false;
  Serial.println("ChatESP HTTP server started");
}

void loop() {
  if (rebindHttpServer) {
    rebindHttpServer = false;
    // Renew the TCP listener after DHCP assigns or renews the station address.
    // This keeps the web UI available on the home LAN as well as the setup AP.
    server.stop();
    delay(20);
    server.begin();
    printNetworkAddresses();
  }
  server.handleClient();
  if (WiFi.status() != WL_CONNECTED &&
      millis() - lastReconnectAttempt >= WIFI_RECONNECT_INTERVAL_MS) {
    lastReconnectAttempt = millis();
    WiFi.reconnect();
  }
  // Leave time for the Wi-Fi and TCP/IP tasks between synchronous requests.
  delay(2);
}
