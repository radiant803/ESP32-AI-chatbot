#include "proxy.h"

#include <memory>

#include "config_store.h"

namespace {

constexpr uint32_t CONNECT_TIMEOUT_MS = 12000;
constexpr uint32_t HEADER_TIMEOUT_MS = 90000;
constexpr uint32_t STREAM_IDLE_MS = 300000;  // high-effort reasoning can stay silent for minutes; the browser's Stop button ends it sooner
constexpr size_t CHUNK_BYTES = 512;
constexpr size_t MAX_PATH_BYTES = 400;

struct Target {
  String host;
  uint16_t port = 443;
  bool tls = true;
  String headers;  // extra request headers, each ending in CRLF
};

struct Upstream {
  std::unique_ptr<WiFiClient> client;
  bool tls = false;
  int status = -1;
  String contentType;
  String location;
};

struct Endpoint {
  const char* provider;
  const char* host;  // nullptr: taken from the stored URL
  const char* authName;
  const char* authPrefix;
  const char* extraHeaders;
  const char* const* prefixes;
};

const char* const OPENAI_PATHS[] = {"/v1/responses", "/v1/chat/completions", "/v1/models", "/v1/images/generations", nullptr};
const char* const ANTHROPIC_PATHS[] = {"/v1/messages", "/v1/models", nullptr};
const char* const GOOGLE_PATHS[] = {"/v1beta/models", nullptr};
const char* const TAVILY_PATHS[] = {"/search", nullptr};
const char* const BRAVE_PATHS[] = {"/res/v1/web/search", nullptr};
const char* const SEARX_PATHS[] = {"/search", nullptr};

const Endpoint ENDPOINTS[] = {
    {"openai", "api.openai.com", "Authorization", "Bearer ", "", OPENAI_PATHS},
    {"anthropic", "api.anthropic.com", "x-api-key", "", "anthropic-version: 2023-06-01\r\n", ANTHROPIC_PATHS},
    {"google", "generativelanguage.googleapis.com", "x-goog-api-key", "", "", GOOGLE_PATHS},
    {"tavily", "api.tavily.com", "Authorization", "Bearer ", "", TAVILY_PATHS},
    {"brave", "api.search.brave.com", "X-Subscription-Token", "", "", BRAVE_PATHS},
    {"searxng", nullptr, nullptr, "", "", SEARX_PATHS},
};

const Endpoint* endpointFor(const String& provider) {
  for (const Endpoint& e : ENDPOINTS) {
    if (provider == e.provider) return &e;
  }
  return nullptr;
}

bool pathAllowed(const Endpoint& endpoint, const String& path) {
  if (!path.length() || path.length() > MAX_PATH_BYTES || path[0] != '/' || path.indexOf("..") >= 0) return false;
  for (size_t i = 0; i < path.length(); ++i) {
    const char c = path[i];
    if (!(isalnum(c) || strchr("-_./:?&=%~,+@*", c))) return false;
  }
  for (const char* const* p = endpoint.prefixes; *p; ++p) {
    const size_t n = strlen(*p);
    if (path.startsWith(*p) && (path.length() == n || strchr("?/:", path[n]))) return true;
  }
  return false;
}

void splitUrl(const String& url, Target& target, String& basePath) {
  const bool tls = url.startsWith("https://");
  String rest = url.substring(url.indexOf("://") + 3);
  const int slash = rest.indexOf('/');
  basePath = slash >= 0 ? rest.substring(slash) : "";
  if (slash >= 0) rest = rest.substring(0, slash);
  const int colon = rest.lastIndexOf(':');
  target.tls = tls;
  target.port = tls ? 443 : 80;
  if (colon > 0) {
    target.port = rest.substring(colon + 1).toInt();
    rest = rest.substring(0, colon);
  }
  target.host = rest;
}

// credential: transient value, or empty to use the stored one.
bool buildTarget(const Endpoint& endpoint, const String& credential, Target& target, String& error) {
  String value = credential.length() ? credential : credentialFor(endpoint.provider);
  if (!value.length()) {
    error = "credential_missing";
    return false;
  }
  if (endpoint.host) {
    target.host = endpoint.host;
    target.tls = true;
    target.port = 443;
    target.headers = String(endpoint.authName) + ": " + endpoint.authPrefix + value + "\r\n" + endpoint.extraHeaders;
  } else {
    String base;
    splitUrl(value, target, base);
  }
  return true;
}

bool readLine(WiFiClient& client, String& line, uint32_t timeoutMs, const std::function<bool()>& abortWait = nullptr) {
  line = "";
  const uint32_t deadline = millis() + timeoutMs;
  while (millis() < deadline) {
    while (client.available()) {
      const int c = client.read();
      if (c < 0) break;
      if (c == '\n') {
        line.trim();
        return true;
      }
      if (line.length() < 400) line += static_cast<char>(c);
    }
    if (!client.connected() && !client.available()) return false;
    if (abortWait && abortWait()) return false;  // e.g. the browser pressed Stop: stop waiting on the provider
    delay(1);
  }
  return false;
}

std::unique_ptr<WiFiClient> makeClient(bool tls, const String& host, uint16_t port, uint16_t rxBytes = 16709) {
  if (!tls) return std::unique_ptr<WiFiClient>(new WiFiClient());
  std::unique_ptr<WiFiClientSecure> secure(new WiFiClientSecure());
  secure->setInsecure();
#if defined(ESP8266)
  // BearSSL fails the connection (error 6) when a TLS record is larger than the receive buffer, and cloud APIs send
  // records up to 16 KB (a full record needs 16384 plus 325 bytes of overhead). Use the full size when memory allows; the transmit side only ever sends small requests.
  secure->setBufferSizes(rxBytes, 512);  // 16709 = BR_SSL_BUFSIZE_INPUT: room for a maximum-size record plus its header and MAC
#endif
  return std::unique_ptr<WiFiClient>(secure.release());
}

String tlsError(Upstream& up);

// Opens the upstream connection and reads the response headers. On failure returns false and fills code/message.
bool upstreamOpen(Upstream& up, const Target& target, const char* method, const String& path, const String& body,
                  const String& extraHeaders, String& code, String& message, uint32_t headerTimeout = HEADER_TIMEOUT_MS,
                  const std::function<void()>& afterSend = nullptr, const char* bodyFile = nullptr, const std::function<bool()>& abortWait = nullptr, uint16_t rxBytes = 16709) {
  if (WiFi.status() != WL_CONNECTED) {
    code = "network_unreachable";
    message = "The device is not connected to Wi-Fi.";
    return false;
  }
#if defined(ESP8266)
  // A BearSSL session needs about 23 KB in one block (context plus the 16.7 KB receive buffer; measured: connects fail at a 22.1 KB block
  // and succeed from 22.9 KB). Fragmentation after the previous call clears within seconds, so wait for it rather than fail the request.
  const uint32_t needBlock = rxBytes + 6800, needHeap = rxBytes + 13300;  // 16709 -> 23.5 KB block / 30 KB heap
  auto memoryShort = [&]() { return halFreeHeap() < needHeap || ESP.getMaxFreeBlockSize() < needBlock; };
  if (target.tls) {
    for (uint32_t waited = 0; waited < 9000 && memoryShort(); waited += 250) {
      delay(250);
      if (abortWait && abortWait()) break;
    }
  }
  const bool tooLittle = target.tls && memoryShort();
#else
  const bool tooLittle = target.tls && halFreeHeap() < CE_MIN_HEAP_FOR_TLS;
#endif
  if (tooLittle) {
    code = "low_memory";
    message = "The device is low on memory (" + String(halFreeHeap() / 1024) + " KB free). Retry in a moment.";
#if defined(ESP8266)
    Serial.printf("[proxy] low_memory heap=%u maxblock=%u (waited)\n", (unsigned)halFreeHeap(), (unsigned)ESP.getMaxFreeBlockSize());
#endif
    return false;
  }
  const uint32_t heapBefore = halFreeHeap();
#if defined(ESP8266)
  const uint32_t blockBefore = ESP.getMaxFreeBlockSize();
#else
  const uint32_t blockBefore = 0;
#endif
  // Resolve first so a DNS failure is reported as one (and cached for the connect below), then connect; one retry covers a transient failure.
  bool connected = false;
  for (int attempt = 0; attempt < 2 && !connected; ++attempt) {
    IPAddress resolved;
    if (!WiFi.hostByName(target.host.c_str(), resolved)) {
      Serial.printf("[proxy] dns failed host=%s heap=%u\n", target.host.c_str(), (unsigned)halFreeHeap());
      code = "network_unreachable";
      message = "The device could not look up " + target.host + " (DNS failed). Check the router's DNS or Wi-Fi.";
      delay(400);
      continue;
    }
    up.client = makeClient(target.tls, target.host, target.port, rxBytes);
    up.tls = target.tls;
#if defined(ESP8266)
    up.client->setTimeout(CONNECT_TIMEOUT_MS);
    connected = up.client->connect(target.host.c_str(), target.port);
#else
    connected = up.client->connect(target.host.c_str(), target.port, CONNECT_TIMEOUT_MS);
#endif
    if (!connected) {
      const String why = target.tls ? tlsError(up) : String("tcp");
      Serial.printf("[proxy] connect failed host=%s attempt=%d before=%u/%u heap=%u block=%u err=%s\n", target.host.c_str(), attempt + 1, (unsigned)heapBefore, (unsigned)blockBefore, (unsigned)halFreeHeap(),
#if defined(ESP8266)
                    (unsigned)ESP.getMaxFreeBlockSize(),
#else
                    (unsigned)0,
#endif
                    why.c_str());
      code = "network_unreachable";
      message = "The device could not connect to " + target.host + " (" + why + ", " + String(halFreeHeap() / 1024) + " KB free).";
      up.client->stop();
      up.client.reset();
      delay(400);
    }
  }
  if (!connected) return false;
#if defined(ESP8266)
  Serial.printf("[proxy] open %s before=%u/%u after=%u\n", target.host.c_str(), (unsigned)heapBefore, (unsigned)blockBefore, (unsigned)halFreeHeap());
#endif
  // On the ESP8266 a large request body is parked in flash so it need not sit in RAM while the TLS buffers are allocated.
  File spill;
  size_t bodyLen = body.length();
  if (bodyFile) {
    spill = LittleFS.open(bodyFile, "r");
    bodyLen = spill ? spill.size() : 0;
  }
  String request;
  request.reserve(400);
  request += String(method) + " " + path + " HTTP/1.0\r\nHost: " + target.host;
  if ((target.tls && target.port != 443) || (!target.tls && target.port != 80)) request += ":" + String(target.port);
  request += "\r\nConnection: close\r\nAccept: */*\r\nAccept-Encoding: identity\r\n" + target.headers + extraHeaders;
  if (bodyLen || strcmp(method, "POST") == 0) request += "Content-Type: application/json\r\nContent-Length: " + String(bodyLen) + "\r\n";
  request += "\r\n";
  up.client->print(request);
  if (bodyFile) {
    uint8_t chunk[512];
    while (spill && spill.available()) {
      const size_t n = spill.read(chunk, sizeof(chunk));
      if (!n || up.client->write(chunk, n) != n) {
        code = "network_unreachable";
        message = "The connection dropped while sending the request.";
        return false;
      }
      yield();
    }
    spill.close();
  } else {
    for (size_t sent = 0; sent < body.length();) {
      const size_t n = min<size_t>(1024, body.length() - sent);
      if (up.client->write(reinterpret_cast<const uint8_t*>(body.c_str()) + sent, n) != n) {
        code = "network_unreachable";
        message = "The connection dropped while sending the request.";
        return false;
      }
      sent += n;
      yield();
    }
  }
  if (afterSend) afterSend();  // the request is on the wire: let the caller free what it no longer needs
  String line;
  if (!readLine(*up.client, line, headerTimeout, abortWait) || !line.startsWith("HTTP/")) {
    code = "provider_timeout";
    message = "The provider did not answer in time.";
    return false;
  }
  up.status = line.substring(line.indexOf(' ') + 1).toInt();
  while (readLine(*up.client, line, 10000) && line.length()) {
    String lower = line;
    lower.toLowerCase();
    if (lower.startsWith("content-type:")) up.contentType = line.substring(13), up.contentType.trim();
    else if (lower.startsWith("location:")) up.location = line.substring(9), up.location.trim();
  }
  return true;
}

// WiFiClient::write() may accept fewer bytes than offered when the TCP send buffer is full (common on a lossy link),
// and HttpServer::sendContent() ignores that, silently dropping data. Retry until everything is accepted.
bool writeAll(WiFiClient& client, const uint8_t* data, size_t length) {
  uint32_t lastProgress = millis();
  for (size_t sent = 0; sent < length;) {
    const size_t written = client.write(data + sent, length - sent);
    if (written) {
      sent += written;
      lastProgress = millis();
    } else {
      if (!client.connected() || millis() - lastProgress > 15000) return false;
      delay(2);
    }
  }
  return true;
}

bool writeChunk(WiFiClient& client, const uint8_t* data, size_t length) {
  char head[12];
  const int n = snprintf(head, sizeof(head), "%x\r\n", static_cast<unsigned>(length));
  return writeAll(client, reinterpret_cast<const uint8_t*>(head), n) && writeAll(client, data, length) &&
         writeAll(client, reinterpret_cast<const uint8_t*>("\r\n"), 2);
}

String tlsError(Upstream& up) {
  if (!up.tls) return String();
  char buffer[80] = "";
#if defined(ESP8266)
  const int code = static_cast<WiFiClientSecure*>(up.client.get())->getLastSSLError(buffer, sizeof(buffer));
#else
  const int code = static_cast<WiFiClientSecure*>(up.client.get())->lastError(buffer, sizeof(buffer));
#endif
  return String(code) + " " + buffer;
}

// Streams the body to the browser as a chunked response. cap = 0 means unlimited.
void upstreamStream(HttpServer& server, Upstream& up, const String& contentType, size_t cap) {
  server.setContentLength(CONTENT_LENGTH_UNKNOWN);  // makes send() announce Transfer-Encoding: chunked
  server.sendHeader("Cache-Control", "no-store");
  server.sendHeader("X-Accel-Buffering", "no");
  server.send(up.status, contentType.length() ? contentType : String("application/octet-stream"), "");
  WiFiClient browser = server.client();
  browser.setNoDelay(true);
  uint8_t buffer[CHUNK_BYTES];
  size_t total = 0;
  bool browserGone = false;
  const char* reason = "idle-timeout";
  uint32_t lastData = millis();
  uint32_t minHeap = halFreeHeap();
  while (millis() - lastData < STREAM_IDLE_MS) {
    if (halFreeHeap() < minHeap) minHeap = halFreeHeap();
    const int available = up.client->available();
    if (available > 0) {
      const int n = up.client->read(buffer, min<size_t>(available, sizeof(buffer)));
      if (n > 0) {
        size_t take = n;
        if (cap && total + take > cap) take = cap - total;
        if (!writeChunk(browser, buffer, take)) {
          browserGone = true;  // browser pressed Stop or went away: drop the upstream stream too
          reason = "browser-gone";
          break;
        }
        total += take;
        lastData = millis();
        if (cap && total >= cap) {
          reason = "cap";
          break;
        }
      }
    } else if (!up.client->connected()) {
      reason = "upstream-closed";
      break;
    } else {
      delay(2);
    }
    yield();
  }
  Serial.printf("[proxy] status=%d sent=%u end=%s tls=%s heap=%u min=%u\n", up.status, static_cast<unsigned>(total), reason, tlsError(up).c_str(), halFreeHeap(), minHeap);
  if (!browserGone) writeAll(browser, reinterpret_cast<const uint8_t*>("0\r\n\r\n"), 5);
  up.client->stop();
}

// The mDNS responder allocates when a neighbour multicasts a query (a Mac does this constantly). During a TLS stream the heap
// is only a few KB, so that allocation throws OOM and reboots the board. Stop it for the length of a proxy call; proxyIdleTick()
// brings it back only after the board has been idle with plenty of heap, so each TLS session starts with the most memory possible.
static bool g_mdnsOff = false;
static uint32_t g_lastProxyMs = 0;
struct MdnsPause {
  MdnsPause() {
#if defined(ESP8266)
    if (!g_mdnsOff) { MDNS.end(); g_mdnsOff = true; }
    g_lastProxyMs = millis();
#endif
  }
  ~MdnsPause() { g_lastProxyMs = millis(); }
};

}  // namespace

