#pragma once

#include "../../unity.h"

// ---
// @class Environment (Env)
// environment variable access from process or .env file
//
// Function | Purpose
// --- | ---
// Env__get(key, value) | retrieve environment variable value by key

static char* ENV_FILE = ".env";

// Get path to .env file relative to binary location
// Binary is in build/, .env is in project root (parent of build/)
static void _Env__getEnvFilePath(char* path, size_t path_sz) {
#ifdef __linux__
  char exe_path[1024] = {0};
  ssize_t len = readlink("/proc/self/exe", exe_path, sizeof(exe_path) - 1);
  if (len > 0) {
    exe_path[len] = '\0';
    // Find last slash to get directory (e.g., /path/to/build)
    char* last_slash = strrchr(exe_path, '/');
    if (last_slash) {
      *last_slash = '\0';
      // Go up one more directory to project root (parent of build/)
      last_slash = strrchr(exe_path, '/');
      if (last_slash) {
        *last_slash = '\0';
        snprintf(path, path_sz, "%s/%s", exe_path, ENV_FILE);
        return;
      }
    }
  }
#endif
  // Fallback to current directory
  strncpy(path, ENV_FILE, path_sz);
}

void Env__get(char* key, char* value) {
  // read from process env

  char* v1 = getenv(key);
  if (v1) {
    memcpy(value, v1, cstr__len(v1));
    return;
  }

  // read from file (relative to binary location)
  char env_path[1024] = {0};
  _Env__getEnvFilePath(env_path, sizeof(env_path));

  FILE* file;
  int err = File__open(&file, env_path, "r");
  if (NULL == file) {
    value[0] = '\0';
    return;
  }

  u64 keyLen = cstr__len(key);

  char lineKey[256];
  char lineValue[256];
  int keyIdx = 0;
  int valueIdx = 0;
  int state = 0;  // 0=start, 1=in_key, 2=after_key, 3=in_value, 4=in_comment
  bool inQuotes = false;
  u8 byte;

  while (File__read(&byte, 1, 1, 1, file) == 1) {
    if (byte == '\n') {
      // End of line - check if we found the key
      if (state == 3 && keyIdx == keyLen && memcmp(lineKey, key, keyLen) == 0) {
        memcpy(value, lineValue, valueIdx);
        value[valueIdx] = '\0';
        File__close(file);
        return;
      }
      // Reset for next line
      keyIdx = 0;
      valueIdx = 0;
      state = 0;
      inQuotes = false;
      continue;
    }

    if (state == 0) {
      // Start of line
      if (byte == '#') {
        state = 4;  // comment
      } else if (byte == ' ' || byte == '\t') {
        // skip leading whitespace
      } else {
        state = 1;
        keyIdx = 0;
        lineKey[keyIdx++] = byte;
      }
    } else if (state == 1) {
      // Reading key
      if (byte == '=') {
        state = 3;  // found =, now read value
        valueIdx = 0;
      } else if (byte == ' ' || byte == '\t') {
        state = 2;  // whitespace before =
      } else {
        if (keyIdx < 255) {
          lineKey[keyIdx++] = byte;
        }
      }
    } else if (state == 2) {
      // After key, looking for =
      if (byte == '=') {
        state = 3;
        valueIdx = 0;
      } else if (byte != ' ' && byte != '\t') {
        // Not a valid key=value line
        state = 4;  // treat as comment/skip
      }
    } else if (state == 3) {
      // Reading value
      if (byte == '"' && valueIdx == 0) {
        // Opening quote at start of value - skip it and enter quote mode
        inQuotes = true;
      } else if (byte == '"' && inQuotes) {
        // Closing quote - skip it and exit quote mode
        inQuotes = false;
      } else if (!inQuotes && (byte == ' ' || byte == '\t')) {
        if (valueIdx > 0) {
          lineValue[valueIdx++] = byte;
        }
        // skip leading whitespace in value
      } else {
        lineValue[valueIdx++] = byte;
      }
    }
    // state == 4: in comment, skip until newline
  }

  // Check last line if file doesn't end with newline
  if (state == 3 && keyIdx == keyLen && memcmp(lineKey, key, keyLen) == 0) {
    memcpy(value, lineValue, valueIdx);
    value[valueIdx] = '\0';
  }

  File__close(file);
}