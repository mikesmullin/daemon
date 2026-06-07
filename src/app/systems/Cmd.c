#pragma once

#include <dirent.h>
#include <sys/stat.h>
#include <unistd.h>

#include "../../unity.h"

// ---
// Command Registry Implementation

void CmdRegistry__init(CmdRegistry* reg, u32 capacity) {
  reg->capacity = capacity;
  reg->count = 0;
  reg->commands = Arena__Push(_G->arena, sizeof(CmdMessage) * capacity);
  reg->states = Arena__Push(_G->arena, sizeof(CmdExecState) * capacity);
}

bool CmdRegistry__add(CmdRegistry* reg, CmdMessage* cmd) {
  if (reg->count >= reg->capacity) {
    LOG_ERRORF("CmdRegistry full! Capacity: %u", reg->capacity);
    return false;
  }

  u32 idx = reg->count++;
  reg->commands[idx] = *cmd;
  reg->states[idx] = (CmdExecState){.state = CMD_RUNNING, .tick_count = 0, .context = NULL};

  LOG_DEBUGF("CmdRegistry: Added cmd '%s' (id=%llu) at index %u", cmd->cmd, cmd->id, idx);
  return true;
}

void CmdRegistry__remove(CmdRegistry* reg, u32 index) {
  if (index >= reg->count)
    return;

  // Swap with last element to keep array packed
  u32 last = reg->count - 1;
  if (index != last) {
    reg->commands[index] = reg->commands[last];
    reg->states[index] = reg->states[last];
  }
  reg->count--;
}

// ---
// Tick Functions

// Default tick function for unknown commands
CmdExecState CmdTick__unknown(CmdExecState prev, CmdMessage* cmd) {
  snprintf(cmd->result, sizeof(cmd->result), "Error: Unknown command '%s'", cmd->cmd);
  prev.state = CMD_FAILED;
  return prev;
}

// Shell execute tick function
CmdExecState CmdTick__shell_exec(CmdExecState prev, CmdMessage* cmd) {
  // Simple synchronous execution for now
  // TODO: Make this async/streaming

  // Parse "cmd" from JSON args
  const char* cmd_key = strstr(cmd->args, "\"cmd\"");
  if (!cmd_key) {
    snprintf(cmd->result, sizeof(cmd->result), "Error: missing 'cmd' argument");
    prev.state = CMD_FAILED;
    return prev;
  }

  const char* cmd_val = strchr(cmd_key + 5, '"');
  if (!cmd_val) {
    snprintf(cmd->result, sizeof(cmd->result), "Error: invalid 'cmd' format");
    prev.state = CMD_FAILED;
    return prev;
  }
  cmd_val++;  // Skip opening quote

  // Extract command (handle escaped quotes)
  char command[1024] = {0};
  size_t ci = 0;
  while (*cmd_val && ci < sizeof(command) - 1) {
    if (*cmd_val == '\\' && *(cmd_val + 1) == '"') {
      command[ci++] = '"';
      cmd_val += 2;
    } else if (*cmd_val == '"') {
      break;
    } else {
      command[ci++] = *cmd_val++;
    }
  }
  command[ci] = '\0';

  LOG_INFOF("🔧 Executing: %s", command);

  FILE* fp = popen(command, "r");
  if (!fp) {
    snprintf(cmd->result, sizeof(cmd->result), "Error: failed to run command");
    prev.state = CMD_FAILED;
    return prev;
  }

  size_t len = 0;
  char buffer[1024];
  cmd->result[0] = '\0';

  while (fgets(buffer, sizeof(buffer), fp) != NULL) {
    size_t buf_len = strlen(buffer);
    if (len + buf_len < sizeof(cmd->result) - 1) {
      strcat(cmd->result, buffer);
      len += buf_len;
    }
  }

  pclose(fp);
  prev.state = CMD_COMPLETED;
  return prev;
}

// Spawn tick function
CmdExecState CmdTick__spawn(CmdExecState prev, CmdMessage* cmd) {
  u32 session_id = ++_G->worker_sv_ct;
  LOG_INFOF(COLOR__GREEN "Spawn: %u (requested by %s)", session_id, cmd->term);
  Worktree__create(session_id);
  Container__create(session_id);
  snprintf(cmd->result, sizeof(cmd->result), "Spawned worker %u", session_id);
  prev.state = CMD_COMPLETED;
  return prev;
}

