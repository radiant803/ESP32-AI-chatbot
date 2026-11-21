#pragma once

#include "hal.h"

// Set by API handlers; consumed by main.cpp's loop.
extern volatile bool g_wifiChanged;
extern volatile uint32_t g_restartAt;

void registerApiRoutes(HttpServer& server);
