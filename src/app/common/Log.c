#pragma once

#include "../../unity.h"

// ---
// @class Console
// logging and assertion handling for stdout/stderr/file output
//
// Function | Purpose
// --- | ---
// Console__trapAssert() | enable assertion trapping for unit tests
// Console__didAssert() | check if an assertion was triggered
// Console__resetAssert() | reset assertion trap and triggered state
// Console__log(txt, ...) | log formatted message to stdout and optionally file
// Console__error(txt, ...) | log formatted error to stderr
// Console__abort(txt, ...) | log error to stderr and abort (or trap for tests)

static void Console__init(void) {
  // disable output buffering
  setvbuf(stdout, NULL, _IONBF, 0);
  setvbuf(stderr, NULL, _IONBF, 0);
}

DLL_EXPORT void Console__trapAssert(void) {
  __expect_assert = true;
}

DLL_EXPORT bool Console__didAssert(void) {
  return __asserted;
}

DLL_EXPORT void Console__resetAssert(void) {
  __expect_assert = false;
  __asserted = false;
}

DLL_EXPORT void Console__log(const char* txt, ...) {
  va_list myargs;
  va_start(myargs, txt);
  Repl__resetPrompt();
  vfprintf(stdout, txt, myargs);
  va_end(myargs);
  Repl__renderPrompt();
  // fflush(stdout);

  // append to log file
  if (__log_to_file) {
    FILE* log_file = fopen("daemon.log", "a");
    if (log_file) {
      va_start(myargs, txt);
      vfprintf(log_file, txt, myargs);
      va_end(myargs);
      fclose(log_file);
    }
  }
}

DLL_EXPORT void Console__error(const char* txt, ...) {
  va_list myargs;
  va_start(myargs, txt);
  Repl__resetPrompt();
  vfprintf(stderr, txt, myargs);
  va_end(myargs);
  Repl__renderPrompt();
  // fflush(stderr);
}

DLL_EXPORT void Console__abort(const char* txt, ...) {
  // allow intercept from unit test
  if (__expect_assert) {
    __asserted = true;
    return;
  }

  va_list myargs;
  va_start(myargs, txt);
  Repl__resetPrompt();
  vfprintf(stderr, txt, myargs);
  va_end(myargs);
  fflush(stderr);
  abort();
}