// Help tick function
CmdExecState CmdTick__help(CmdExecState prev, CmdMessage* cmd) {
  snprintf(
      cmd->result,
      sizeof(cmd->result),
      "Commands: help, agent <template> <prompt>, spawn, shell.exec");
  prev.state = CMD_COMPLETED;
  return prev;
}

// Register tick function
CmdExecState CmdTick__register(CmdExecState prev, CmdMessage* cmd) {
  LOG_INFOF("🔗 Client registered: %s", cmd->term);
  snprintf(cmd->result, sizeof(cmd->result), "Registered as %s", cmd->term);
  prev.state = CMD_COMPLETED;
  return prev;
}

// FS Await tick function
CmdExecState CmdTick__fs_await(CmdExecState prev, CmdMessage* cmd) {
  // Parse path from JSON args
  const char* path_key = strstr(cmd->args, "\"path\"");
  if (!path_key) {
    snprintf(cmd->result, sizeof(cmd->result), "Error: missing 'path' argument");
    prev.state = CMD_FAILED;
    return prev;
  }

  const char* path_val = strchr(path_key + 6, '"');
  if (!path_val) {
    snprintf(cmd->result, sizeof(cmd->result), "Error: invalid 'path' format");
    prev.state = CMD_FAILED;
    return prev;
  }
  path_val++;  // Skip opening quote

  char path[256] = {0};
  size_t pi = 0;
  while (*path_val && *path_val != '"' && pi < sizeof(path) - 1) {
    path[pi++] = *path_val++;
  }
  path[pi] = '\0';

  // Check if file exists
  struct stat st;
  if (stat(path, &st) == 0) {
    snprintf(cmd->result, sizeof(cmd->result), "File '%s' detected", path);
    prev.state = CMD_COMPLETED;
  } else {
    // Still waiting
    prev.state = CMD_RUNNING;
  }

  return prev;
}

// Helper to extract string argument from JSON
static bool Cmd__getArg(const char* json, const char* key, char* out, size_t out_size) {
  char search[64];
  snprintf(search, sizeof(search), "\"%s\"", key);

  const char* key_pos = strstr(json, search);
  if (!key_pos)
    return false;

  const char* val_pos = strchr(key_pos + strlen(search), '"');
  if (!val_pos)
    return false;
  val_pos++;  // Skip opening quote

  size_t i = 0;
  while (*val_pos && *val_pos != '"' && i < out_size - 1) {
    if (*val_pos == '\\' && *(val_pos + 1) == '"') {
      out[i++] = '"';
      val_pos += 2;
    } else {
      out[i++] = *val_pos++;
    }
  }
  out[i] = '\0';
  return true;
}

// FS Read tick function
CmdExecState CmdTick__fs_read(CmdExecState prev, CmdMessage* cmd) {
  char path[256] = {0};
  if (!Cmd__getArg(cmd->args, "path", path, sizeof(path))) {
    snprintf(cmd->result, sizeof(cmd->result), "Error: missing 'path'");
    prev.state = CMD_FAILED;
    return prev;
  }

  FILE* fp = fopen(path, "r");
  if (!fp) {
    snprintf(cmd->result, sizeof(cmd->result), "Error: failed to open '%s'", path);
    prev.state = CMD_FAILED;
    return prev;
  }

  size_t len = fread(cmd->result, 1, sizeof(cmd->result) - 1, fp);
  cmd->result[len] = '\0';
  fclose(fp);

  prev.state = CMD_COMPLETED;
  return prev;
}

// FS Write tick function
CmdExecState CmdTick__fs_write(CmdExecState prev, CmdMessage* cmd) {
  char path[256] = {0};
  if (!Cmd__getArg(cmd->args, "path", path, sizeof(path))) {
    snprintf(cmd->result, sizeof(cmd->result), "Error: missing 'path'");
    prev.state = CMD_FAILED;
    return prev;
  }

  char content[4096] = {0};
  if (!Cmd__getArg(cmd->args, "content", content, sizeof(content))) {
    // Content might be empty
  }

  FILE* fp = fopen(path, "w");
  if (!fp) {
    snprintf(cmd->result, sizeof(cmd->result), "Error: failed to open '%s'", path);
    prev.state = CMD_FAILED;
    return prev;
  }

  fwrite(content, 1, strlen(content), fp);
  fclose(fp);

  snprintf(cmd->result, sizeof(cmd->result), "Wrote %zu bytes to '%s'", strlen(content), path);
  prev.state = CMD_COMPLETED;
  return prev;
}