void sendApiError(HttpServer& server, int status, const char* code, const String& message, const String& hint) {
  JsonDocument doc;
  doc["ok"] = false;
  doc["error"]["code"] = code;
  doc["error"]["message"] = message;
  doc["error"]["hint"] = hint;
  String out;
  serializeJson(doc, out);
  server.send(status, "application/json; charset=utf-8", out);
}

static void upstreamFailure(HttpServer& server, const String& code, const String& message) {
  int status = 502;
  String hint = "Check Wi-Fi, the provider and the saved credential, then retry.";
  if (code == "credential_missing") {
    status = 401;
    hint = "Open Settings and use Test & Save.";
  } else if (code == "low_memory") {
    status = 503;
    hint = "Wait a few seconds, or shorten the request.";
  } else if (code == "provider_timeout") {
    status = 504;
  }
  sendApiError(server, status, code.c_str(), message, hint);
}

void handleProxy(HttpServer& server) {
  const String provider = server.header("X-CE-Provider");
  const String path = server.header("X-CE-Path");
  const String method = server.header("X-CE-Method");
  const Endpoint* endpoint = endpointFor(provider);
  if (!endpoint || !pathAllowed(*endpoint, path) || !(method == "GET" || method == "POST" || method == "")) {
    sendApiError(server, 400, "proxy_not_allowed", "That provider endpoint is not allowed.", "Use the ChatESP web app.");
    return;
  }
  const String& body = server.arg("plain");  // by reference: a copy would cost heap the TLS buffers need
  if (body.length() > CE_BODY_LIMIT) {
    sendApiError(server, 413, "request_too_large", "That request is " + String(body.length()) + " bytes; this device accepts " + String(CE_BODY_LIMIT) + ".",
                 "Shorten the conversation or attach smaller files.");
    return;
  }
  Target target;
  String code, message;
  if (!buildTarget(*endpoint, String(), target, code)) {
    upstreamFailure(server, code, "No credential is saved for " + String(providerLabel(provider)) + ".");
    return;
  }
  MdnsPause quietNetwork;
  // A non-streamed reply sends nothing until the model has finished, so the browser may ask for a longer wait (seconds, max 10 minutes).
  const long askedWait = server.header("X-CE-Timeout").toInt();
  const uint32_t headerWait = askedWait > 0 ? static_cast<uint32_t>(min<long>(askedWait, 600)) * 1000UL : HEADER_TIMEOUT_MS;
  // The app may ask for a smaller TLS receive buffer for short, buffered replies (frees ~8 KB of heap on the ESP8266).
  const long askedRx = server.header("X-CE-Rx").toInt();
  const uint16_t rxBytes = askedRx >= 4096 && askedRx < 16709 ? static_cast<uint16_t>(askedRx) : 16709;
  const char* upstreamMethod = method == "GET" ? "GET" : "POST";
  const char* spillPath = nullptr;
#if defined(ESP8266)
  // The raw body is the biggest single thing in RAM when the TLS session starts. Park it in flash, free it, and stream it from there.
  static const char* const SPILL = "/.chatesp-req.tmp";
  if (upstreamMethod[0] == 'P' && body.length() > 1200) {
    File f = LittleFS.open(SPILL, "w");
    if (f) {
      const bool ok = f.write(reinterpret_cast<const uint8_t*>(body.c_str()), body.length()) == body.length();
      f.close();
      if (ok) {
        spillPath = SPILL;
        releaseRequestBody(server);
      } else {
        LittleFS.remove(SPILL);
      }
    }
  }
#endif
  Upstream up;
  const bool opened = upstreamOpen(up, target, upstreamMethod, path, method == "GET" || spillPath ? String() : body, "", code, message, headerWait, [&server]() { releaseRequestBody(server); }, spillPath, [&server]() { return !server.client().connected(); }, rxBytes);
#if defined(ESP8266)
  if (spillPath) LittleFS.remove(spillPath);
#endif
  if (!opened) {
    upstreamFailure(server, code, message);
    return;
  }
  upstreamStream(server, up, up.contentType, 0);
}

