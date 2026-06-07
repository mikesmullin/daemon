#pragma once

#include "../../unity.h"

// ---
// @class Utils
// utility functions for parsing, formatting, and debugging
//
// Function | Purpose
// --- | ---
// msscanf(input, format, ...) | custom scanf returning characters consumed by matches
// msprintf2(dstCursor, format, end, ...) | sprintf with cursor advancement
// hexdump(data, len, out, maxLen) | dump raw bytes as hex+ASCII to output buffer
// u82bin(c, b) | convert u8 to written 8-bit binary notation
// format_bytes(bytes, round) | human-readable bytes (e.g., 1024 -> "1 KB")

// custom scanf returning characters consumed by matches
u64 msscanf(const char* input, const char* format, ...) {
  va_list args;
  va_start(args, format);

  u32 matched_items = 0;
  const char* p_format = format;
  const char* p_input = input;

  while (*p_format && *p_input) {
    if (*p_format == '%') {
      p_format++;  // Move past '%'

      if (*p_format == 'd') {  // Handle integer
        u32* p_int = va_arg(args, u32*);
        u32 val = 0;
        u32 sign = 1;

        // Skip whitespace
        while (isspace(*p_input)) p_input++;

        // Handle optional sign
        if (*p_input == '-') {
          sign = -1;
          p_input++;
        }

        // Parse integer
        if (isdigit(*p_input)) {
          while (isdigit(*p_input)) {
            val = val * 10 + (*p_input - '0');
            p_input++;
          }
          *p_int = val * sign;
          p_format++;  // Move past 'd'
          matched_items++;
        } else {
          break;  // Failed to match an integer
        }

      } else if (*p_format == 'f') {  // Handle float
        f32* p_float = va_arg(args, f32*);
        f32 val = 0.0f;
        f32 sign = 1.0f;
        f32 fraction = 0.0f;
        f32 divisor = 1.0f;

        // Skip whitespace
        while (isspace(*p_input)) p_input++;

        // Handle optional sign
        if (*p_input == '-') {
          sign = -1.0f;
          p_input++;
        }

        // Parse integer part of the float
        if (isdigit(*p_input)) {
          while (isdigit(*p_input)) {
            val = val * 10.0f + (*p_input - '0');
            p_input++;
          }
        }

        // Parse fractional part
        if (*p_input == '.') {
          p_input++;  // Skip '.'
          while (isdigit(*p_input)) {
            fraction = fraction * 10.0f + (*p_input - '0');
            divisor *= 10.0f;
            p_input++;
          }
          val += fraction / divisor;
        }

        *p_float = val * sign;
        p_format++;  // Move past 'f'
        matched_items++;

      } else if (*p_format == 's') {  // Handle string
        char* p_str = va_arg(args, char*);
        size_t buf_size = va_arg(args, size_t);

        // Skip whitespace
        while (isspace(*p_input)) p_input++;

        size_t i = 0;
        while (*p_input && !isspace(*p_input) && i < buf_size - 1) {
          p_str[i++] = *p_input++;
        }
        p_str[i] = '\0';  // Null-terminate the string
        p_format++;  // Move past 's'
        matched_items++;
      } else {
        // Unsupported format specifier
        break;
      }
    } else if (isspace(*p_format)) {
      // Skip spaces in format
      while (isspace(*p_format)) p_format++;
      while (isspace(*p_input)) p_input++;
    } else {
      // Literal character match in the format
      if (*p_format == *p_input) {
        p_format++;
        p_input++;
      } else {
        break;  // Mismatch between input and format
      }
    }
  }

  va_end(args);
  return p_input - input;  // matched chars
}

// current
void msprintf2(char** dstCursor, const char* format, const char* end, ...) {
  if (*dstCursor >= end)
    return;

  va_list args;
  va_start(args, end);
  const char* arg = NULL;
  u32 r = vsnprintf(*dstCursor, end - *dstCursor, format, args);
  va_end(args);

  // advance pointer similar to fread()
  (*dstCursor) += r;  // not including null terminator
}

void hexdump(const u8* data, u32 len, char* out, u32 maxLen) {
  const u8* byte = data;
  const void* end = out + maxLen;
  for (u32 i = 0; i < len; i += 16) {
    // Print the offset
    msprintf2(&out, "%08x  ", (char*)end, i);

    // Print the hexadecimal representation
    for (u32 j = 0; j < 16; j++) {
      if (i + j < len)
        msprintf2(&out, "%02x ", (char*)end, byte[i + j]);
      else
        msprintf2(&out, "   ", (char*)end);  // for padding
    }

    // Print the ASCII representation
    msprintf2(&out, " |", (char*)end);
    for (u32 j = 0; j < 16; j++) {
      if (i + j < len) {
        char c = byte[i + j];
        msprintf2(&out, "%c", (char*)end, isprint(c) ? c : '.');
      } else {
        msprintf2(&out, " ", (char*)end);
      }
    }
    msprintf2(&out, "|\n", (char*)end);
  }
}

// convert u8 to written 8-bit binary notation
// ie. char c[11]; u82bin(c, alice.tags1);
void u82bin(char* c, u8 b) {
  c[0] = '0';
  c[1] = 'b';
  c[2] = (b & (1 << 7)) ? '1' : '0';
  c[3] = (b & (1 << 6)) ? '1' : '0';
  c[4] = (b & (1 << 5)) ? '1' : '0';
  c[5] = (b & (1 << 4)) ? '1' : '0';
  c[6] = (b & (1 << 3)) ? '1' : '0';
  c[7] = (b & (1 << 2)) ? '1' : '0';
  c[8] = (b & (1 << 1)) ? '1' : '0';
  c[9] = (b & (1 << 0)) ? '1' : '0';
  c[10] = 0;  // null-terminator
}

char* _format_bytes(char* buf, u64 bytes, bool round) {
  static const char* units[] = {"B", "KB", "MB", "GB", "TB", "PB"};
  u8 idx = 0;
  f64 value = (f64)bytes;

  // divide into largest possible unit
  while (value >= 1024 && idx < ARRAYSIZE(units)) {
    value /= 1024;
    idx++;
  }

  snprintf(buf, 16, round || !idx ? "%.0f%s" : "%.2f%s", value, units[idx]);
  return buf;
}

// human-readable bytes (e.g., 1024 -> "1 KB")
char* format_bytes(u64 bytes, bool round) {
  char* buf = Arena__Push(_G->frameArena, 16);
  return _format_bytes(buf, bytes, round);
}