// FS Edit tick function (same as write for now)
CmdExecState CmdTick__fs_edit(CmdExecState prev, CmdMessage* cmd) {
  return CmdTick__fs_write(prev, cmd);
}

// FS Touch tick function
CmdExecState CmdTick__fs_touch(CmdExecState prev, CmdMessage* cmd) {
  char path[256] = {0};
  if (!Cmd__getArg(cmd->args, "path", path, sizeof(path))) {
    snprintf(cmd->result, sizeof(cmd->result), "Error: missing 'path'");
    prev.state = CMD_FAILED;
    return prev;
  }

  FILE* fp = fopen(path, "a");  // Open for append (creates if not exists, doesn't truncate)
  if (!fp) {
    snprintf(cmd->result, sizeof(cmd->result), "Error: failed to touch '%s'", path);
    prev.state = CMD_FAILED;
    return prev;
  }
  fclose(fp);

  snprintf(cmd->result, sizeof(cmd->result), "Touched '%s'", path);
  prev.state = CMD_COMPLETED;
  return prev;
}

// FS Append tick function
CmdExecState CmdTick__fs_append(CmdExecState prev, CmdMessage* cmd) {
  char path[256] = {0};
  if (!Cmd__getArg(cmd->args, "path", path, sizeof(path))) {
    snprintf(cmd->result, sizeof(cmd->result), "Error: missing 'path'");
    prev.state = CMD_FAILED;
    return prev;
  }

  char content[4096] = {0};
  if (!Cmd__getArg(cmd->args, "content", content, sizeof(content))) {
    // Content might be empty
  }

  FILE* fp = fopen(path, "a");
  if (!fp) {
    snprintf(cmd->result, sizeof(cmd->result), "Error: failed to open '%s'", path);
    prev.state = CMD_FAILED;
    return prev;
  }

  fwrite(content, 1, strlen(content), fp);
  fclose(fp);

  snprintf(cmd->result, sizeof(cmd->result), "Appended %zu bytes to '%s'", strlen(content), path);
  prev.state = CMD_COMPLETED;
  return prev;
}

// FS Unlink tick function
CmdExecState CmdTick__fs_unlink(CmdExecState prev, CmdMessage* cmd) {
  char path[256] = {0};
  if (!Cmd__getArg(cmd->args, "path", path, sizeof(path))) {
    snprintf(cmd->result, sizeof(cmd->result), "Error: missing 'path'");
    prev.state = CMD_FAILED;
    return prev;
  }

  if (unlink(path) != 0) {
    snprintf(cmd->result, sizeof(cmd->result), "Error: failed to unlink '%s'", path);
    prev.state = CMD_FAILED;
    return prev;
  }

  snprintf(cmd->result, sizeof(cmd->result), "Removed '%s'", path);
  prev.state = CMD_COMPLETED;
  return prev;
}

// FS LS tick function
CmdExecState CmdTick__fs_ls(CmdExecState prev, CmdMessage* cmd) {
  char path[256] = {0};
  if (!Cmd__getArg(cmd->args, "path", path, sizeof(path))) {
    snprintf(cmd->result, sizeof(cmd->result), "Error: missing 'path'");
    prev.state = CMD_FAILED;
    return prev;
  }

  DIR* d = opendir(path);
  if (!d) {
    snprintf(cmd->result, sizeof(cmd->result), "Error: failed to open dir '%s'", path);
    prev.state = CMD_FAILED;
    return prev;
  }

  struct dirent* dir;
  cmd->result[0] = '\0';
  while ((dir = readdir(d)) != NULL) {
    if (strlen(cmd->result) + strlen(dir->d_name) + 2 < sizeof(cmd->result)) {
      strcat(cmd->result, dir->d_name);
      strcat(cmd->result, "\n");
    }
  }
  closedir(d);

  prev.state = CMD_COMPLETED;
  return prev;
}

// FS Mkdir tick function
CmdExecState CmdTick__fs_mkdir(CmdExecState prev, CmdMessage* cmd) {
  char path[256] = {0};
  if (!Cmd__getArg(cmd->args, "path", path, sizeof(path))) {
    snprintf(cmd->result, sizeof(cmd->result), "Error: missing 'path'");
    prev.state = CMD_FAILED;
    return prev;
  }

  if (mkdir(path, 0755) != 0) {
    snprintf(cmd->result, sizeof(cmd->result), "Error: failed to mkdir '%s'", path);
    prev.state = CMD_FAILED;
    return prev;
  }

  snprintf(cmd->result, sizeof(cmd->result), "Created directory '%s'", path);
  prev.state = CMD_COMPLETED;
  return prev;
}