void handleCredentialTest(HttpServer& server, const String& provider, const String& rawValue) {
  const Endpoint* endpoint = endpointFor(provider);
  String value;
  if (!endpoint || !normalizeCredential(provider, rawValue, value)) {
    sendApiError(server, 400, "credential_invalid", "That credential is not valid.",
                 providerIsUrl(provider) ? "Use a URL such as http://192.168.1.20:11434." : "Paste the key again; whitespace is removed automatically.");
    return;
  }
  Target target;
  String code, message, path = "/v1/models";
  buildTarget(*endpoint, value, target, code);
  MdnsPause quietNetwork;
  const char* method = "GET";
  String body;
  if (provider == "anthropic") path = "/v1/models?limit=100";
  else if (provider == "google") path = "/v1beta/models?pageSize=200";
  else if (provider == "ollama") path = "/api/tags";
  else if (provider == "searxng") path = "/search?q=test&format=json";
  else if (provider == "brave") path = "/res/v1/web/search?q=test&count=1";
  else if (provider == "tavily") {
    path = "/search";
    method = "POST";
    body = "{\"query\":\"test\",\"max_results\":1}";
  }
  Upstream up;
  if (!upstreamOpen(up, target, method, path, body, "", code, message, 20000)) {
    upstreamFailure(server, code, message);
    return;
  }
  upstreamStream(server, up, up.contentType, 0);
}

