#pragma once

#include "../../unity.h"  // IWYU pragma: keep

// ---
// @class Time
// time unit conversions and elapsed calculations
//
// Function | Purpose
// --- | ---
// Time__sec2ms(sec) | Convert seconds to milliseconds
// Time__ms2sec(ms) | Convert milliseconds to seconds
// Time__since(ms) | Milliseconds elapsed since timestamp
//
// @class Timer (T)
// pausable wall-clock timer based on past time
//
// Function | Purpose
// --- | ---
// T_paused(t) | Check if timer is paused
// T_cancel(t) | Cancel timer early
// T_canceled(t) | Check if timer is canceled
// T_began(t) | Check if timer started
// T_complete(t) | Complete timer immediately
// T_ended(t, duration) | Check if timer ended
// T_completed(t, duration) | Check if timer completed successfully
// T_rdy(t, duration) | Check if timer ready or ended
// T_busy(t, duration) | Check if timer still running
// T_ms(t) | Get elapsed milliseconds
// T_remain(t, duration) | Get remaining milliseconds
// T_sec(t) | Get elapsed seconds
// T_pct(t, duration) | Get elapsed progress percentage
// T_lerp(t, duration, a, b) | Map progress to range a..b
// T_play(t) | Start or restart timer
// T_pause(t) | Pause timer and store elapsed
// T_resume(t) | Resume timer from elapsed
//
// @class Cooldown (CD)
// non-pausable timer based on future wall-clock time
//
// Function | Purpose
// --- | ---
// CD_cancel(cd) | Cancel cooldown early
// CD_canceled(cd) | Check if cooldown canceled
// CD_complete(cd) | Complete cooldown immediately
// CD_ended(cd) | Check if cooldown ended
// CD_completed(cd) | Check if cooldown completed successfully
// CD_rdy(cd) | Check if cooldown ready or ended
// CD_busy(cd) | Check if cooldown still cooling
// CD_remain(cd) | Remaining milliseconds
// CD_remainS(cd) | Remaining seconds
// CD_ms(cd, duration) | Elapsed milliseconds
// CD_sec(cd, duration) | Elapsed seconds
// CD_pct(t, duration) | Elapsed progress percentage
// CD_lerp(t, duration, a, b) | Map progress to range a..b
// CD_play(t, duration) | Set cooldown to expire after duration
// CD_playS(t, duration) | Set cooldown by seconds duration
// CD_rdy_set(t, duration) | If ready, start and report true

// ---
// Time

static inline f32 Time__sec2ms(f32 sec) {
  return sec * 1000.0f;
}

static inline f32 Time__ms2sec(u32 ms) {
  return ms / 1000.0f;
}

static inline u32 Time__since(u32 ms) {
  return _G->now - ms;
}

// --
// @class Timer (T)
// based on past wall-clock time (individually pausable, not paused w/ engine)

// is timer paused?
static inline bool T_paused(Timer t) {
  return TIMER_PAUSE_MASK == (t & TIMER_PAUSE_MASK);
}

// abort early (considered uncompleted)
static inline void T_cancel(Timer* t) {
  *t = 0;
}

// canceled (or never started)?
static inline bool T_canceled(const Timer t) {
  return 0 == t;
}

// began (not canceled)
static inline bool T_began(const Timer t) {
  return !T_canceled(t);
}

// force to end immediately (considered completed)
static inline void T_complete(Timer* t) {
  *t = 2;
}

// ended (canceled or completed, but not paused)?
static inline bool T_ended(const Timer t, u32 duration) {
  return !T_paused(t) && t + duration < _G->now;
}

// completed successfully?
static inline bool T_completed(const Timer t, u32 duration) {
  return T_ended(t, duration) && !T_canceled(t);
}

// a) never started, b) was cancelled, or c) completed successfully ?
static inline bool T_rdy(const Timer t, u32 duration) {
  return T_canceled(t) || T_ended(t, duration);
}

// still ticking?
static inline bool T_busy(const Timer t, u32 duration) {
  return !T_rdy(t, duration);
}

// elapsed in ms (permitted to exceed duration)
static inline u32 T_ms(const Timer t) {
  if (T_paused(t)) {
    u32 ms = t ^ TIMER_PAUSE_MASK;
    return ms;
  }
  return T_canceled(t) ? 0 : _G->now - t;
}