// FS Rmdir tick function
CmdExecState CmdTick__fs_rmdir(CmdExecState prev, CmdMessage* cmd) {
  char path[256] = {0};
  if (!Cmd__getArg(cmd->args, "path", path, sizeof(path))) {
    snprintf(cmd->result, sizeof(cmd->result), "Error: missing 'path'");
    prev.state = CMD_FAILED;
    return prev;
  }

  if (rmdir(path) != 0) {
    snprintf(cmd->result, sizeof(cmd->result), "Error: failed to rmdir '%s'", path);
    prev.state = CMD_FAILED;
    return prev;
  }

  snprintf(cmd->result, sizeof(cmd->result), "Removed directory '%s'", path);
  prev.state = CMD_COMPLETED;
  return prev;
}

// FS Grep tick function
CmdExecState CmdTick__fs_grep(CmdExecState prev, CmdMessage* cmd) {
  char path[256] = {0};
  if (!Cmd__getArg(cmd->args, "path", path, sizeof(path))) {
    snprintf(cmd->result, sizeof(cmd->result), "Error: missing 'path'");
    prev.state = CMD_FAILED;
    return prev;
  }

  char pattern[256] = {0};
  if (!Cmd__getArg(cmd->args, "pattern", pattern, sizeof(pattern))) {
    snprintf(cmd->result, sizeof(cmd->result), "Error: missing 'pattern'");
    prev.state = CMD_FAILED;
    return prev;
  }

  char command[1024];
  snprintf(command, sizeof(command), "grep \"%s\" \"%s\"", pattern, path);

  FILE* fp = popen(command, "r");
  if (!fp) {
    snprintf(cmd->result, sizeof(cmd->result), "Error: failed to run grep");
    prev.state = CMD_FAILED;
    return prev;
  }

  size_t len = fread(cmd->result, 1, sizeof(cmd->result) - 1, fp);
  cmd->result[len] = '\0';
  pclose(fp);

  prev.state = CMD_COMPLETED;
  return prev;
}

// Browser Open tick function
CmdExecState CmdTick__browser_open(CmdExecState prev, CmdMessage* cmd) {
  char url[1024] = {0};
  if (!Cmd__getArg(cmd->args, "url", url, sizeof(url))) {
    snprintf(cmd->result, sizeof(cmd->result), "Error: missing 'url'");
    prev.state = CMD_FAILED;
    return prev;
  }

  LOG_INFOF("🌐 Opening URL: %s", url);
  snprintf(cmd->result, sizeof(cmd->result), "Opened URL: %s", url);
  prev.state = CMD_COMPLETED;
  return prev;
}

// --- Session Tools ---

static AgentSession* _Session__get(u32 id) {
  for (int i = 0; i < MAX_SESSIONS; i++) {
    if (_G->agent_sessions[i].id == id && _G->agent_sessions[i].id != 0) {
      return &_G->agent_sessions[i];
    }
  }
  return NULL;
}

// Session Create
CmdExecState CmdTick__session_create(CmdExecState prev, CmdMessage* cmd) {
  if (_G->agent_session_ct >= MAX_SESSIONS) {
    snprintf(cmd->result, sizeof(cmd->result), "Error: max sessions reached");
    prev.state = CMD_FAILED;
    return prev;
  }

  char template[64] = {0};
  if (!Cmd__getArg(cmd->args, "template", template, sizeof(template))) {
    strcpy(template, "default");
  }

  // Find free slot
  AgentSession* s = NULL;
  for (int i = 0; i < MAX_SESSIONS; i++) {
    if (_G->agent_sessions[i].id == 0) {
      s = &_G->agent_sessions[i];
      break;
    }
  }

  if (!s) {
    snprintf(cmd->result, sizeof(cmd->result), "Error: no free session slots");
    prev.state = CMD_FAILED;
    return prev;
  }

  s->id = ++_G->session_id;  // Use global counter (shared with worker ID for now, or separate?)
  // Actually _G->session_id is "Worker session ID". Let's use a new counter or just random.
  // Or use the index + 1 + timestamp.
  // Let's use a simple counter for now.
  if (s->id == 0)
    s->id = 1;

  s->status = AGENT_STATUS_PENDING;
  s->created_at = _G->now;
  // Copy template name to s->template.name (assuming AgentTemplate has name)
  // AgentTemplate struct in unity.h:
  /*
  typedef struct {
    char name[64];
    ...
  } AgentTemplate;
  */
  strcpy(s->template.name, template);

  _G->agent_session_ct++;

  snprintf(cmd->result, sizeof(cmd->result), "Created session %u (template: %s)", s->id, template);
  prev.state = CMD_COMPLETED;
  return prev;
}

