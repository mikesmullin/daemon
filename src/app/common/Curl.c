#pragma once

#include <string.h>

#include "../../unity.h"

// ---
// @class Curl
// libcurl wrapper for HTTP requests (blocking, single-threaded)
//
// Function | Purpose
// --- | ---
// Curl__init() | initialize libcurl globally
// Curl__shutdown() | clean up libcurl global resources
// Curl__data() | get pointer to curl response data (from curlArena)
// Curl__reset() | reset curlArena for next request

void Curl__init() {
  curl_global_init(CURL_GLOBAL_DEFAULT);
}

void Curl__shutdown() {
  curl_global_cleanup();
}

// Curl write callback using _G->curlArena
// The arena is reset before each request via Curl__reset()
static size_t _Curl__write_callback(void* contents, size_t size, size_t nmemb, void* userp) {
  (void)userp;  // unused - we use _G->curlArena directly
  size_t realsize = size * nmemb;

  ASSERT_CONTEXT(
      Arena__remain(_G->curlArena) >= realsize + 1,
      "curlArena overflow: need %zu, have %u",
      realsize + 1,
      Arena__remain(_G->curlArena));

  // Push data to arena
  char* dest = (char*)Arena__Push(_G->curlArena, realsize);
  memcpy(dest, contents, realsize);

  // Null-terminate (push 1 more byte)
  char* term = (char*)Arena__Push(_G->curlArena, 1);
  *term = '\0';

  return realsize;
}

// Get pointer to beginning of curl response data
static inline char* Curl__data(void) {
  return (char*)_G->curlArena->buf;
}

// Get size of curl response data
static inline u32 Curl__size(void) {
  return Arena__used(_G->curlArena);
}

// Reset curlArena before a new request
static inline void Curl__reset(void) {
  Arena__Reset(_G->curlArena);
}