// remaining in ms (clamped >= 0)
static inline u32 T_remain(const Timer t, u32 duration) {
  f32 elapsed = T_ms(t);
  return T_canceled(t) || elapsed > duration ? 0 : duration - elapsed;
}

// elapsed in sec
static inline f32 T_sec(const Timer t) {
  return Time__ms2sec(T_ms(t));
}

// elapsed as progress percentage
f32 T_pct(const Timer t, u32 duration) {
  // clang-format off
  if (0 == duration) return 0.0f;  // avoid div/0
  if (T_completed(t, duration)) return 1.0f;  // completed
  // clang-format on
  return T_ms(t) / (f32)duration;
}

// map progress to range a..b
static inline f32 T_lerp(const Timer t, u32 duration, f32 a, f32 b) {
  return lerp(T_pct(t, duration), a, b);
}

// reset beginning (in ms)
static inline void T_play(Timer* t) {
  *t = _G->now;
}

// mark paused, store elapsed time
static inline void T_pause(Timer* t) {
  u32 ms = T_ms(*t);
  *t = (ms | TIMER_PAUSE_MASK);
}

// resume playback from last elapsed
static inline void T_resume(Timer* t) {
  if (T_paused(*t)) {
    u32 elapsed = *t ^ TIMER_PAUSE_MASK;
    u32 adjusted = _G->now - elapsed;
    *t = adjusted;
  }
}

// --
// @class Cooldown (CD)
// based on future wall-clock time (not pausable)

// abort early (considered uncompleted)
static inline void CD_cancel(Cooldown* cd) {
  *cd = 0;
}

// canceled (or never started)?
static inline bool CD_canceled(const Cooldown cd) {
  return 0 == cd;
}

// force to end immediately (considered completed)
static inline void CD_complete(Cooldown* cd) {
  *cd = _G->now - 1;
}

// ended (canceled or completed)?
static inline bool CD_ended(const Cooldown cd) {
  return cd < _G->now;
}

// completed successfully?
static inline bool CD_completed(const Cooldown cd) {
  return CD_ended(cd) && !CD_canceled(cd);
}

// a) never started, b) was cancelled, or c) completed successfully ?
static inline bool CD_rdy(const Cooldown cd) {
  return CD_canceled(cd) || CD_ended(cd);
}

// still ticking?
static inline bool CD_busy(const Cooldown cd) {
  return !CD_rdy(cd);
}

// remaining in ms
static inline u32 CD_remain(const Cooldown cd) {
  return CD_ended(cd) ? 0 : cd - _G->now;
}

// remaining in sec
static inline f32 CD_remainS(const Cooldown cd) {
  return Time__ms2sec(CD_remain(cd));
}

// elapsed in ms
static inline u32 CD_ms(const Cooldown cd, u32 duration) {
  u32 r = CD_remain(cd);
  return CD_canceled(cd) || r > duration ? 0 : duration - r;
}

// elapsed in sec
static inline f32 CD_sec(const Cooldown cd, u32 duration) {
  return Time__ms2sec(CD_ms(cd, duration));
}

// elapsed as progress percentage
f32 CD_pct(const Cooldown t, u32 duration) {
  // clang-format off
  if (0 == duration) return 0.0f;  // avoid div/0
  if (CD_completed(t)) return 1.0f;  // completed
  // clang-format on
  return (CD_ms(t, duration) / (f32)duration);
}

// map progress to range a..b
static inline f32 CD_lerp(const Cooldown t, u32 duration, f32 a, f32 b) {
  return lerp(CD_pct(t, duration), a, b);
}

// reset beginning (in ms)
static inline void CD_play(Cooldown* t, s32 duration) {
  *t = _G->now + duration;
}

// reset beginning (in sec)
static inline void CD_playS(Cooldown* t, f32 duration) {
  CD_play(t, Time__sec2ms(duration));
}

// if ready, set again. (ie. Cooldown timer)
// @return isReady - false while waiting, true on the reset frame.
static inline bool CD_rdy_set(Cooldown* t, u32 duration) {
  if (CD_rdy(*t)) {
    CD_play(t, duration);  // in ms
    return true;
  }
  return false;
}