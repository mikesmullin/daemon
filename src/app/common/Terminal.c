#pragma once

#include "../../unity.h"

// ---
// @class Terminal
// raw terminal mode and signal handling for interactive CLI
//
// Function | Purpose
// --- | ---
// Terminal__enable_raw_mode() | enable raw mode for immediate key input
// Terminal__disable_raw_mode() | restore terminal to normal canonical mode
// Terminal__handle_ctrl_c() | handle Ctrl+C for clean exit with terminal restore
// Terminal__handle_ctrl_z() | handle Ctrl+Z for suspend/resume with raw mode toggle

void Terminal__enable_raw_mode(void) {
  tcgetattr(STDIN_FILENO, &_G->old_tio);
  _G->new_tio = _G->old_tio;

  // Disable canonical mode (ICANON), echo (ECHO), and signal chars (ISIG)
  _G->new_tio.c_lflag &= ~(ICANON | ECHO | ISIG);
  // Optional: disable Ctrl-V etc.
  _G->new_tio.c_iflag &= ~(IXON | ICRNL);

  // Minimum characters to read = 0, timeout = 0.1s (or 0 for true non-blocking)
  _G->new_tio.c_cc[VMIN] = 0;
  _G->new_tio.c_cc[VTIME] = 1;  // 0.1 second timeout

  // Use TCSANOW instead of TCSAFLUSH to avoid blocking when stdout is redirected
  tcsetattr(STDIN_FILENO, TCSANOW, &_G->new_tio);
}

void Terminal__disable_raw_mode(void) {
  tcsetattr(STDIN_FILENO, TCSAFLUSH, &_G->old_tio);
}

// Usage:
// int main() {
//   enable_raw_mode();
//   atexit(disable_raw_mode);   // or call it manually before exit
// }
// void Terminal__updateSystem() {
//   char c;
//   if (read(STDIN_FILENO, &c, 1) != -1) {
//     // c is available immediately when a key is pressed
//     printf("You pressed: %c (0x%02x)\r\n", c >= 32 ? c : '.', (unsigned)c);
//     fflush(stdout);
//   }
// }

// Optional: self-send real signals so handlers and default behavior work
void Terminal__handle_ctrl_c() {
  LOG_INFOF("Caught Ctrl+C – cleaning up and exiting...");
  // fflush(stdout); // commented cuz buffering disabled globally
  // Restore terminal before exit so the shell is usable
  Terminal__disable_raw_mode();
  raise(SIGINT);  // or just exit(0);
}

void Terminal__handle_ctrl_z() {
  LOG_INFOF("Caught Ctrl+Z – suspending...");
  // fflush(stdout); // commented cuz buffering disabled globally
  Terminal__disable_raw_mode();  // important: restore normal terminal
  raise(SIGTSTP);  // suspends the process like real Ctrl+Z
  // When the user does `fg`, main() continues here:
  Terminal__enable_raw_mode();  // re-enter raw mode after resume
}