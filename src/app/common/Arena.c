#pragma once

#include "../../unity.h"  // IWYU pragma: keep

// ---
// @class Arena
// region-based memory allocator with bump allocation
//
// Function | Purpose
// --- | ---
// Arena__Alloc(sz) | allocate arena with given byte capacity
// Arena__AllocZ(sz) | allocate arena and zero-initialize
// Arena__Zero(arena) | zero entire arena buffer (slow)
// Arena__ZeroRange(p, sz) | zero specific memory range (slow)
// Arena__cap(a) | return arena capacity in bytes
// Arena__used(a) | return arena used bytes
// Arena__remain(a) | return arena remaining bytes
// Arena__ptr(arena, ptr) | check if pointer is within arena bounds
// Arena__Push(a, sz) | allocate sz bytes from arena, return pointer
// Arena__SubAlloc(a, sz) | allocate sub-arena from parent arena
// Arena__PushZero(a, sz) | allocate sz bytes and zero-fill
// Arena__Free(a) | free arena backing memory
// Arena__Reset(a) | reset arena position to beginning
//
// db_used(arena, round) | debug: format used bytes as string
// db_cap(arena, round) | debug: format capacity as string

Arena* Arena__Alloc(u64 sz) {
  Arena* a = (Arena*)malloc(sizeof(Arena));
  // LOG_DEBUGF("arena malloc %llu", sz);
  u8* p = (u8*)malloc(sz);
  // LOG_DEBUGF("arena p %p", p);
  ASSERT_CONTEXT(NULL != p, "Arena malloc request rejected by OS.");
  a->buf = p;
  a->pos = p;
  a->end = p + sz;
  return a;
}

// zero a whole arena
// WARN: memset() is VERY SLOW!
void Arena__Zero(Arena* arena) {
  memset(arena->buf, 0, arena->end - arena->buf);
}

// alloc + zero-init
/*inline*/ Arena* Arena__AllocZ(u64 sz) {
  Arena* a = Arena__Alloc(sz);
  Arena__Zero(a);
  return a;
}

// zero an individual var (ie. for reuse)
// WARN: memset() is VERY SLOW!
void Arena__ZeroRange(u8* p, u64 sz) {
  memset(p, 0, sz);
}

/*inline*/ u32 Arena__cap(Arena* a) {
  return a->end - a->buf;  // bytes
}

/*inline*/ u32 Arena__used(Arena* a) {
  return a->pos - a->buf;  // bytes
}

/*inline*/ u32 Arena__remain(Arena* a) {
  return a->end - a->pos;  // bytes
}

// debug helpers

const char* db_used(Arena* arena, bool round) {
  return format_bytes(Arena__used(arena), round);
}

const char* db_cap(Arena* arena, bool round) {
  return format_bytes(Arena__cap(arena), round);
}

// is pointer inside arena space? (prevent segfault)
inline bool Arena__ptr(Arena* arena, void* ptr) {
  return Math__between((void*)arena->buf, (void*)ptr, (void*)arena->end);
}

static inline u8* _Arena__align_forward(u8* p, size_t alignBytes) {
  uintptr_t addr = (uintptr_t)p;
  uintptr_t aligned = (addr + (alignBytes - 1)) & ~(alignBytes - 1);
  return (u8*)aligned;
}

void* Arena__Push(Arena* a, u64 sz) {
  // align arena position to next byte boundary
  // this is required because not doing so creates undefined behavior
  // ie. during lookup, when casting void* to a struct
  u8* r = a->pos;
  a->pos = _Arena__align_forward(a->pos, 1);
  // LOG_DEBUGF("Arena__Push %llu before %p aligned %p", sz, r, r == a->pos ? 0 : a->pos);

  char x[16], y[16], z[16], w[16];
  ASSERT_CONTEXT(
      a->pos + sz < a->end,
      "Arena exhausted. buf: %p, pos: %p, end: %p, "
      "cap: %s, used: %s, ask_sz: %s, remain: %s",
      a->buf,
      a->pos,
      a->end,
      _format_bytes(x, Arena__cap(a), false),
      _format_bytes(y, Arena__used(a), false),
      _format_bytes(z, sz, false),
      _format_bytes(w, Arena__remain(a), false));

  // memset(a->pos, 0, sz);  // zero-fill (slow!)

  r = a->pos;
  a->pos += sz;
  return r;
}

Arena* Arena__SubAlloc(Arena* a, u64 sz) {
  Arena* sa = (Arena*)Arena__Push(a, sizeof(Arena));
  sa->buf = (u8*)Arena__Push(a, sz);
  sa->pos = sa->buf;
  sa->end = sa->buf + sz;
  return sa;
}

void* Arena__PushZero(Arena* a, u64 sz) {
  u8* p = (u8*)Arena__Push(a, sz);
  memset(p, 0, sz);
  return p;
}

void Arena__Free(Arena* a) {
  free(a->buf);
}

void Arena__Reset(Arena* a) {
  a->pos = a->buf;
}