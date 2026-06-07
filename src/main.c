// #pragma once

#include "unity.h"

int main(int argc, char* argv[]) {
  // MATH_INIT();
#define ENGINE_ARENA1_SZ (1024 * 1024 * 10)
#define ENGINE_ARENA2_SZ (1024 * 1024 * 100)
#define ENGINE_ARENA3_SZ (1024 * 1024 * 1)  // curlArena: 1MB for HTTP responses
  _G->arena = Arena__AllocZ(ENGINE_ARENA1_SZ);
  _G->frameArena = Arena__AllocZ(ENGINE_ARENA2_SZ);
  _G->curlArena = Arena__AllocZ(ENGINE_ARENA3_SZ);
  stm_setup();
  _G->unow = stm_now();
  _G->now = stm_ms(_G->unow);

  // Initialize Command Registry
  CmdRegistry__init(&_G->cmd_reg, 1024);

  // Default values
  strcpy(_G->hub_host, "127.0.0.1");
  _G->hub_port = 6543;
  _G->session_id = 0;
  _G->mode = MODE_HUB;  // Default role is hub per NET_CODE.md spec 16.2
  _G->cli_mode = CLI_ONESHOT;  // Default: single command, exit (ai-friendly)
  _G->oneshot_cmd[0] = '\0';
  _G->process_name[0] = '\0';  // No name by default
  strcpy(_G->default_template, "home");  // Default template

  // Parse CLI arguments using the CliParser module
  if (0 != CliParser__parse(argc, argv)) {
    return 1;  // CLI parsing failed
  }

  Console__init();
  Repl__init();
  Curl__init();

  LOG_DEBUGF(
      "CLI: mode=%d cli_mode=%d oneshot_cmd='%s' verbosity=%d",
      _G->mode,
      _G->cli_mode,
      _G->oneshot_cmd,
      _G->verbosity);

  // Oneshot mode: execute command and prepare to exit
  LOG_DEBUGF("CLI: oneshot mode - executing command");

  // Check if this is a command that needs hub (term mode, non-help command)
  bool needsHub = (_G->mode == MODE_TERM) && !cstr__eq(5, _G->oneshot_cmd, "help") &&
                  _G->oneshot_cmd[0] != '\0';

  if (needsHub) {
    // Term oneshot: initialize network and forward to hub
    LOG_DEBUGF("CLI: term oneshot - forwarding to hub");
    Network__cl_init(&_G->term_cl, 0);
    Repl__executeOneshot();  // This forwards to hub, doesn't set quit
    // Main loop will handle receiving response and setting quit
  } else if (_G->mode == MODE_HUB) {
    // Hub mode: check if we have a prompt
    if (_G->oneshot_cmd[0] != '\0') {
      // Hub oneshot: init XAI if we have a template, execute command, then exit
      if (_G->default_template[0]) {
        XAI__init();
      }
      Repl__executeOneshot();
      // _G->quit will be set to true by Repl__executeOneshot
    } else {
      // Hub server mode: no prompt provided, stay running until killed
      XAI__init();  // Initialize XAI for incoming agent requests
      LOG_INFOF("Hub mode: listening on %s:%u (ctrl+c to exit)", _G->hub_host, _G->hub_port);
      Network__sv_init(&_G->hub_sv, 0);
      // Don't set quit - let the main loop run indefinitely
    }
  } else if (_G->mode == MODE_WORKER) {
    // Worker mode: check if we have a prompt
    if (_G->oneshot_cmd[0] != '\0') {
      // Worker oneshot: execute command locally and exit
      Repl__executeOneshot();
      // _G->quit will be set to true by Repl__executeOneshot
    } else {
      // Worker server mode: no prompt provided, try to connect to hub
      LOG_INFOF(
          "Worker server mode: attempting to connect to hub at %s:%u",
          _G->hub_host,
          _G->hub_port);
      Network__cl_init(&_G->worker_cl, 0);
      // Connection happens asynchronously in main loop
      // Main loop will monitor connection status and exit if connection fails
    }
  } else {
    // Help or empty command - just execute and quit
    Repl__executeOneshot();
  }

  LOG_DEBUGF("CLI: entering main loop, quit=%d", _G->quit);

  while (!_G->quit) {
    _G->unow = stm_now();
    _G->now = stm_ms(_G->unow);

    // Network updates needed for term mode in oneshot (waiting for hub response)
    // and for hub/worker modes (server operation)
    bool needsNetwork =
        (_G->mode == MODE_TERM) || (_G->mode == MODE_HUB) || (_G->mode == MODE_WORKER);

    if (needsNetwork) {
      if (MODE_HUB == _G->mode) {
        Network__updateSystem(&_G->hub_sv, true);
        for (u8 i = 0; i < _G->worker_sv_ct; i++) {
          Network__updateSystem(&_G->worker_sv[i], false);
        }
        // Tick command registry to process pending commands
        CmdRegistry__tick(&_G->cmd_reg);
      }
      if (MODE_TERM == _G->mode) {
        Network__updateSystem(&_G->term_cl, false);
      }
      if (MODE_WORKER == _G->mode) {
        Network__updateSystem(&_G->worker_cl, false);
      }
    }

    SleepMs(1000 / 30);

    // Reset frame arena at end of each loop iteration
    Arena__Reset(_G->frameArena);
  }

  Curl__shutdown();
  if (_G->cli_mode == CLI_INTERACTIVE || (_G->cli_mode == CLI_ONESHOT && _G->mode == MODE_TERM)) {
    Network__shutdown();
  }
}