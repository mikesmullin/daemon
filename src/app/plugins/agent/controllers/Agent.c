#pragma once

#include "../../../../unity.h"

// Forward declarations
static bool Agent__executeToolCall(AgentToolCall* tc, char* result, size_t result_size);

// Forward command to hub via network (term mode)
// Command format: "template_name prompt_text"
static bool Agent__forwardCmd(const char* cmd) {
  // Parse command: first token is template name, rest is prompt
  const char* space = strchr(cmd, ' ');
  const char* template_name = cmd;
  const char* prompt = "";
  char template_name_buf[256] = {0};

  if (space) {
    // Extract template name
    size_t template_len = space - cmd;
    if (template_len >= sizeof(template_name_buf)) {
      template_len = sizeof(template_name_buf) - 1;
    }
    memcpy(template_name_buf, cmd, template_len);
    template_name_buf[template_len] = '\0';
    template_name = template_name_buf;

    // Skip spaces and get prompt
    prompt = space + 1;
    while (*prompt == ' ') prompt++;
  } else {
    template_name = cmd;
    prompt = "";
  }

  // For now, send empty template body (hub will load it)
  // In future, we should load the template body from disk here
  const char* template_body = "";

  MSG_SendSessionCreate(&_G->term_cl, "term", template_name, template_body, prompt);
  LOG_DEBUGF("Agent: forwarded session create to hub: template='%s' prompt='%s'", template_name, prompt);
  return true;
}

