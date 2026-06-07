#pragma once

#include "../../unity.h"

// ---
// @class Input/Output (IO)
// encoding and serializing scalar values
// see: `ai/docs/NET_PROTO.md`
//
// Function | Purpose
// --- | ---
// IO_Begin(io) | save head/tail pointers for potential rollback
// IO_RollbackOrCommit(io) | rollback or commit based on error state
// IO_Write(io, r) | track write count or set error
// IO_Read(io, r) | track read count or set error
//
// IO_WriteBytes(io, src, len) | write raw bytes to buffer
// IO_ReadBytes(io, dst, len) | read raw bytes from buffer
// IO_WriteU8(io, byte) | write 8-bit unsigned int
// IO_ReadU8(io, dst) | read 8-bit unsigned int
// IO_WriteU16(io, val) | write 16-bit unsigned int
// IO_ReadU16(io, dst) | read 16-bit unsigned int
// IO_WriteU32(io, val) | write 32-bit unsigned int
// IO_ReadU32(io, dst) | read 32-bit unsigned int
// IO_WriteU64(io, val) | write 64-bit unsigned int
// IO_ReadU64(io, dst) | read 64-bit unsigned int
// IO_WriteF32(io, val) | write 32-bit float
// IO_ReadF32(io, dst) | read 32-bit float
// IO_WriteF64(io, val) | write 64-bit float
// IO_ReadF64(io, dst) | read 64-bit float
// IO_WriteVInt32(io, val, neg) | write variable-length encoded 32-bit int
// IO_ReadVInt32(io, v) | read variable-length encoded 32-bit int
// IO_WriteStr8(io, s) | write length-prefixed string
// IO_ReadStr8(arena, io, dst) | read length-prefixed string into arena
// IO_ReadStr8Buf(io, buf, maxlen) | read length-prefixed string into fixed buffer
//
// IO_FlipEndian2(data) | convert Little-Endian to Big-Endian (16-bit)
// IO_FlipEndian4(data) | convert Little-Endian to Big-Endian (32-bit)
// IO_FlipEndian8(data) | convert Little-Endian to Big-Endian (64-bit)

void IO_Begin(IO* io) {
  io->rb_head = io->buf->head;
  io->rb_tail = io->buf->tail;
}
void IO_RollbackOrCommit(IO* io) {
  if (io->err) {
    // rollback
    io->buf->head = io->rb_head;
    io->buf->tail = io->rb_tail;
    io->written = 0;
    io->read = 0;
  } else {
    // commit
    io->rb_head = 0;
    io->rb_tail = 0;
  }
}
void IO_Write(IO* io, s32 r) {
  if (r > 0) {
    io->written += r;
  } else {
    io->err = r;
  }
}
void IO_Read(IO* io, s32 r) {
  if (r > 0) {
    io->read += r;
  } else {
    io->err = r;
  }
}

void IO_WriteBytes(IO* io, u8* src, u32 len) {
  if (IO_DEBUG || VERBOSITY_CHECK(VERBOSITY_IO)) {
    char out[2048] = {0};
    hexdump(src, len, out, 2048);
    LOG_DEBUGF("[IO] WriteBytes (%u bytes)\n%s", len, out);
  }

  RB_Push(io, src, len);
}

void IO_ReadBytes(IO* io, u8* dst, u32 len) {
  RB_Shift(io, dst, len);
  if (VERBOSITY_CHECK(VERBOSITY_IO)) {
    char out[2048] = {0};
    hexdump(dst, len, out, 2048);
    LOG_DEBUGF("[IO] ReadBytes (%u bytes)\n%s", len, out);
  }
}

void IO_WriteU8(IO* io, u8 byte) {
  if (VERBOSITY_CHECK(VERBOSITY_IO)) {
    LOG_DEBUGF("[IO] WriteU8 %02X %u %d", byte, byte, byte);
  }
  RB_Push(io, &byte, 1);
}

void IO_ReadU8(IO* io, u8* dst) {
  RB_Shift(io, dst, 1);
}

void IO_WriteU16(IO* io, u16 val) {
  if (VERBOSITY_CHECK(VERBOSITY_IO)) {
    LOG_DEBUGF("[IO] WriteU16 %u", val);
  }
  RB_Push(io, (u8*)&val, 2);
}

void IO_ReadU16(IO* io, u16* dst) {
  RB_Shift(io, (u8*)dst, 2);
}

void IO_WriteU32(IO* io, u32 val) {
  if (VERBOSITY_CHECK(VERBOSITY_IO)) {
    LOG_DEBUGF("[IO] WriteU32 %lu", val);
  }
  RB_Push(io, (u8*)&val, 4);
}

void IO_ReadU32(IO* io, u32* dst) {
  RB_Shift(io, (u8*)dst, 4);
}

void IO_WriteU64(IO* io, u64 val) {
  if (VERBOSITY_CHECK(VERBOSITY_IO)) {
    LOG_DEBUGF("[IO] WriteU64 %llu", val);
  }
  RB_Push(io, (u8*)&val, 8);
}

void IO_ReadU64(IO* io, u64* dst) {
  RB_Shift(io, (u8*)dst, 8);
}

void IO_WriteF32(IO* io, f32 val) {
  if (VERBOSITY_CHECK(VERBOSITY_IO)) {
    LOG_DEBUGF("[IO] WriteF32 %f", val);
  }
  RB_Push(io, (u8*)&val, 4);
}

void IO_ReadF32(IO* io, f32* dst) {
  RB_Shift(io, (u8*)dst, 4);
}

void IO_WriteF64(IO* io, f64 val) {
  if (VERBOSITY_CHECK(VERBOSITY_IO)) {
    LOG_DEBUGF("[IO] WriteF64 %lf", val);
  }
  RB_Push(io, (u8*)&val, 8);
}

