#pragma once

#include "../../unity.h"

// ---
// @class RingBuffer (RB)
// data structure utilized heavily by the network stack
// NOTE: A RingBuffer that doesn't wrap is a valid Buffer.
// see: `ai/docs/NET_PROTO.md`
//
// Function | Purpose
// --- | ---
// RB_Reset(rb) | move pointers to 0
// RB_Zero(rb) | fill data with zeros
// RB_Alloc(arena, rb, sz) | allocate new ring buffer
// RB_Empty(rb) | true if there are exactly zero valid items
// RB_Full(rb) | true if every slot is occupied with a valid value
// RB_Used(rb) | count of used bytes in the buffer
// RB_Unused(rb) | count of unused bytes (available for writing)
// RB_Index(rb, offset) | convert offset to index
// RB_Ptr(rb, offset) | convert offset to pointer
// RB_Pop(rb, dst, dst_len, read_len, out) | read from head, move head backward
// RB_Clone(dst_io, src) | mirror/overwrite dst buffer with src buffer
// RB_Copy(dst_io, src) | copy from src to dst (all-or-nothing)
// RB_Print(rb, prefix, len) | print each byte in hex (zero-padded)
// RB_Equal(rb, needle, len) | compare buffer contents with needle string
//
// RB_Push(io, src, src_len) | append to end/head, advance head
// RB_Shift(io, dst, read_len) | remove from beginning/tail, advance tail
// RB_Peek(io, dst, peek_len) | read without advancing tail
// RB_Seek(io, offset) | advance read cursor without reading
// RB_Unshift(io, src, src_len) | prepend data before tail

// move pointers to 0
void RB_Reset(RingBuffer* rb) {
  rb->head = rb->tail = 0;
}

// fill data with zeros
void RB_Zero(RingBuffer* rb) {
  RB_Reset(rb);
  memset(rb->data, 0, rb->sz);
}

// allocate new ring buffer
void RB_Alloc(Arena* arena, RingBuffer* rb, u16 sz) {
  rb->data = (u8*)Arena__Push(arena, sz);
  RB_Reset(rb);
  rb->sz = sz;
}

// true if there are exactly zero valid items
bool RB_Empty(RingBuffer* rb) {
  return rb->head == rb->tail;
}

// true if every slot is occupied with a valid value
bool RB_Full(RingBuffer* rb) {
  // NOTE: to disambiguate empty/full state, head is only allowed to decrement onto tail, not increment onto it
  return (rb->head + 1) % rb->sz == rb->tail;
}

// count of used bytes in the buffer
u16 RB_Used(RingBuffer* rb) {
  if (rb->head >= rb->tail) {
    return rb->head - rb->tail;
  }
  return rb->sz - rb->tail + rb->head;
}

// count of unused bytes in the buffer (available for writing)
u16 RB_Unused(RingBuffer* rb) {
  return rb->sz - RB_Used(rb) - 1;  // -1 to maintain full/empty distinction
}

// copy from ring buffer at position, handling wrap-around
static void _RingBuffer__cp_out(RingBuffer* rb, u16 pos, u8* dst, u16 len) {
  u16 pos_to_end = rb->sz - pos;
  if (len <= pos_to_end) {
    memcpy(dst, rb->data + pos, len);
  } else {
    memcpy(dst, rb->data + pos, pos_to_end);
    memcpy(dst + pos_to_end, rb->data, len - pos_to_end);
  }
}

// copy into ring buffer at position, handling wrap-around
static void _RingBuffer__cp_in(RingBuffer* rb, u16 pos, const u8* src, u16 len) {
  u16 pos_to_end = rb->sz - pos;
  if (len <= pos_to_end) {
    memcpy(rb->data + pos, src, len);
  } else {
    memcpy(rb->data + pos, src, pos_to_end);
    memcpy(rb->data, src + pos_to_end, len - pos_to_end);
  }
}

// convert offset to index
u16 RB_Index(RingBuffer* rb, u16 offset) {
  return (rb->tail + offset) % rb->sz;
}

// convert offset to pointer
u8* RB_Ptr(RingBuffer* rb, u16 offset) {
  u16 index = RB_Index(rb, offset);
  u8* ptr = &rb->data[index];
  return ptr;
}

// Pop (remove from end/head) - read data from just before head, move head backward
// Similar to Array.pop() and memcpy_s: validates data, copies data, moves head backward
// Sets *out to bytes read (or -1 on error)
void RB_Pop(RingBuffer* rb, u8* dst, u16 dst_len, u16 read_len, s32* out) {
  if (!dst || read_len == 0) {
    *out = 0;
    return;
  }

  u16 used = RB_Used(rb);
  if (read_len > used || read_len > dst_len) {
    *out = -1;  // not enough data or dst buffer too small
    return;
  }

  rb->head = (rb->head - read_len + rb->sz) % rb->sz;
  _RingBuffer__cp_out(rb, rb->head, dst, read_len);
  *out = read_len;
}