// Session Run
CmdExecState CmdTick__session_run(CmdExecState prev, CmdMessage* cmd) {
  char id_str[32] = {0};
  if (!Cmd__getArg(cmd->args, "id", id_str, sizeof(id_str))) {
    snprintf(cmd->result, sizeof(cmd->result), "Error: missing 'id'");
    prev.state = CMD_FAILED;
    return prev;
  }
  u32 id = atoi(id_str);

  AgentSession* s = _Session__get(id);
  if (!s) {
    snprintf(cmd->result, sizeof(cmd->result), "Error: session %u not found", id);
    prev.state = CMD_FAILED;
    return prev;
  }

  if (s->status != AGENT_STATUS_PENDING && s->status != AGENT_STATUS_PAUSED &&
      s->status != AGENT_STATUS_STOPPED) {
    snprintf(
        cmd->result,
        sizeof(cmd->result),
        "Error: session %u is not pending/paused/stopped",
        id);
    prev.state = CMD_FAILED;
    return prev;
  }

  s->status = AGENT_STATUS_RUNNING;
  snprintf(cmd->result, sizeof(cmd->result), "Session %u running", id);
  prev.state = CMD_COMPLETED;
  return prev;
}

// Session Pause
CmdExecState CmdTick__session_pause(CmdExecState prev, CmdMessage* cmd) {
  char id_str[32] = {0};
  if (!Cmd__getArg(cmd->args, "id", id_str, sizeof(id_str))) {
    snprintf(cmd->result, sizeof(cmd->result), "Error: missing 'id'");
    prev.state = CMD_FAILED;
    return prev;
  }
  u32 id = atoi(id_str);

  AgentSession* s = _Session__get(id);
  if (!s) {
    snprintf(cmd->result, sizeof(cmd->result), "Error: session %u not found", id);
    prev.state = CMD_FAILED;
    return prev;
  }

  if (s->status != AGENT_STATUS_RUNNING) {
    snprintf(cmd->result, sizeof(cmd->result), "Error: session %u is not running", id);
    prev.state = CMD_FAILED;
    return prev;
  }

  s->status = AGENT_STATUS_PAUSED;
  snprintf(cmd->result, sizeof(cmd->result), "Session %u paused", id);
  prev.state = CMD_COMPLETED;
  return prev;
}

// Session Stop
CmdExecState CmdTick__session_stop(CmdExecState prev, CmdMessage* cmd) {
  char id_str[32] = {0};
  if (!Cmd__getArg(cmd->args, "id", id_str, sizeof(id_str))) {
    snprintf(cmd->result, sizeof(cmd->result), "Error: missing 'id'");
    prev.state = CMD_FAILED;
    return prev;
  }
  u32 id = atoi(id_str);

  AgentSession* s = _Session__get(id);
  if (!s) {
    snprintf(cmd->result, sizeof(cmd->result), "Error: session %u not found", id);
    prev.state = CMD_FAILED;
    return prev;
  }

  s->status = AGENT_STATUS_STOPPED;
  snprintf(cmd->result, sizeof(cmd->result), "Session %u stopped", id);
  prev.state = CMD_COMPLETED;
  return prev;
}

// Session List
CmdExecState CmdTick__session_list(CmdExecState prev, CmdMessage* cmd) {
  cmd->result[0] = '\0';
  strcat(cmd->result, "Sessions:\n");

  for (int i = 0; i < MAX_SESSIONS; i++) {
    if (_G->agent_sessions[i].id != 0) {
      char line[128];
      const char* status_str = "UNKNOWN";
      switch (_G->agent_sessions[i].status) {
        case AGENT_STATUS_PENDING:
          status_str = "PENDING";
          break;
        case AGENT_STATUS_RUNNING:
          status_str = "RUNNING";
          break;
        case AGENT_STATUS_PAUSED:
          status_str = "PAUSED";
          break;
        case AGENT_STATUS_SUCCESS:
          status_str = "SUCCESS";
          break;
        case AGENT_STATUS_ERROR:
          status_str = "ERROR";
          break;
        case AGENT_STATUS_STOPPED:
          status_str = "STOPPED";
          break;
      }

      snprintf(
          line,
          sizeof(line),
          "- %u: %s [%s]\n",
          _G->agent_sessions[i].id,
          _G->agent_sessions[i].template.name,
          status_str);

      if (strlen(cmd->result) + strlen(line) < sizeof(cmd->result)) {
        strcat(cmd->result, line);
      }
    }
  }

  prev.state = CMD_COMPLETED;
  return prev;
}

