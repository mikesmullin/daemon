#pragma once

#include "../../unity.h"

// ---
// @class Sleep
// cross-platform sleep and time utilities
//
// Function | Purpose
// --- | ---
// SleepMs(ms) | sleep for specified milliseconds (cross-platform)
// unixtime() | get current unix timestamp in seconds

// sleep for specified milliseconds (cross-platform)
DLL_EXPORT void SleepMs(u32 ms) {
#ifdef _WIN32
  Sleep(ms);
#endif

#ifdef __linux__
  struct timespec req;
  req.tv_sec = ms / 1000;
  req.tv_nsec = (ms % 1000) * 1000000;
  nanosleep(&req, NULL);
#endif

#ifdef __APPLE__
  sleep(ms / 1000);
#endif

#ifdef __EMSCRIPTEN__
  emscripten_sleep(ms);
#endif
}

// get current unix timestamp (in seconds)
s64 unixtime(void) {
  time_t now = time(NULL);
  if (now == (time_t)-1) {
    return 0;  // Error case
  }
  return now;
}