void IO_ReadF64(IO* io, f64* dst) {
  RB_Shift(io, (u8*)dst, 8);
}

// ie. makes Little-Endian (normal) into Big-Endian (ie. for Websocket)
u16 IO_FlipEndian2(u16 data) {
  u8* b = (u8*)&data;
  return ((u16)b[0] << 8) | (u16)b[1];
}

u32 IO_FlipEndian4(u32 data) {
  u8* b = (u8*)&data;
  return ((u32)b[0] << 24) | ((u32)b[1] << 16) | ((u32)b[2] << 8) | (u32)b[3];
}

u64 IO_FlipEndian8(u64 data) {
  u8* b = (u8*)&data;
  return ((u64)b[0] << 56) | ((u64)b[1] << 48) | ((u64)b[2] << 40) | ((u64)b[3] << 32) |
         ((u64)b[4] << 24) | ((u64)b[5] << 16) | ((u64)b[6] << 8) | (u64)b[7];
}

void IO_WriteVInt32(IO* io, u32 val, bool neg) {
  if (VERBOSITY_CHECK(VERBOSITY_IO)) {
    LOG_DEBUGF("[IO] WriteVInt32 %lu %d", val, val);
  }

  // in:  xxxxx101 00011100 00001111 00000011 (27-bit) 2^27 = 0..134,217,727 or +/-67,108,863
  // fmt: cs000000 c0000000 c0000000 c0000000 (5-bits for schema)
  // out: 11000011 10111100 11100000 01010001 (8..32-bit encoded)
  // c = continuation bit
  // s = negative bit
  // x = discarded
  if (neg) {
    val = ~val + 1;  // Math abs() shortcut
  }
  ASSERT_CONTEXT(val <= 0x7ffffffU, "VInt32 can't encode >134,217,727. 0x%08x %lu.", val, val);
  u64 b = val & 0x3F;  // Take the first 6 bits
  if (neg) {
    b |= 0x40;  // Mark signed integer negative
  }
  u8 sz = 1;
  val >>= 6;  // Shift out encoded bits
  while (val) {
    b |= 0x80ULL << ((sz - 1) * 8);  // Set continuation bit
    b |= (val & 0x7F) << (sz * 8);  // Encode next 7 bits
    val >>= 7;  // Shift out encoded bits
    sz++;
  }

  RB_Push(io, (u8*)&b, sz);
}

void IO_ReadVInt32(IO* io, VInt32* v) {
  if (RB_Used(io->buf) < 1) {
    io->err = -1;  // empty
    return;
  }
  u8 byte = 0;
  IO_ReadU8(io, &byte);  // Read first byte
  if (io->err) {
    return;
  }
  u8 sz = 1;

  // Extract flag bits
  v->sign = (byte & 0x40) != 0;  // signed integer
  v->value.u = byte & 0x3F;  // store the first 6 bits
  u64 shift = 6;

  // Continue reading more bytes
  while (byte & 0x80) {  // while continuation bit is set
    if (RB_Used(io->buf) < 1) {
      io->err = -2;  // missing bytes
      return;
    }
    IO_ReadU8(io, &byte);  // Read byte
    if (io->err) {
      return;
    }
    v->value.u |= (byte & 0x7F) << shift;  // Store the next 7 bits
    shift += 7;
    sz++;
    ASSERT_CONTEXT(sz < 5, "VInt32 cannot decode large number.");
  }
  if (v->sign) {
    v->value.s = ~v->value.u + 1;
  }
}

void IO_WriteStr8(IO* io, Str8* s) {
  Str8__init(s);
  if (VERBOSITY_CHECK(VERBOSITY_IO)) {
    LOG_DEBUGF("[IO] WriteStr8 len %d str %.*s", s->len, s->len, s->str);
  }
  IO_WriteVInt32(io, s->len, false);
  RB_Push(io, (u8*)s->str, s->len);
}

void IO_ReadStr8(Arena* arena, IO* io, Str8* dst) {
  if (RB_Empty(io->buf)) {
    io->err = -1;  // empty
    return;
  }
  VInt32 v = {0};
  IO_ReadVInt32(io, &v);
  if (io->err) {
    return;
  }
  u32 len = v.value.u;
  if (RB_Used(io->buf) < len) {
    io->err = -2;  // avail buf shorter than decl str len
    return;
  }
  u8 temp[len];
  RB_Shift(io, temp, len);
  dst->str = (char*)Arena__Push(arena, len);
  memcpy(dst->str, temp, len);
  dst->len = len;
}

// Read length-prefixed string into fixed-size buffer
// Returns actual length read (may be truncated if buf too small)
u32 IO_ReadStr8Buf(IO* io, char* buf, u32 maxlen) {
  if (RB_Empty(io->buf)) {
    io->err = -1;
    return 0;
  }
  VInt32 v = {0};
  IO_ReadVInt32(io, &v);
  if (io->err)
    return 0;
  u32 len = v.value.u;
  u32 read_len = (len >= maxlen) ? maxlen - 1 : len;
  if (RB_Used(io->buf) < len) {
    io->err = -2;
    return 0;
  }
  // Read all bytes from buffer (even if truncating)
  u8 temp[len];
  RB_Shift(io, temp, len);
  memcpy(buf, temp, read_len);
  buf[read_len] = '\0';
  return read_len;
}

#define F32_F16_SCALE (8.0f)

static s16 _encodeF16(f32 n) {
  return n * F32_F16_SCALE;
}

static f32 _decodeF16(s16 b) {
  return b / F32_F16_SCALE;
}
