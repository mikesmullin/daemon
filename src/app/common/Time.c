#pragma once

#include "../../unity.h"  // IWYU pragma: keep

// ---
// @class Time (stm)
// cross-platform high-resolution timing
//
// Function | Purpose
// --- | ---
// stm_setup() | initialize timing subsystem for current platform
// stm_now() | return elapsed nanoseconds since stm_setup
// stm_ms(ticks) | convert nanosecond ticks to milliseconds
// stm_sec(ticks) | convert nanosecond ticks to seconds

typedef struct {
  u32 initialized;
#if defined(_WIN32)
  LARGE_INTEGER freq;
  LARGE_INTEGER start;
#elif defined(__APPLE__) && defined(__MACH__)
  mach_timebase_info_data_t timebase;
  u64 start;
#elif defined(__EMSCRIPTEN__)
  double start;
#else
  u64 start;
#endif
} stm_state_t;

static stm_state_t _stm;

#if defined(_WIN32) || (defined(__APPLE__) && defined(__MACH__))
static int64_t _stm_int64_muldiv(int64_t value, int64_t numer, int64_t denom) {
  int64_t q = value / denom;
  int64_t r = value % denom;
  return q * numer + r * numer / denom;
}
#endif

void stm_setup(void) {
  memset(&_stm, 0, sizeof(_stm));
  _stm.initialized = 0xABCDABCD;
#if defined(_WIN32)
  QueryPerformanceFrequency(&_stm.freq);
  QueryPerformanceCounter(&_stm.start);
#elif defined(__APPLE__) && defined(__MACH__)
  mach_timebase_info(&_stm.timebase);
  _stm.start = mach_absolute_time();
#elif defined(__EMSCRIPTEN__)
  _stm.start = emscripten_get_now();
#else
  struct timespec ts;
  clock_gettime(CLOCK_MONOTONIC, &ts);
  _stm.start = (u64)ts.tv_sec * 1000000000 + (u64)ts.tv_nsec;
#endif
}

u64 stm_now(void) {
#if defined(_WIN32)
  LARGE_INTEGER qpc_t;
  QueryPerformanceCounter(&qpc_t);
  return (
      u64)_stm_int64_muldiv(qpc_t.QuadPart - _stm.start.QuadPart, 1000000000, _stm.freq.QuadPart);
#elif defined(__APPLE__) && defined(__MACH__)
  const u64 mach_now = mach_absolute_time() - _stm.start;
  return (u64)_stm_int64_muldiv(
      (int64_t)mach_now,
      (int64_t)_stm.timebase.numer,
      (int64_t)_stm.timebase.denom);
#elif defined(__EMSCRIPTEN__)
  return (u64)((emscripten_get_now() - _stm.start) * 1000000.0);
#else
  struct timespec ts;
  clock_gettime(CLOCK_MONOTONIC, &ts);
  return ((u64)ts.tv_sec * 1000000000 + (u64)ts.tv_nsec) - _stm.start;
#endif
}

double stm_ms(u64 ticks) {
  return (double)ticks / 1000000.0;
}

double stm_sec(u64 ticks) {
  return (double)ticks / 1000000000.0;
}