void handleFetchRelay(HttpServer& server) {
  MdnsPause quietNetwork;
  String url = server.arg("url");
  for (int hop = 0; hop < 4; ++hop) {
    if (!(url.startsWith("http://") || url.startsWith("https://")) || url.length() > 500 || url.indexOf(' ') >= 0) {
      sendApiError(server, 400, "fetch_url_invalid", "Only http and https URLs can be fetched.", "Check the address.");
      return;
    }
    Target target;
    String path;
    splitUrl(url, target, path);
    if (!path.length()) path = "/";
    IPAddress ip;
    if (!WiFi.hostByName(target.host.c_str(), ip) || halIsPrivateIp(ip)) {
      sendApiError(server, 403, "fetch_blocked", "That address is blocked or could not be resolved.", "ChatESP only fetches public websites.");
      return;
    }
    target.headers = "User-Agent: Mozilla/5.0 (compatible; ChatESP/2.0)\r\n";
    Upstream up;
    String code, message;
    if (!upstreamOpen(up, target, "GET", path, String(), "", code, message, 20000)) {
      upstreamFailure(server, code, message);
      return;
    }
    if (up.status >= 300 && up.status < 400 && up.location.length()) {
      up.client->stop();
      if (up.location.startsWith("http")) url = up.location;
      else if (up.location.startsWith("/")) url = String(target.tls ? "https://" : "http://") + target.host + up.location;
      else url = String(target.tls ? "https://" : "http://") + target.host + "/" + up.location;
      continue;
    }
    String type = up.contentType;
    type.toLowerCase();
    if (up.status == 200 && !(type.startsWith("text/") || type.indexOf("json") >= 0 || type.indexOf("xml") >= 0 || type.length() == 0)) {
      up.client->stop();
      sendApiError(server, 415, "fetch_unsupported", "That page is not text.", "Only text, HTML, JSON and XML pages can be read.");
      return;
    }
    upstreamStream(server, up, up.contentType.length() ? up.contentType : String("text/plain"), CE_FETCH_LIMIT);
    return;
  }
  sendApiError(server, 502, "fetch_redirects", "Too many redirects.", "Try a different source.");
}

void proxyIdleTick() {
#if defined(ESP8266)
  if (g_mdnsOff && millis() - g_lastProxyMs > 15000 && halFreeHeap() > 33000 && MDNS.begin("chatesp")) {
    MDNS.addService("http", "tcp", 80);
    g_mdnsOff = false;
  }
#endif
}
