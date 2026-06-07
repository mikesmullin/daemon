#pragma once

#include "../../unity.h"

// ---
// @class ChaCha
// ChaCha20 stream cipher (RFC8439)
//
// Function | Purpose
// --- | ---
// ChaCha__setup(ctx, key, length, nonce) | initialize ChaCha20 context with key and nonce
// ChaCha__counter_set(ctx, counter) | set block counter for specific block processing
// ChaCha__block(ctx, output) | generate raw keystream block, increment counter
// ChaCha__encrypt(ctx, in, out, length) | encrypt plaintext of arbitrary length
// ChaCha__decrypt(ctx, in, out, length) | decrypt ciphertext (alias for encrypt)

// Copyright (C) 2014 insane coder (http://insanecoding.blogspot.com/, http://ChaCha20.insanecoding.org/)
//
// Permission to use, copy, modify, and distribute this software for any
// purpose with or without fee is hereby granted, provided that the above
// copyright notice and this permission notice appear in all copies.
//
// THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
// WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
// MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
// ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
// WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
// ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
// OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.

#define ROTL32(v, n) ((v) << (n)) | ((v) >> (32 - (n)))
#define LE(p) \
  (((u32)((p)[0])) | ((u32)((p)[1]) << 8) | ((u32)((p)[2]) << 16) | ((u32)((p)[3]) << 24))
#define FROMLE(b, i)         \
  (b)[0] = i & 0xFF;         \
  (b)[1] = (i >> 8) & 0xFF;  \
  (b)[2] = (i >> 16) & 0xFF; \
  (b)[3] = (i >> 24) & 0xFF;
#define QUARTERROUND(x, a, b, c, d) \
  x[a] += x[b];                     \
  x[d] = ROTL32(x[d] ^ x[a], 16);   \
  x[c] += x[d];                     \
  x[b] = ROTL32(x[b] ^ x[c], 12);   \
  x[a] += x[b];                     \
  x[d] = ROTL32(x[d] ^ x[a], 8);    \
  x[c] += x[d];                     \
  x[b] = ROTL32(x[b] ^ x[c], 7);

// Call this to initilize a ChaCha20, must be called before all other functions
void ChaCha__setup(ChaCha20* ctx, const u8* key, size_t length, u8 nonce[8]) {
  const char* constants = (length == 32) ? "expand 32-byte k" : "expand 16-byte k";

  ctx->schedule[0] = LE(constants + 0);
  ctx->schedule[1] = LE(constants + 4);
  ctx->schedule[2] = LE(constants + 8);
  ctx->schedule[3] = LE(constants + 12);
  ctx->schedule[4] = LE(key + 0);
  ctx->schedule[5] = LE(key + 4);
  ctx->schedule[6] = LE(key + 8);
  ctx->schedule[7] = LE(key + 12);
  ctx->schedule[8] = LE(key + 16 % length);
  ctx->schedule[9] = LE(key + 20 % length);
  ctx->schedule[10] = LE(key + 24 % length);
  ctx->schedule[11] = LE(key + 28 % length);
  //Surprise! This is really a block cipher in CTR mode
  ctx->schedule[12] = 0;  //Counter
  ctx->schedule[13] = 0;  //Counter
  ctx->schedule[14] = LE(nonce + 0);
  ctx->schedule[15] = LE(nonce + 4);

  ctx->available = 0;
}

// Call this if you need to process a particular block number
void ChaCha__counter_set(ChaCha20* ctx, u64 counter) {
  ctx->schedule[12] = counter & UINT32_C(0xFFFFFFFF);
  ctx->schedule[13] = counter >> 32;
  ctx->available = 0;
}

// Raw keystream for the current block, convert output to u8[] for individual bytes. Counter is incremented upon use
void ChaCha__block(ChaCha20* ctx, u32 output[16]) {
  u32* const nonce = ctx->schedule + 12;  //12 is where the 128 bit counter is
  int i = 10;

  memcpy(output, ctx->schedule, sizeof(ctx->schedule));

  while (i--) {
    QUARTERROUND(output, 0, 4, 8, 12)
    QUARTERROUND(output, 1, 5, 9, 13)
    QUARTERROUND(output, 2, 6, 10, 14)
    QUARTERROUND(output, 3, 7, 11, 15)
    QUARTERROUND(output, 0, 5, 10, 15)
    QUARTERROUND(output, 1, 6, 11, 12)
    QUARTERROUND(output, 2, 7, 8, 13)
    QUARTERROUND(output, 3, 4, 9, 14)
  }
  for (i = 0; i < 16; ++i) {
    u32 result = output[i] + ctx->schedule[i];
    FROMLE((u8*)(output + i), result);
  }

  // Official specs calls for performing a 64 bit increment here, and limit usage to 2^64 blocks.
  // However, recommendations for CTR mode in various papers recommend including the nonce component for a 128 bit increment.
  // This implementation will remain compatible with the official up to 2^64 blocks, and past that point, the official is not intended to be used.
  // This implementation with this change also allows this algorithm to become compatible for a Fortuna-like construct.
  if (!++nonce[0] && !++nonce[1] && !++nonce[2]) {
    ++nonce[3];
  }
}

static inline void _ChaCha__xor(u8* keystream, const u8** in, u8** out, size_t length) {
  u8* end_keystream = keystream + length;
  do {
    *(*out)++ = *(*in)++ ^ *keystream++;
  } while (keystream < end_keystream);
}

// Encrypt an arbitrary amount of plaintext, call continuously as needed
void ChaCha__encrypt(ChaCha20* ctx, const u8* in, u8* out, size_t length) {
  if (length) {
    u8* const k = (u8*)ctx->keystream;

    // First, use any buffered keystream from previous calls
    if (ctx->available) {
      size_t amount = Math__min(length, ctx->available);
      _ChaCha__xor(k + (sizeof(ctx->keystream) - ctx->available), &in, &out, amount);
      ctx->available -= amount;
      length -= amount;
    }

    // Then, handle new blocks
    while (length) {
      size_t amount = Math__min(length, sizeof(ctx->keystream));
      ChaCha__block(ctx, ctx->keystream);
      _ChaCha__xor(k, &in, &out, amount);
      length -= amount;
      ctx->available = sizeof(ctx->keystream) - amount;
    }
  }
}

// Alias for ChaCha__encrypt
void ChaCha__decrypt(ChaCha20* ctx, const u8* in, u8* out, size_t length) {
  ChaCha__encrypt(ctx, in, out, length);
}

#undef ROTL32
#undef LE
#undef FROMLE
#undef QUARTERROUND
