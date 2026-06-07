#pragma once

#include "../../unity.h"

// ---
// @class File
// portable file read/write operations
//
// Function | Purpose
// --- | ---
// File__open(Stream, FileName, Mode) | open file with specified mode
// File__eof(Stream) | check if end of file reached
// File__read(Buffer, BufferSize, ElementSize, ElementCount, Stream) | read data from file
// File__write(Buffer, ElementSize, ElementCount, Stream) | write data to file
// File__close(Stream) | close file handle
// File__await(path, timeout_ms) | wait for file to exist or be modified

int File__open(FILE** Stream, const char* FileName, const char* Mode) {
#ifndef __EMSCRIPTEN__
  *Stream = fopen(FileName, Mode);
  return 0;  // success
#endif

#ifdef __EMSCRIPTEN__
  return 0;
#endif
}

int File__eof(FILE* Stream) {
#ifndef __EMSCRIPTEN__
  return feof(Stream);
#endif

#ifdef __EMSCRIPTEN__
  return 1;  // eof
#endif
}

size_t File__read(
    void* Buffer, size_t BufferSize, size_t ElementSize, size_t ElementCount, FILE* Stream) {
#ifndef __EMSCRIPTEN__
  return fread(Buffer, ElementSize, ElementCount, Stream);
#endif

#ifdef __EMSCRIPTEN__
  return 0;
#endif
}

unsigned long long File__write(
    const void* Buffer, size_t ElementSize, size_t ElementCount, FILE* Stream) {
#ifndef __EMSCRIPTEN__
  return fwrite(Buffer, ElementSize, ElementCount, Stream);
#endif

#ifdef __EMSCRIPTEN__
  return 0;
#endif
}

int File__close(FILE* Stream) {
#ifndef __EMSCRIPTEN__
  return fclose(Stream);
#endif

#ifdef __EMSCRIPTEN__
  return 0;
#endif
}

// Wait for file to exist or be modified
// timeout_ms: 0 = indefinite
bool File__await(const char* path, u32 timeout_ms) {
#ifndef __EMSCRIPTEN__
  struct stat st;
  u32 elapsed = 0;
  u32 interval = 100;  // check every 100ms

  // Get initial mtime if file exists
  time_t last_mtime = 0;
  if (stat(path, &st) == 0) {
    last_mtime = st.st_mtime;
  }

  while (true) {
    if (stat(path, &st) == 0) {
      // If file didn't exist before, or mtime changed
      if (last_mtime == 0 || st.st_mtime > last_mtime) {
        return true;
      }
    }

    if (timeout_ms > 0 && elapsed >= timeout_ms) {
      return false;
    }

    SleepMs(interval);
    elapsed += interval;
  }
#endif
  return false;
}