// Shell execute tool - execute command and return output
static bool Agent__shellExecute(const char* args_json, char* result, size_t result_size) {
  // Parse "command" from JSON args
  // Simple parsing: find "command":"..."
  const char* cmd_key = strstr(args_json, "\"command\"");
  if (!cmd_key) {
    snprintf(result, result_size, "Error: missing 'command' argument");
    return false;
  }

  const char* cmd_val = strchr(cmd_key + 9, '"');
  if (!cmd_val) {
    snprintf(result, result_size, "Error: invalid 'command' format");
    return false;
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

  // Execute command
  FILE* fp = popen(command, "r");
  if (!fp) {
    snprintf(result, result_size, "Error: failed to execute command");
    return false;
  }

  // Read output
  size_t total = 0;
  char buf[256];
  while (fgets(buf, sizeof(buf), fp) && total < result_size - 256) {
    size_t len = strlen(buf);
    memcpy(result + total, buf, len);
    total += len;
  }
  result[total] = '\0';

  int status = pclose(fp);
  if (status != 0) {
    // Append exit code to result
    char exit_msg[64];
    snprintf(exit_msg, sizeof(exit_msg), "\n[exit code: %d]", WEXITSTATUS(status));
    strncat(result, exit_msg, result_size - total - 1);
  }

  LOG_DEBUGF("📤 Result: %.200s%s", result, strlen(result) > 200 ? "..." : "");
  return true;
}

// Dispatch tool to worker or execute locally
// Returns true if tool was dispatched (result filled via batch registry) or executed (result filled now)
static bool Agent__dispatchToolToWorker(
    AgentToolCall* tc,
    AgentTemplate* tmpl,
    Socket* socket,
    u64 batch_id,
    u8 batch_idx,
    u8 batch_total,
    char* result,
    size_t result_size) {
  LOG_DEBUGF("Agent__dispatchToolToWorker: tool='%s' batch_idx=%u/%u socket=%p", tc->name, batch_idx,
             batch_total, socket);

  // Determine if this tool can be dispatched to a worker
  bool is_dispatchable = (strcmp(tc->name, "shell__exec") == 0);

  if (!is_dispatchable) {
    LOG_DEBUGF("Agent__dispatchToolToWorker: tool='%s' cannot be dispatched, executing locally",
               tc->name);
    bool success = Agent__executeToolCall(tc, result, result_size);
    // Still track in batch registry for consistency
    if (success) {
      PendingToolBatch__add(batch_id, batch_idx, batch_total, tc->name, tc->id, _G->now);
      PendingToolBatch__receiveResult(batch_id, batch_idx, result);
    }
    return success;
  }

  // Look for an available worker for this tool
  NetSession* worker = NULL;

  // Find the tool in the template
  AgentTool* tool_cfg = NULL;
  for (u8 t = 0; t < tmpl->metadata.tool_count; t++) {
    if (strcmp(tmpl->metadata.tools[t].name, tc->name) == 0) {
      tool_cfg = &tmpl->metadata.tools[t];
      break;
    }
  }

  if (tool_cfg && tool_cfg->worker_count > 0) {
    // Try each worker configured for this tool
    for (u8 w = 0; w < tool_cfg->worker_count; w++) {
      const char* worker_name = tool_cfg->workers[w];
      LOG_DEBUGF("Agent__dispatchToolToWorker: checking worker '%s' for tool '%s'", worker_name, tc->name);

      worker = Session__findByName(worker_name);
      if (worker && worker->active) {
        LOG_INFOF("Agent__dispatchToolToWorker: found active worker '%s'", worker_name);
        break;
      }
    }
  } else {
    LOG_INFOF("Agent__dispatchToolToWorker: no workers configured for tool '%s'", tc->name);
  }

  // If no worker available, fall back to local execution
  if (!worker || !worker->active) {
    LOG_INFOF(
        "Agent__dispatchToolToWorker: no active worker found, falling back to local execution");
    bool success = Agent__executeToolCall(tc, result, result_size);
    if (success) {
      PendingToolBatch__add(batch_id, batch_idx, batch_total, tc->name, tc->id, _G->now);
      PendingToolBatch__receiveResult(batch_id, batch_idx, result);
    }
    return success;
  }

  // Create dispatch message to send to worker
  LOG_INFOF("Agent__dispatchToolToWorker: dispatching to worker '%s'", worker->name);

  CmdMessage dispatch = {0};
  dispatch.id = _G->now;  // Use timestamp as ID
  strcpy(dispatch.term, "agent");  // Originator is agent (on hub)
  strcpy(dispatch.worker, worker->name);  // Target worker

  // Map tool name to command name (replace __ with .)
  char cmd_name[64];
  strncpy(cmd_name, tc->name, sizeof(cmd_name) - 1);
  char* p = strstr(cmd_name, "__");
  if (p) {
    *p = '.';
    memmove(p + 1, p + 2, strlen(p + 2) + 1);
  }

  strcpy(dispatch.cmd, cmd_name);
  strcpy(dispatch.args, tc->arguments);
  dispatch.state = CMD_PENDING;

  LOG_DEBUGF("Agent__dispatchToolToWorker: cmd='%s' args='%s' batch_id=%llu batch_idx=%u",
             dispatch.cmd, dispatch.args, batch_id, batch_idx);

  // Send dispatch message to worker
  IO io = {&worker->reliable};
  MSG_WriteCmd(&io, &dispatch);

  if (io.err) {
    LOG_ERRORF("Agent__dispatchToolToWorker: failed to send dispatch (io.err=%d)", io.err);
    snprintf(result, result_size, "Error: failed to send dispatch to worker '%s'", worker->name);
    return false;
  }

  LOG_INFOF("Agent__dispatchToolToWorker: dispatch sent, cmd_id=%llu", dispatch.id);

  // Track tool in pending batch registry
  PendingToolBatch__add(batch_id, batch_idx, batch_total, tc->name, tc->id, dispatch.id);
  LOG_DEBUGF("Agent__dispatchToolToWorker: tool tracked in batch (batch_id=%llu)", batch_id);

  // Return placeholder - result will come from worker via message handler
  snprintf(result, result_size, "(dispatched to worker '%s', awaiting result)", worker->name);

  return true;
}

// Execute a single tool call
static bool Agent__executeToolCall(AgentToolCall* tc, char* result, size_t result_size) {
  LOG_INFOF("🔨 Tool Call: %s", tc->name);
  LOG_VERBOSE(VERBOSITY_TOOLS, "[TOOLS] Tool call id=%s", tc->id);
  LOG_VERBOSE(VERBOSITY_TOOLS, "[TOOLS] Tool call params: %s", tc->arguments);
  LOG_DEBUGF("   Args: %s", tc->arguments);

  // Map tool name to Cmd name (replace __ with .)
  char cmd_name[64];
  strncpy(cmd_name, tc->name, sizeof(cmd_name) - 1);
  char* p = strstr(cmd_name, "__");
  if (p) {
    *p = '.';
    memmove(p + 1, p + 2, strlen(p + 2) + 1);
  }

  // Construct CmdMessage
  CmdMessage cmd = {0};
  cmd.id = _G->now;  // Use timestamp as ID
  strncpy(cmd.cmd, cmd_name, sizeof(cmd.cmd) - 1);
  strncpy(cmd.args, tc->arguments, sizeof(cmd.args) - 1);
  strncpy(cmd.term, "agent-local", sizeof(cmd.term) - 1);
  cmd.state = CMD_PENDING;

  // Get Tick Function
  CmdTickFn fn = CmdRegistry__getTickFn(&cmd);

  // Execute synchronously
  CmdExecState state = {.state = CMD_RUNNING, .tick_count = 0, .context = NULL};

  // Loop until completion
  int max_ticks = 10000;  // Safety break (100s at 10ms sleep)
  while (state.state == CMD_RUNNING && max_ticks-- > 0) {
    state = fn(state, &cmd);
    if (state.state == CMD_RUNNING) {
      SleepMs(10);  // 10ms sleep
    }
  }

  if (state.state == CMD_COMPLETED) {
    strncpy(result, cmd.result, result_size - 1);
    return true;
  } else {
    if (cmd.result[0]) {
      strncpy(result, cmd.result, result_size - 1);
    } else {
      snprintf(result, result_size, "Error: tool execution failed (state=%d)", state.state);
    }
    return false;
  }
}

// Build tool definitions from template
static u8 Agent__buildToolDefs(AgentTemplate* tmpl, XAIToolDef* tools, u8 max_tools) {
  u8 count = 0;

  for (u8 i = 0; i < tmpl->metadata.tool_count && count < max_tools; i++) {
    const char* tool_name = tmpl->metadata.tools[i].name;

    if (strcmp(tool_name, "shell__exec") == 0) {
      strncpy(tools[count].name, "shell__exec", sizeof(tools[count].name) - 1);
      strncpy(
          tools[count].description,
          "Execute a shell command and return its output. Use for running system commands, "
          "scripts, or programs.",
          sizeof(tools[count].description) - 1);
      strncpy(
          tools[count].parameters_json,
          "{\"type\":\"object\",\"properties\":{\"cmd\":{\"type\":\"string\",\"description\":"
          "\"The shell command to execute\"}},\"required\":[\"cmd\"]}",
          sizeof(tools[count].parameters_json) - 1);
      count++;
    } else if (strcmp(tool_name, "fs__await") == 0) {
      strncpy(tools[count].name, "fs__await", sizeof(tools[count].name) - 1);
      strncpy(
          tools[count].description,
          "Wait for a file to be created or modified, then read its content. Use for "
          "human-in-the-loop approval or input.",
          sizeof(tools[count].description) - 1);
      strncpy(
          tools[count].parameters_json,
          "{\"type\":\"object\",\"properties\":{\"path\":{\"type\":\"string\",\"description\":"
          "\"File path to watch\"},\"timeout\":{\"type\":\"integer\",\"description\":\"Timeout in "
          "ms (0=indefinite)\"}},\"required\":[\"path\"]}",
          sizeof(tools[count].parameters_json) - 1);
      count++;
    } else if (strcmp(tool_name, "fs__read") == 0) {
      strncpy(tools[count].name, "fs__read", sizeof(tools[count].name) - 1);
      strncpy(tools[count].description, "Read file content.", sizeof(tools[count].description) - 1);
      strncpy(
          tools[count].parameters_json,
          "{\"type\":\"object\",\"properties\":{\"path\":{\"type\":\"string\"}},\"required\":["
          "\"path\"]}",
          sizeof(tools[count].parameters_json) - 1);
      count++;
    } else if (strcmp(tool_name, "fs__write") == 0) {
      strncpy(tools[count].name, "fs__write", sizeof(tools[count].name) - 1);
      strncpy(
          tools[count].description,
          "Write content to file.",
          sizeof(tools[count].description) - 1);
      strncpy(
          tools[count].parameters_json,
          "{\"type\":\"object\",\"properties\":{\"path\":{\"type\":\"string\"},\"content\":{"
          "\"type\":\"string\"}},\"required\":[\"path\",\"content\"]}",
          sizeof(tools[count].parameters_json) - 1);
      count++;
    } else if (strcmp(tool_name, "fs__ls") == 0) {
      strncpy(tools[count].name, "fs__ls", sizeof(tools[count].name) - 1);
      strncpy(
          tools[count].description,
          "List directory contents.",
          sizeof(tools[count].description) - 1);
      strncpy(
          tools[count].parameters_json,
          "{\"type\":\"object\",\"properties\":{\"path\":{\"type\":\"string\"}},\"required\":["
          "\"path\"]}",
          sizeof(tools[count].parameters_json) - 1);
      count++;
    } else if (strcmp(tool_name, "browser__open") == 0) {
      strncpy(tools[count].name, "browser__open", sizeof(tools[count].name) - 1);
      strncpy(
          tools[count].description,
          "Open URL in browser.",
          sizeof(tools[count].description) - 1);
      strncpy(
          tools[count].parameters_json,
          "{\"type\":\"object\",\"properties\":{\"url\":{\"type\":\"string\"}},\"required\":["
          "\"url\"]}",
          sizeof(tools[count].parameters_json) - 1);
      count++;
    }
    // Add more tools here as needed
  }

  return count;
}

// Run agent loop with template and user prompt
// socket: optional socket for streaming events (NULL = just log locally)
// Public function for use from Network.c
bool Agent__runLoop(const char* template_name, const char* user_prompt, Socket* socket) {
  // CRITICAL: Validate parameters immediately at function entry
  // This helps detect ARM64 calling convention issues
  // Use volatile to force writes to memory
  volatile const char* vtemplate = template_name;
  volatile const char* vprompt = user_prompt;
  volatile Socket* vsocket = socket;

  fflush(stdout);
  fflush(stderr);

  LOG_TRACE;
  LOG_INFOF("*** Agent__runLoop ENTRY BEGIN (ARM64) ***");
  LOG_DEBUGF("Agent__runLoop: IMMEDIATE parameter check:");
  LOG_DEBUGF("  vtemplate=%p, vprompt=%p, vsocket=%p", vtemplate, vprompt, vsocket);

  fflush(stdout);
  fflush(stderr);

  LOG_DEBUGF("Agent__runLoop: raw parameters received:");
  LOG_DEBUGF("  template_name pointer=%p", template_name);
  LOG_DEBUGF("  user_prompt pointer=%p", user_prompt);
  LOG_DEBUGF("  socket pointer=%p", socket);

  // Try to dereference and validate
  if (template_name) {
    LOG_DEBUGF("  template_name[0]='%c' (char validation)", template_name[0]);
    LOG_DEBUGF("  template_name length check - strlen=%zu", strlen(template_name));
  } else {
    LOG_ERRORF("ERROR: template_name is NULL!");
  }

  if (user_prompt) {
    LOG_DEBUGF("  user_prompt[0]='%c' (char validation)", user_prompt[0]);
    LOG_DEBUGF("  user_prompt length check - strlen=%zu", strlen(user_prompt));
  } else {
    LOG_ERRORF("ERROR: user_prompt is NULL!");
  }

  if (socket) {
    LOG_DEBUGF("  socket is non-NULL (expected for this call)");
  } else {
    LOG_INFOF("  socket is NULL (logging only, no streaming)");
  }

  LOG_DEBUGF("Agent__runLoop: Parameter validation complete, continuing...");
  LOG_DEBUGF(
      "Agent__runLoop: START template_name='%s' user_prompt='%.100s' socket=%p",
      template_name,
      user_prompt,
      socket);

  // CRITICAL FIX FOR ARM64:
  // AgentTemplate is ~5.5MB and was being allocated on the STACK, causing stack exhaustion
  // on ARM64 when combined with other large local variables in calling function.
  // Now allocating on HEAP to prevent stack corruption.
  LOG_DEBUGF(
      "Agent__runLoop: Allocating AgentTemplate on heap (sizeof=%zu bytes)",
      sizeof(AgentTemplate));
  AgentTemplate* tmpl = (AgentTemplate*)malloc(sizeof(AgentTemplate));
  if (!tmpl) {
    LOG_ERRORF("Failed to allocate AgentTemplate on heap");
    if (socket)
      MSG_SendAgentError(socket, "Memory allocation failed");
    return false;
  }
  memset(tmpl, 0, sizeof(AgentTemplate));

  // Load template
  LOG_DEBUGF(
      "Agent__runLoop: About to call AgentTemplate__load_by_name, template_name='%s'",
      template_name);
  bool loaded = AgentTemplate__load_by_name(tmpl, template_name);
  LOG_DEBUGF("Agent__runLoop: AgentTemplate__load_by_name returned, loaded=%d", loaded);

  if (!loaded) {
    LOG_ERRORF("Failed to load template: %s", template_name);
    if (socket)
      MSG_SendAgentError(socket, "Failed to load template");
    LOG_DEBUGF("Agent__runLoop: Returning false due to template load failure");
    free(tmpl);
    return false;
  }
  LOG_DEBUGF("Agent__runLoop: Template loaded successfully, name='%s'", tmpl->metadata.name);
  LOG_VERBOSE(
      VERBOSITY_SESSION,
      "[SESSION] State transition: INITIALIZED -> READY (template loaded: %s)",
      tmpl->metadata.name);

  LOG_INFOF("🤖 Agent: %s (model: %s)", tmpl->metadata.name, tmpl->metadata.model);
  if (socket)
    MSG_SendAgentStart(socket, tmpl->metadata.name, tmpl->metadata.model);

  // Extract model name (format: provider:model)
  const char* model = tmpl->metadata.model;
  const char* colon = strchr(model, ':');
  if (colon) {
    model = colon + 1;  // Skip provider prefix
  }
  // Remove any trailing comments (e.g., "model # comment")
  char model_clean[64] = {0};
  for (size_t i = 0; i < sizeof(model_clean) - 1 && model[i] && model[i] != '#' && model[i] != ' ';
       i++) {
    model_clean[i] = model[i];
  }

  // Build tool definitions
  XAIToolDef tools[16] = {0};
  u8 tool_count = Agent__buildToolDefs(tmpl, tools, 16);
  LOG_INFOF("  Tools: %u", tool_count);

// Build messages array (on heap, too large for stack)
// Note: Using smaller limit to reduce memory usage
#define AGENT_LOOP_MAX_MESSAGES (32)
  AgentMessage* messages = (AgentMessage*)calloc(AGENT_LOOP_MAX_MESSAGES, sizeof(AgentMessage));
  if (!messages) {
    LOG_ERRORF("Failed to allocate messages array");
    free(tmpl);
    return false;
  }
  LOG_DEBUGF("Agent__runLoop: allocated messages array at %p", messages);
  u16 msg_count = 0;

  // System message
  if (tmpl->spec.system_prompt[0]) {
    messages[msg_count].role = MSG_ROLE_SYSTEM;
    strncpy(
        messages[msg_count].content,
        tmpl->spec.system_prompt,
        sizeof(messages[msg_count].content) - 1);
    msg_count++;
  }

  // User message
  messages[msg_count].role = MSG_ROLE_USER;
  strncpy(messages[msg_count].content, user_prompt, sizeof(messages[msg_count].content) - 1);
  msg_count++;

  LOG_INFOF("👦 User: %s", user_prompt);

  // Agent loop
  int max_iterations = 10;  // Prevent infinite loops
  for (int iter = 0; iter < max_iterations; iter++) {
    LOG_VERBOSE(
        VERBOSITY_SESSION,
        "[SESSION] Loop iteration %d: %u messages, %u tools",
        iter,
        msg_count,
        tool_count);
    LOG_DEBUGF("Agent loop iteration %d, msg_count=%u", iter, msg_count);

    // Call XAI
    LOG_TRACE;
    LOG_VERBOSE(
        VERBOSITY_XAI,
        "[XAI] Iteration %d: Calling LLM with %u messages, %u tools",
        iter,
        msg_count,
        tool_count);
    LOG_DEBUGF(
        "Agent__runLoop: Pre-XAI__chat - Iteration %d, msg_count=%u, tool_count=%u",
        iter,
        msg_count,
        tool_count);
    LOG_DEBUGF("Agent__runLoop: About to call XAI__chat with model='%s'", model_clean);
    LOG_DEBUGF("  model_clean pointer=%p, strlen=%zu", model_clean, strlen(model_clean));
    LOG_DEBUGF("  messages pointer=%p, msg_count=%u", messages, msg_count);
    LOG_DEBUGF("  tools pointer=%p, tool_count=%u", tools, tool_count);

    XAIResponse resp =
        XAI__chat(model_clean, messages, msg_count, tool_count > 0 ? tools : NULL, tool_count);

    LOG_TRACE;
    LOG_DEBUGF("Agent__runLoop: XAI__chat returned successfully");
    LOG_VERBOSE(
        VERBOSITY_XAI,
        "[XAI] Response: finish_reason=%d, tool_calls=%u, tokens=(prompt:%u, completion:%u)",
        resp.finish_reason,
        resp.message.tool_call_count,
        resp.prompt_tokens,
        resp.completion_tokens);
    LOG_DEBUGF("  resp.success=%d", resp.success);
    LOG_DEBUGF("  resp.finish_reason=%d", resp.finish_reason);
    LOG_DEBUGF("  resp.message.tool_call_count=%u", resp.message.tool_call_count);
    LOG_DEBUGF(
        "  resp.prompt_tokens=%u, resp.completion_tokens=%u",
        resp.prompt_tokens,
        resp.completion_tokens);

    if (!resp.success) {
      LOG_ERRORF("XAI error: %s", resp.error);
      if (socket)
        MSG_SendAgentError(socket, resp.error);
      free(messages);
      free(tmpl);
      return false;
    }

    // Add assistant message to history
    memcpy(&messages[msg_count], &resp.message, sizeof(AgentMessage));
    msg_count++;

    // Check if we have tool calls
    if (resp.finish_reason == FINISH_REASON_TOOL_CALLS && resp.message.tool_call_count > 0) {
      LOG_INFOF("🔧 Tool calls: %u", resp.message.tool_call_count);
      LOG_VERBOSE(VERBOSITY_TOOLS, "[TOOLS] LLM invoked %u tools", resp.message.tool_call_count);
      LOG_DEBUGF("Agent__runLoop: Processing %u tool calls", resp.message.tool_call_count);

      // Execute each tool call
      // Create batch ID from current timestamp
      u64 batch_id = _G->unow;
      LOG_DEBUGF("Agent__runLoop: Processing batch of %u tools (batch_id=%llu)",
                 resp.message.tool_call_count, batch_id);

      for (u8 tc = 0; tc < resp.message.tool_call_count; tc++) {
        AgentToolCall* call = &resp.message.tool_calls[tc];

        // Stream tool call event
        LOG_VERBOSE(VERBOSITY_TOOLS, "[TOOLS] Executing tool: %s", call->name);
        LOG_DEBUGF(
            "Agent__runLoop: Tool call #%u/%u name='%s' args_len=%zu socket=%p",
            tc + 1,
            resp.message.tool_call_count,
            call->name,
            strlen(call->arguments),
            socket);
        if (socket)
          MSG_SendAgentToolCall(socket, call->name, call->arguments);
        LOG_DEBUGF("Agent__runLoop: MSG_SendAgentToolCall completed for tool='%s'", call->name);

        char result[4096] = {0};
        // Use dispatcher to decide: send to worker or execute locally
        // Pass batch info for tracking (batch_id, batch_idx, batch_total)
        Agent__dispatchToolToWorker(call, tmpl, socket, batch_id, tc, resp.message.tool_call_count,
                                    result, sizeof(result));
        LOG_VERBOSE(
            VERBOSITY_TOOLS,
            "[TOOLS] Tool result id=%s response_len=%zu",
            call->id,
            strlen(result));
        LOG_VERBOSE(VERBOSITY_TOOLS, "[TOOLS] Tool result: %s", result);
        LOG_DEBUGF("Agent__runLoop: Tool execution completed, result_len=%zu", strlen(result));

        // Stream tool result event
        if (socket)
          MSG_SendAgentToolResult(socket, call->name, result);

        // Add tool result message
        messages[msg_count].role = MSG_ROLE_TOOL;
        strncpy(
            messages[msg_count].tool_call_id,
            resp.message.tool_calls[tc].id,
            sizeof(messages[msg_count].tool_call_id) - 1);
        strncpy(messages[msg_count].content, result, sizeof(messages[msg_count].content) - 1);
        msg_count++;

        if (msg_count >= AGENT_LOOP_MAX_MESSAGES - 2) {
          LOG_ERRORF("Message limit reached");
          free(messages);
          free(tmpl);
          return false;
        }
      }
      // Continue loop to get next response
      continue;
    }

    // No tool calls - check finish reason
    if (resp.finish_reason == FINISH_REASON_STOP) {
      // Final response (always show)
      if (resp.message.content[0]) {
        LOG_INFOF("🤖 Assistant: %s", resp.message.content);
        if (socket)
          MSG_SendAgentAssistant(socket, resp.message.content);
      }
      LOG_VERBOSE(
          VERBOSITY_SESSION,
          "[SESSION] State transition: RUNNING -> COMPLETE (tokens used: %u prompt, %u completion)",
          resp.prompt_tokens,
          resp.completion_tokens);
      LOG_INFOF(
          "✅ Session complete (tokens: %u prompt, %u completion)",
          resp.prompt_tokens,
          resp.completion_tokens);
      if (socket)
        MSG_SendAgentComplete(socket, resp.prompt_tokens, resp.completion_tokens);
      LOG_DEBUGF("Agent__runLoop: Returning true (success)");
      free(messages);
      free(tmpl);
      return true;
    }

    // Other finish reason - print content and continue (only show at verbosity >= TOOLS)
    if (resp.message.content[0] && VERBOSITY_CHECK(VERBOSITY_TOOLS)) {
      LOG_INFOF(COLOR__PINK "🤖 Assistant: %s" COLOR__RESET, resp.message.content);
      if (socket)
        MSG_SendAgentAssistant(socket, resp.message.content);
    }
  }

  LOG_ERRORF("Max iterations reached");
  if (socket)
    MSG_SendAgentError(socket, "Max iterations reached");
  LOG_DEBUGF("Agent__runLoop: Returning false (max iterations)");
  free(messages);
  free(tmpl);
  return false;
}

// Check if command is a tool/session command (session.*, fs.*, shell.*, browser.*)
static bool Agent__isToolCmd(const char* cmd) {
  return cstr__eq(8, cmd, "session.") || cstr__eq(3, cmd, "fs.") || cstr__eq(6, cmd, "shell.") ||
         cstr__eq(8, cmd, "browser.");
}

// Execute a tool command locally via CmdRegistry
static bool Agent__execToolCmd(const char* cmd_str) {
  // Parse "cmd.name arg1: val1, arg2: val2" into CmdMessage
  CmdMessage cmd = {0};
  cmd.id = _G->unow;
  strncpy(cmd.term, "local", sizeof(cmd.term) - 1);
  strcpy(cmd.worker, "hub");
  cmd.state = CMD_PENDING;

  // Find first space to separate command from args
  const char* space = strchr(cmd_str, ' ');
  if (space) {
    size_t cmd_len = space - cmd_str;
    if (cmd_len >= sizeof(cmd.cmd))
      cmd_len = sizeof(cmd.cmd) - 1;
    memcpy(cmd.cmd, cmd_str, cmd_len);
    cmd.cmd[cmd_len] = '\0';

    // Parse YAML flow args into JSON
    const char* args = space + 1;
    while (*args == ' ') args++;
    Yaml__flowToJson(args, cmd.args, sizeof(cmd.args));
  } else {
    strncpy(cmd.cmd, cmd_str, sizeof(cmd.cmd) - 1);
    strcpy(cmd.args, "{}");
  }

  // Execute via tick function
  CmdTickFn fn = CmdRegistry__getTickFn(&cmd);
  CmdExecState state = {.state = CMD_RUNNING, .tick_count = 0, .context = NULL};

  int max_ticks = 1000;
  while (state.state == CMD_RUNNING && max_ticks-- > 0) {
    state = fn(state, &cmd);
    if (state.state == CMD_RUNNING) {
      SleepMs(10);
    }
  }

  if (state.state == CMD_COMPLETED) {
    printf("%s\n", cmd.result);
    return true;
  } else {
    printf("Error: %s\n", cmd.result);
    return true;
  }
}

bool Agent__parseCmd(void) {
  // Help is always handled locally
  if (cstr__eq(5, _G->prompt, "help")) {
    printf("\n");
    printf(COLOR__PINK "👺 Daemon v4" COLOR__RESET "\n\n");
    printf(COLOR__YELLOW "Usage:" COLOR__RESET "\n");
    printf("  d4 [-v] [-r/--role <role>] [-h/--hub <hub>]\n");
    printf("     [-t/--template <template.yaml>] [-d/--data <yaml_data>]\n");
    printf("     [-s/--session <node:session_id>] <prompt...>\n");
    printf("\n");
    printf(COLOR__YELLOW "Flags:" COLOR__RESET "\n");
    printf("  -r, --role <hub|term|worker>  Node role (default: hub)\n");
    printf("  -h, --hub <ipv4:port>         Hub address (term/worker required)\n");
    printf("  -t, --template <file.yaml>    Agent template file\n");
    printf("  -d, --data <yaml_data>        EJS template data (requires -t)\n");
    printf("  -s, --session <node:id>       Resume existing session\n");
    printf("  -v                            Verbosity (-v, -vv, ..., -vvvvvv)\n");
    printf("\n");
    printf(COLOR__YELLOW "Constraints:" COLOR__RESET "\n");
    printf("  • If role is worker/term, -h is required\n");
    printf("  • If -t or -s is used, <prompt> is required\n");
    printf("  • If -d is used, -t is required\n");
    printf("  • If -s is used, -t is forbidden\n");
    printf("\n");
    return true;
  }

  // In term mode, forward commands to hub (both oneshot and interactive)
  // In hub mode, execute locally
  bool isTerm = (_G->mode == MODE_TERM);

  // Handle tool/session commands (session.*, fs.*, shell.*, browser.*)
  if (Agent__isToolCmd(_G->prompt)) {
    if (isTerm) {
      // Forward to hub via network
      return Agent__forwardCmd(_G->prompt);
    }
    // Execute locally on hub
    return Agent__execToolCmd(_G->prompt);
  }

  if (cstr__eq(6, _G->prompt, "spawn")) {
    if (isTerm) {
      return Agent__forwardCmd(_G->prompt);
    }
    // Execute locally (hub mode or oneshot)
    u32 session_id = ++_G->worker_sv_ct;
    LOG_INFOF("Spawn: %u", session_id);
    Worktree__create(session_id);
    Container__create(session_id);
    return true;
  }

  // Fallback: treat as prompt for default template (with -t flag or 'home')
  if (_G->prompt[0] && _G->default_template[0]) {
    const char* prompt_text = _G->prompt;

    if (isTerm) {
      // Forward to hub with template
      char fwd_cmd[1280];
      snprintf(fwd_cmd, sizeof(fwd_cmd), "%s %s", _G->default_template, prompt_text);
      strncpy(_G->prompt, fwd_cmd, sizeof(_G->prompt) - 1);
      return Agent__forwardCmd(_G->prompt);
    }

    // Execute locally (hub mode)
    return Agent__runLoop(_G->default_template, prompt_text, NULL);
  }

  return false;
}