// mirror/overwrite dst buffer with src buffer (preserving dst->sz)
void RB_Clone(IO* dst_io, RingBuffer* src) {
  if (!dst_io || dst_io->err)
    return;

  u16 used = RB_Used(src);
  if (used == 0)
    return;

  RingBuffer* dst = dst_io->buf;
  if (src->sz > dst->sz) {
    dst_io->err = -1;
    return;
  }

  memcpy(dst->data, src->data, src->sz);
  dst->head = src->head;
  dst->tail = src->tail;
  dst_io->written += used;
}

// copy from src to dst (all-or-nothing), only if there is room
void RB_Copy(IO* dst_io, RingBuffer* src) {
  if (!dst_io || dst_io->err)
    return;

  u16 used = RB_Used(src);
  if (used == 0)
    return;

  RingBuffer* dst = dst_io->buf;
  if (used > RB_Unused(dst)) {
    dst_io->err = -1;
    return;
  }

  if (src->head >= src->tail) {
    _RingBuffer__cp_in(dst, dst->head, src->data + src->tail, used);
  } else {
    u16 first_part = src->sz - src->tail;
    _RingBuffer__cp_in(dst, dst->head, src->data + src->tail, first_part);
    _RingBuffer__cp_in(dst, (dst->head + first_part) % dst->sz, src->data, src->head);
  }

  dst->head = (dst->head + used) % dst->sz;
  dst_io->written += used;
}

// print each byte in hex (zero-padded)
void RB_Print(RingBuffer* rb, const char* prefix, u16 len) {
  LOG_TRACE;
  if (0 == len) {
    len = RB_Used(rb);
  }
  if (len == 0 || len > RB_Used(rb)) {
    LOG_DEBUGF(
        "%s. len: %u, head: %u, tail: %u, sz: %u, used: %u, data: (empty)",
        prefix,
        len,
        rb->head,
        rb->tail,
        rb->sz,
        RB_Used(rb));
    return;
  }

  u8 temp[len];
  char debug[4096];  // hex output is roughly 4 chars per byte

  _RingBuffer__cp_out(rb, rb->tail, temp, len);
  hexdump(temp, len, debug, sizeof(debug));

  LOG_DEBUGF(
      "%s. len: %u, head: %u, tail: %u, sz: %u, used: %u, data:\n%s",
      prefix,
      len,
      rb->head,
      rb->tail,
      rb->sz,
      RB_Used(rb),
      debug);
}

bool RB_Equal(RingBuffer* rb, const char* needle, const u16 len) {
  if (RB_Used(rb) < len)
    return false;  // not enough data to compare

  u8 temp[len];
  _RingBuffer__cp_out(rb, rb->tail, temp, len);
  return 0 == strncmp((char*)temp, needle, len);
}

// Push (append to end/head) - write data at head and advance head
void RB_Push(IO* io, const u8* src, u16 src_len) {
  if (!io || io->err)
    return;
  if (!src || src_len == 0)
    return;

  RingBuffer* rb = io->buf;
  if (src_len > RB_Unused(rb)) {
    io->err = -1;  // not enough space
    return;
  }

  _RingBuffer__cp_in(rb, rb->head, src, src_len);
  rb->head = (rb->head + src_len) % rb->sz;
  io->written += src_len;
}

// Shift (remove from beginning/tail) - read data from tail and advance tail
void RB_Shift(IO* io, u8* dst, u16 read_len) {
  if (!io || io->err)
    return;
  if (!dst || read_len == 0)
    return;

  RingBuffer* rb = io->buf;
  u16 used = RB_Used(rb);
  if (read_len > used) {
    io->err = -1;  // not enough data
    return;
  }

  _RingBuffer__cp_out(rb, rb->tail, dst, read_len);
  rb->tail = (rb->tail + read_len) % rb->sz;
  io->read += read_len;
}

// Peek - read without advancing tail
void RB_Peek(IO* io, u8* dst, u16 peek_len) {
  if (!io || io->err)
    return;
  if (!dst || peek_len == 0)
    return;

  RingBuffer* rb = io->buf;
  u16 used = RB_Used(rb);
  if (peek_len > used) {
    io->err = -1;  // not enough data
    return;
  }

  _RingBuffer__cp_out(rb, rb->tail, dst, peek_len);
  io->read += peek_len;
}

// Seek - advance read cursor without reading
void RB_Seek(IO* io, u16 offset) {
  if (!io || io->err)
    return;
  if (offset == 0)
    return;

  RingBuffer* rb = io->buf;
  u16 used = RB_Used(rb);
  if (offset > used) {
    io->err = -1;  // not enough data to skip
    return;
  }

  rb->tail = (rb->tail + offset) % rb->sz;
  io->read += offset;
}

// Unshift (prepend to beginning/tail) - prepend data before tail
void RB_Unshift(IO* io, const u8* src, u16 src_len) {
  if (!io || io->err)
    return;
  if (!src || src_len == 0)
    return;

  RingBuffer* rb = io->buf;
  if (src_len > RB_Unused(rb)) {
    io->err = -1;  // not enough space
    return;
  }

  rb->tail = (rb->tail - src_len + rb->sz) % rb->sz;
  _RingBuffer__cp_in(rb, rb->tail, src, src_len);
  io->written += src_len;
}