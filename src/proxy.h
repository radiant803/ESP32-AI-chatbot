#pragma once

#include "hal.h"

// Sends the shared {ok:false,error:{code,message,hint}} envelope.
void sendApiError(HttpServer& server, int status, const char* code, const String& message, const String& hint);

// POST /api/proxy: forwards the request body to an allow-listed provider endpoint with the stored
// credential and streams the upstream response back unchanged.
void handleProxy(HttpServer& server);

// POST /api/providers/test: same as a models/ping request but with a transient credential, never stored.
void handleCredentialTest(HttpServer& server, const String& provider, const String& rawValue);

// GET /api/fetch?url=...: public web page relay for research mode (blocks private addresses).
void handleFetchRelay(HttpServer& server);
