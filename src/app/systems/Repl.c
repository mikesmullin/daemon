#pragma once

#include "../../unity.h"

// Execute oneshot command and signal quit
// Called for initial command execution in oneshot mode
void Repl__executeOneshot(void) {
  if (_G->oneshot_cmd[0] == '\0' || cstr__eq(5, _G->oneshot_cmd, "help")) {
    // No command or help requested - show help
    // Copy "help" to prompt buffer (Cmd__parseOne reads from _G->prompt)
    strncpy(_G->prompt, "help", sizeof(_G->prompt) - 1);
    _G->prompt[sizeof(_G->prompt) - 1] = '\0';
    Cmd__parseOne();
    _G->quit = true;  // Help is local, quit immediately
  } else {
    // Copy oneshot command to prompt buffer
    strncpy(_G->prompt, _G->oneshot_cmd, sizeof(_G->prompt) - 1);
    _G->prompt[sizeof(_G->prompt) - 1] = '\0';
    Cmd__parseOne();
    // In term mode, command was forwarded to hub - don't quit yet
    // Main loop will receive response and set quit when complete
    // In hub mode, command was executed locally - quit now
    if (_G->mode != MODE_TERM) {
      _G->quit = true;
    }
    // For term mode, _G->quit stays false - wait for SV_AGENT_START/SV_AGENT_COMPLETE
  }
}

// Stub functions for compatibility (no-ops in oneshot mode)
void Repl__init(void) {
  // No initialization needed for oneshot mode
}

void Repl__resetPrompt(void) {
  // No-op: prompt handling not used in oneshot mode
}

void Repl__renderPrompt(void) {
  // No-op: prompt handling not used in oneshot mode
}

void Repl__updateSystem(void) {
  // No input processing in oneshot mode
}

void Repl__renderSystem(void) {
  // No rendering in oneshot mode
}