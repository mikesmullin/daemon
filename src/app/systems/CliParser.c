// CliParser.c: Command-line interface argument parsing
// Provides unified CLI argument parsing for all daemon modes (hub, term, worker)

#pragma once

// Parse command-line arguments and populate _G fields:
// - _G->mode (MODE_HUB, MODE_TERM, MODE_WORKER)
// - _G->cli_mode (CLI_ONESHOT, CLI_INTERACTIVE)
// - _G->hub_host, _G->hub_port
// - _G->default_template
// - _G->oneshot_cmd (for oneshot mode)
//
// Returns 0 on success, 1 on error (invalid flag/argument)
static int CliParser__parse(int argc, char* argv[]) {
  int verbosity = 0;
  bool role_specified = false;
  bool hub_specified = false;

  // First pass: process all flags and options
  for (int i = 1; i < argc; i++) {
    // Interactive mode
    if (cstr__eq(3, "-i", argv[i])) {
      _G->cli_mode = CLI_INTERACTIVE;
    }
    // Role flag: -r <role> or --role <role>
    else if (cstr__eq(3, "-r", argv[i]) || cstr__eq(7, "--role", argv[i])) {
      role_specified = true;
      if (i + 1 < argc) {
        const char* role = argv[++i];
        if (cstr__eq(4, "hub", role)) {
          _G->mode = MODE_HUB;
        } else if (cstr__eq(5, "term", role)) {
          _G->mode = MODE_TERM;
        } else if (cstr__eq(7, "worker", role)) {
          _G->mode = MODE_WORKER;
        } else {
          LOG_ERRORF("Invalid role: %s (must be: hub, term, or worker)", role);
          return 1;
        }
      } else {
        LOG_ERRORF("Missing role argument for flag: %s", argv[i]);
        return 1;
      }
    }
    // Hub address: -h <ipv4:port> or --hub <ipv4:port>
    else if (cstr__eq(3, "-h", argv[i]) || cstr__eq(6, "--hub", argv[i])) {
      hub_specified = true;
      if (i + 1 < argc) {
        if (!Sock__parseHostPort(argv[++i], _G->hub_host, &_G->hub_port)) {
          LOG_ERRORF("Invalid hub address format. Use: -h <ipv4:port>");
          return 1;
        }
      } else {
        LOG_ERRORF("Missing hub address for flag: %s", argv[i]);
        return 1;
      }
    }
    // Template file: -t <file.yaml> or --template <file.yaml>
    else if (cstr__eq(3, "-t", argv[i]) || cstr__eq(11, "--template", argv[i])) {
      if (i + 1 < argc) {
        strncpy(_G->default_template, argv[++i], sizeof(_G->default_template) - 1);
        _G->default_template[sizeof(_G->default_template) - 1] = '\0';
      } else {
        LOG_ERRORF("Missing template argument for flag: %s", argv[i]);
        return 1;
      }
    }
    // Template data: -d <yaml_data> or --data <yaml_data>
    else if (cstr__eq(3, "-d", argv[i]) || cstr__eq(7, "--data", argv[i])) {
      if (i + 1 < argc) {
        // TODO: Store template data for substitution
        i++;
      } else {
        LOG_ERRORF("Missing data argument for flag: %s", argv[i]);
        return 1;
      }
    }
    // Session resumption: -s <node:session_id> or --session <node:session_id>
    else if (cstr__eq(3, "-s", argv[i]) || cstr__eq(10, "--session", argv[i])) {
      if (i + 1 < argc) {
        // TODO: Parse node:session_id format
        i++;
      } else {
        LOG_ERRORF("Missing session argument for flag: %s", argv[i]);
        return 1;
      }
    }
    // Verbosity: -v (stackable: -v, -vv, -vvv, etc.)
    else if (argv[i][0] == '-' && argv[i][1] == 'v') {
      // Check that all chars after '-v' are also 'v'
      bool all_v = true;
      for (int j = 2; argv[i][j] != '\0'; j++) {
        if (argv[i][j] != 'v') {
          all_v = false;
          break;
        }
      }
      if (all_v) {
        // Count consecutive 'v's in the flag
        const char* p = argv[i] + 1;  // Skip the '-'
        while (*p == 'v') {
          verbosity++;
          p++;
        }
      }
    }
    // Listen address for hub mode: -l <host:port> or -b/--bind <host:port>
    else if (cstr__eq(3, "-l", argv[i]) || cstr__eq(3, "-b", argv[i]) || cstr__eq(7, "--bind", argv[i])) {
      if (i + 1 < argc) {
        if (!Sock__parseHostPort(argv[++i], _G->hub_host, &_G->hub_port)) {
          LOG_ERRORF("Invalid listen address format. Use: -b/--bind <host:port>");
          return 1;
        }
      } else {
        LOG_ERRORF("Missing listen address for flag: %s", argv[i]);
        return 1;
      }
    }
    // Node name: -n <name> or --name <name>
    else if (cstr__eq(3, "-n", argv[i]) || cstr__eq(7, "--name", argv[i])) {
      if (i + 1 < argc) {
        strncpy(_G->process_name, argv[++i], sizeof(_G->process_name) - 1);
        _G->process_name[sizeof(_G->process_name) - 1] = '\0';
      } else {
        LOG_ERRORF("Missing name argument for flag: %s", argv[i]);
        return 1;
      }
    }
  }

  // Auto-detect role: if --hub specified but not -r, default is term
  if (hub_specified && !role_specified) {
    _G->mode = MODE_TERM;
  }

  // Second pass: collect remaining args as oneshot command (in oneshot mode)
  if (_G->cli_mode == CLI_ONESHOT) {
    _G->oneshot_cmd[0] = '\0';
    for (int i = 1; i < argc; i++) {
      // Skip known flags and their arguments
      if (cstr__eq(3, "-i", argv[i]))
        continue;
      // Skip -r/--role and argument
      if (cstr__eq(3, "-r", argv[i]) || cstr__eq(7, "--role", argv[i])) {
        i++;
        continue;
      }
      // Skip -h/--hub and argument
      if (cstr__eq(3, "-h", argv[i]) || cstr__eq(6, "--hub", argv[i])) {
        i++;
        continue;
      }
      // Skip -t/--template and argument
      if (cstr__eq(3, "-t", argv[i]) || cstr__eq(11, "--template", argv[i])) {
        i++;
        continue;
      }
      // Skip -d/--data and argument
      if (cstr__eq(3, "-d", argv[i]) || cstr__eq(7, "--data", argv[i])) {
        i++;
        continue;
      }
      // Skip -s/--session and argument
      if (cstr__eq(3, "-s", argv[i]) || cstr__eq(10, "--session", argv[i])) {
        i++;
        continue;
      }
      // Skip -v flags (including -vv, -vvv, etc.)
      if (argv[i][0] == '-' && argv[i][1] == 'v') {
        // Check that all chars after '-v' are also 'v'
        bool all_v = true;
        for (int j = 2; argv[i][j] != '\0'; j++) {
          if (argv[i][j] != 'v') {
            all_v = false;
            break;
          }
        }
        if (all_v)
          continue;
      }
      // Skip -l, -b/--bind and argument
      if (cstr__eq(3, "-l", argv[i]) || cstr__eq(3, "-b", argv[i]) || cstr__eq(7, "--bind", argv[i])) {
        i++;
        continue;
      }
      // Skip -n/--name and argument
      if (cstr__eq(3, "-n", argv[i]) || cstr__eq(7, "--name", argv[i])) {
        i++;
        continue;
      }
      // This is the command (or first word of command)
      size_t len = strlen(_G->oneshot_cmd);
      if (len > 0) {
        strcat(_G->oneshot_cmd, " ");
        len++;
      }
      strncat(_G->oneshot_cmd, argv[i], sizeof(_G->oneshot_cmd) - len - 1);
    }
  }

  // Store verbosity level in global state (capped at max)
  _G->verbosity = (verbosity > 6) ? 6 : (u8)verbosity;

  return 0;
}