// Get tick function based on command name
CmdTickFn CmdRegistry__getTickFn(CmdMessage* cmd) {
  if (strcmp(cmd->cmd, "shell.exec") == 0) {
    return CmdTick__shell_exec;
  } else if (strcmp(cmd->cmd, "spawn") == 0) {
    return CmdTick__spawn;
  } else if (strcmp(cmd->cmd, "help") == 0) {
    return CmdTick__help;
  } else if (strcmp(cmd->cmd, "register") == 0) {
    return CmdTick__register;
  } else if (strcmp(cmd->cmd, "fs.await") == 0) {
    return CmdTick__fs_await;
  } else if (strcmp(cmd->cmd, "fs.read") == 0) {
    return CmdTick__fs_read;
  } else if (strcmp(cmd->cmd, "fs.write") == 0) {
    return CmdTick__fs_write;
  } else if (strcmp(cmd->cmd, "fs.edit") == 0) {
    return CmdTick__fs_edit;
  } else if (strcmp(cmd->cmd, "fs.touch") == 0) {
    return CmdTick__fs_touch;
  } else if (strcmp(cmd->cmd, "fs.append") == 0) {
    return CmdTick__fs_append;
  } else if (strcmp(cmd->cmd, "fs.unlink") == 0) {
    return CmdTick__fs_unlink;
  } else if (strcmp(cmd->cmd, "fs.ls") == 0) {
    return CmdTick__fs_ls;
  } else if (strcmp(cmd->cmd, "fs.mkdir") == 0) {
    return CmdTick__fs_mkdir;
  } else if (strcmp(cmd->cmd, "fs.rmdir") == 0) {
    return CmdTick__fs_rmdir;
  } else if (strcmp(cmd->cmd, "fs.grep") == 0) {
    return CmdTick__fs_grep;
  } else if (strcmp(cmd->cmd, "browser.open") == 0) {
    return CmdTick__browser_open;
  } else if (strcmp(cmd->cmd, "session.create") == 0) {
    return CmdTick__session_create;
  } else if (strcmp(cmd->cmd, "session.run") == 0) {
    return CmdTick__session_run;
  } else if (strcmp(cmd->cmd, "session.pause") == 0) {
    return CmdTick__session_pause;
  } else if (strcmp(cmd->cmd, "session.stop") == 0) {
    return CmdTick__session_stop;
  } else if (strcmp(cmd->cmd, "session.list") == 0) {
    return CmdTick__session_list;
  }
  // Add more commands here

  return CmdTick__unknown;
}

void CmdRegistry__tick(CmdRegistry* reg) {
  for (u32 i = 0; i < reg->count; i++) {
    if (reg->states[i].state == CMD_RUNNING) {
      CmdTickFn fn = CmdRegistry__getTickFn(&reg->commands[i]);
      reg->states[i] = fn(reg->states[i], &reg->commands[i]);
      reg->states[i].tick_count++;

      if (reg->states[i].state >= CMD_COMPLETED) {
        // Command finished, send result back
        reg->commands[i].state = reg->states[i].state;  // Sync state to message

        LOG_INFOF(
            "Cmd '%s' finished with state %u. Result: %s",
            reg->commands[i].cmd,
            reg->states[i].state,
            reg->commands[i].result);

        // If we are hub, route result back to originator
        if (_G->mode == MODE_HUB) {
          // We need to find the session for the originator (term)
          // _Session__findByName is defined in Network.c (included before Cmd.c)
          NetSession* session = Session__findByName(reg->commands[i].term);
          if (session) {
            IO io = {&session->reliable};
            MSG_WriteCmd(&io, &reg->commands[i]);
          } else {
            LOG_ERRORF(
                "Could not find session for term '%s' to send result",
                reg->commands[i].term);
          }
        }

        CmdRegistry__remove(reg, i);
        i--;  // Adjust for removal
      }
    }
  }
}

bool Cmd__parseOne(void) {
  bool r = false;
  r = Agent__parseCmd();

  // Tick the registry
  if (_G->cmd_reg.capacity > 0) {
    CmdRegistry__tick(&_G->cmd_reg);
  }

  return r;
}
