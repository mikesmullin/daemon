#pragma once

#include "../../../../unity.h"

// ---
// @class Message Frames (MSG)
// transit and storage of data streams
// see: `ai/docs/NET_MSGS.md`
//
// Function | Purpose
// --- | ---
// MSG_WriteCmd(io, msg) | serialize CmdMessage to IO buffer
// MSG_ReadCmd(io, msg) | deserialize CmdMessage from IO buffer
// MSG_ReadStdin(io, buf, maxlen) | read CL_STDIN payload into buffer
// MSG_ReadStdout(io, buf, maxlen) | read SV_STDOUT payload into buffer
//
// MSG_WriteFrame(io, nframe, key, nonce) | encrypt and write NetFrame to IO
// MSG_ReadFrame(io, nframe, key, nonce) | decrypt and read NetFrame from IO
// MSG_PrintFrame(label, nframe) | debug print NetFrame contents
//
// MSG_SendCmdRequest(socket, sender_name, cmd) | send command request from term to hub
// MSG_SendCmdResponse(socket, request, result) | send command response from hub to term
// MSG_SendAgentStart(socket, template_name, model) | emit agent session started event
// MSG_SendAgentToolCall(socket, tool_name, arguments) | emit tool invocation event
// MSG_SendAgentToolResult(socket, tool_name, result) | emit tool result event
// MSG_SendAgentAssistant(socket, content) | emit assistant message event
// MSG_SendAgentComplete(socket, prompt_tokens, ...) | emit session complete event
// MSG_SendAgentError(socket, error) | emit error event
// MSG_SendAgentRequest(socket, template_name, ...) | hub requests worker to run agent

// serialize CmdMessage to IO buffer
void MSG_WriteCmd(IO* io, CmdMessage* msg) {
  IO_WriteU8(io, MSG_CMD);
  IO_WriteU64(io, msg->id);
  IO_WriteU64(io, msg->parent_id);
  IO_WriteStr8(io, &(Str8){msg->term, strlen(msg->term)});
  IO_WriteStr8(io, &(Str8){msg->worker, strlen(msg->worker)});
  IO_WriteStr8(io, &(Str8){msg->cmd, strlen(msg->cmd)});
  IO_WriteStr8(io, &(Str8){msg->args, strlen(msg->args)});
  IO_WriteStr8(io, &(Str8){msg->result, strlen(msg->result)});
  IO_WriteU8(io, msg->state);
  IO_WriteU8(io, msg->progress);
}

void MSG_ReadCmd(IO* io, CmdMessage* msg) {
  IO_ReadU64(io, &msg->id);
  IO_ReadU64(io, &msg->parent_id);

  IO_ReadStr8Buf(io, msg->term, sizeof(msg->term));
  IO_ReadStr8Buf(io, msg->worker, sizeof(msg->worker));
  IO_ReadStr8Buf(io, msg->cmd, sizeof(msg->cmd));
  IO_ReadStr8Buf(io, msg->args, sizeof(msg->args));
  IO_ReadStr8Buf(io, msg->result, sizeof(msg->result));

  IO_ReadU8(io, &msg->state);
  IO_ReadU8(io, &msg->progress);
}

// Read CL_STDIN payload into buffer, returns length read
u32 MSG_ReadStdin(IO* io, char* buf, u32 maxlen) {
  return IO_ReadStr8Buf(io, buf, maxlen);
}

// Read SV_STDOUT payload into buffer, returns length read
u32 MSG_ReadStdout(IO* io, char* buf, u32 maxlen) {
  return IO_ReadStr8Buf(io, buf, maxlen);
}

void MSG_WriteFrame(IO* io, NetFrame* nframe, u8* key, u8* nonce) {
  // 1. Calculate CRC on plaintext fields
  u8 plaintext[SOCKET_BUF_SIZE];
  IO p_io = {&(RingBuffer){plaintext, sizeof(plaintext)}};
  IO_WriteU8(&p_io, nframe->flags);
  IO_WriteU8(&p_io, nframe->seq);
  IO_WriteU8(&p_io, nframe->ack);
  IO_WriteU8(&p_io, nframe->qport);
  if (!(nframe->flags & NFRAME_EMPTY_ACK)) {
    IO_WriteBytes(&p_io, nframe->data, nframe->len);

    nframe->crc = CRC32__checksum(plaintext, p_io.written);
    IO_WriteU32(&p_io, nframe->crc);
  }

  u32 encrypted_len = p_io.written;

  if (VERBOSITY_CHECK(VERBOSITY_NETWORK)) {
    char hex_cleartext[512] = {0};
    hexdump(
        plaintext,
        (encrypted_len > 256) ? 256 : encrypted_len,
        hex_cleartext,
        sizeof(hex_cleartext));
    LOG_VERBOSE(
        VERBOSITY_NETWORK,
        "[NETWORK] Packet send (cleartext, before encrypt):\n%s",
        hex_cleartext);
  }

  // 2. Encrypt
  ChaCha20 ctx;
  ChaCha__setup(&ctx, key, 32, nonce);
  ChaCha__encrypt(&ctx, plaintext, plaintext, encrypted_len);

  if (VERBOSITY_CHECK(VERBOSITY_NETWORK)) {
    char hex_ciphertext[512] = {0};
    hexdump(
        plaintext,
        (encrypted_len > 256) ? 256 : encrypted_len,
        hex_ciphertext,
        sizeof(hex_ciphertext));
    LOG_VERBOSE(
        VERBOSITY_NETWORK,
        "[NETWORK] Packet send (ciphertext, after encrypt):\n%s",
        hex_ciphertext);
  }

  // 3. Write to output IO
  IO_WriteVInt32(io, encrypted_len, false);
  IO_WriteBytes(io, plaintext, encrypted_len);
}

void MSG_ReadFrame(IO* io, NetFrame* nframe, u8* key, u8* nonce) {
  VInt32 enc_len_v = {0};
  IO_ReadVInt32(io, &enc_len_v);
  if (io->err)
    return;

  u32 enc_len = enc_len_v.value.u;
  if (enc_len < 4) {
    io->err = -1;
    return;
  }
  u8 encrypted[SOCKET_BUF_SIZE];
  IO_ReadBytes(io, encrypted, enc_len);
  if (io->err)
    return;

  if (VERBOSITY_CHECK(VERBOSITY_NETWORK)) {
    char hex_ciphertext[512] = {0};
    hexdump(encrypted, (enc_len > 256) ? 256 : enc_len, hex_ciphertext, sizeof(hex_ciphertext));
    LOG_VERBOSE(
        VERBOSITY_NETWORK,
        "[NETWORK] Packet recv (ciphertext, before decrypt):\n%s",
        hex_ciphertext);
  }

  // Decrypt
  ChaCha20 ctx;
  ChaCha__setup(&ctx, key, 32, nonce);
  ChaCha__encrypt(&ctx, encrypted, encrypted, enc_len);

  if (VERBOSITY_CHECK(VERBOSITY_NETWORK)) {
    char hex_cleartext[512] = {0};
    hexdump(encrypted, (enc_len > 256) ? 256 : enc_len, hex_cleartext, sizeof(hex_cleartext));
    LOG_VERBOSE(
        VERBOSITY_NETWORK,
        "[NETWORK] Packet recv (cleartext, after decrypt):\n%s",
        hex_cleartext);
  }

  // Parse decrypted - set up RingBuffer with head=enc_len so data is readable
  // RingBuffer format: {data, sz, head, tail}
  RingBuffer dec_rb = {encrypted, (u16)(enc_len + 1), (u16)enc_len, 0};
  IO d_io = {&dec_rb};

  IO_ReadU8(&d_io, &nframe->flags);
  IO_ReadU8(&d_io, &nframe->seq);
  IO_ReadU8(&d_io, &nframe->ack);
  IO_ReadU8(&d_io, &nframe->qport);

  if (nframe->flags & NFRAME_EMPTY_ACK) {
    nframe->len = 0;
  } else {
    u32 remain = enc_len - 4;
    if (remain < 4) {
      io->err = -1;
      return;
    }
    nframe->len = remain - 4;
    IO_ReadBytes(&d_io, nframe->data, nframe->len);
    IO_ReadU32(&d_io, &nframe->crc);
  }

  // Verify CRC
  if (!(nframe->flags & NFRAME_EMPTY_ACK)) {
    u8 verify_buf[SOCKET_BUF_SIZE];
    IO v_io = {&(RingBuffer){verify_buf, sizeof(verify_buf)}};
    IO_WriteU8(&v_io, nframe->flags);
    IO_WriteU8(&v_io, nframe->seq);
    IO_WriteU8(&v_io, nframe->ack);
    IO_WriteU8(&v_io, nframe->qport);
    IO_WriteBytes(&v_io, nframe->data, nframe->len);

    u32 calculated_crc = CRC32__checksum(verify_buf, v_io.written);
    if (calculated_crc != nframe->crc) {
      io->err = -1;  // CRC mismatch
      LOG_DEBUGF("CRC mismatch: expected %08x, got %08x", nframe->crc, calculated_crc);
    }
  }
}

void MSG_PrintFrame(char* label, NetFrame* nframe) {
  // LOG_DEBUGF(
  //     "NetFrame %s: "
  //     "  flags: %u%u%u%u %u%u%u%u "
  //     "  seq: %u "
  //     "  ack: %u "
  //     "  qport: %u "
  //     "  len: %u "
  //     "  crc: %08x "
  //     "  data:\n%s",
  //     label,
  //     nframe->flags >> 7 & 1,
  //     nframe->flags >> 6 & 1,
  //     nframe->flags >> 5 & 1,
  //     nframe->flags >> 4 & 1,
  //     nframe->flags >> 3 & 1,
  //     nframe->flags >> 2 & 1,
  //     nframe->flags >> 1 & 1,
  //     nframe->flags >> 0 & 1,
  //     nframe->seq,
  //     nframe->ack,
  //     nframe->qport,
  //     nframe->len,
  //     nframe->crc,
  //     "(coming soon)");
}

// Parse `target: <name>` from YAML flow args and return worker name
// Returns pointer to target name in static buffer, or NULL if not found
static const char* _parseTarget(const char* cmd) {
  static char target_buf[64];
  const char* target = strstr(cmd, "target:");
  if (!target) {
    target = strstr(cmd, "target :");  // allow space before colon
  }
  if (!target)
    return NULL;

  // Skip "target:" or "target :"
  const char* val = target + 7;
  while (*val == ' ' || *val == ':') val++;

  // Extract value (until comma, space, or end)
  size_t i = 0;
  while (*val && *val != ',' && *val != ' ' && *val != '\n' && i < sizeof(target_buf) - 1) {
    target_buf[i++] = *val++;
  }
  target_buf[i] = '\0';

  return target_buf[0] ? target_buf : NULL;
}

// Send a command request from term to hub
// Format: [MSG_CMD][CmdMessage]
// Parses `target: <worker>` from cmd to route to specific worker
// Parses command name and YAML flow args separately
void MSG_SendCmdRequest(Socket* socket, const char* sender_name, const char* cmd) {
  IO io = {&socket->reliable};

  CmdMessage msg = {0};
  msg.id = _G->unow;  // Use timestamp as ID
  strncpy(msg.term, sender_name, sizeof(msg.term) - 1);
  msg.state = CMD_PENDING;

  // Parse command name (before first space) and args (after first space)
  const char* space = strchr(cmd, ' ');
  if (space) {
    size_t cmd_len = space - cmd;
    if (cmd_len >= sizeof(msg.cmd))
      cmd_len = sizeof(msg.cmd) - 1;
    memcpy(msg.cmd, cmd, cmd_len);
    msg.cmd[cmd_len] = '\0';

    // Parse YAML flow args into JSON
    const char* args = space + 1;
    while (*args == ' ') args++;
    Yaml__flowToJson(args, msg.args, sizeof(msg.args));
  } else {
    strncpy(msg.cmd, cmd, sizeof(msg.cmd) - 1);
    strcpy(msg.args, "{}");
  }

  // CODE_REVIEW: I feel the target parsing should happen higher in the stack (before MSG_SendCmdRequest)
  // Parse target from YAML flow args (reserved keyword)
  const char* target = _parseTarget(cmd);
  // CODE_REVIEW: (double-check/verify) even though we are (eventually) routing to a target, we are always routing via the hub
  // CODE_REVIEW: (verify) target is contextual to the lifetime of a command, not the lifetime of a single command message. a command message may be sent as a request, and have a paired response. but the lifetime of the command itself spans both request and response, however target only affects the destination of the request.
  if (target && strcmp(target, "hub") != 0) {
    strncpy(msg.worker, target, sizeof(msg.worker) - 1);
    LOG_INFOF("MSG_SendCmdRequest: routing to worker '%s'", target);
  } else {
    strcpy(msg.worker, "hub");  // Default to hub
  }

  MSG_WriteCmd(&io, &msg);

  ASSERT_CONTEXT(!io.err, "client error writing cmd request. %d", io.err);
  LOG_VERBOSE(
      VERBOSITY_MESSAGE,
      "[MESSAGE] CmdRequest sent: id=%llu sender=%s cmd=%s target=%s",
      msg.id,
      sender_name,
      msg.cmd,
      msg.worker);
  LOG_DEBUGF(
      "MSG_SendCmdRequest: sender='%s' cmd='%s' args='%s' target='%s' id=%llu",
      sender_name,
      msg.cmd,
      msg.args,
      msg.worker,
      msg.id);
}

// Send a command response from hub to term
// Format: [MSG_CMD][CmdMessage]
void MSG_SendCmdResponse(Socket* socket, CmdMessage* request, const char* result) {
  IO io = {&socket->reliable};

  CmdMessage response = *request;
  strncpy(response.result, result, sizeof(response.result) - 1);
  response.state = CMD_COMPLETED;
  response.progress = 100;

  MSG_WriteCmd(&io, &response);

  ASSERT_CONTEXT(!io.err, "server error writing cmd response. %d", io.err);
  LOG_DEBUGF("MSG_SendCmdResponse: result='%s'", result);
}

// ---
// Session Creation (RFC 0004)

// Send session create request from term to hub
// Format: [CL_SESSION_CREATE][template_name:Str8][template_body:Str8][prompt:Str8]
void MSG_SendSessionCreate(
    Socket* socket,
    const char* sender_name,
    const char* template_name,
    const char* template_body,
    const char* prompt) {
  IO io = {&socket->reliable};

  IO_WriteU8(&io, CL_SESSION_CREATE);
  IO_WriteStr8(&io, &(Str8){(char*)template_name, strlen(template_name)});
  IO_WriteStr8(&io, &(Str8){(char*)template_body, strlen(template_body)});
  IO_WriteStr8(&io, &(Str8){(char*)prompt, strlen(prompt)});

  ASSERT_CONTEXT(!io.err, "client error writing session create. %d", io.err);
  LOG_DEBUGF(
      "MSG_SendSessionCreate: sender='%s' template='%s' prompt_len=%zu",
      sender_name,
      template_name,
      strlen(prompt));
}

// Read session create request from IO
// Returns: template_name pointer (valid only until next IO operation)
const char* MSG_ReadSessionCreate(
    IO* io,
    char* template_name_buf,
    u32 template_name_max,
    char* template_body_buf,
    u32 template_body_max,
    char* prompt_buf,
    u32 prompt_max) {
  u32 len = 0;

  // Read template_name
  len = IO_ReadStr8Buf(io, template_name_buf, template_name_max);
  if (io->err || len == 0) {
    LOG_ERRORF("MSG_ReadSessionCreate: failed to read template_name");
    return NULL;
  }

  // Read template_body
  len = IO_ReadStr8Buf(io, template_body_buf, template_body_max);
  if (io->err) {
    LOG_ERRORF("MSG_ReadSessionCreate: failed to read template_body");
    return NULL;
  }

  // Read prompt
  len = IO_ReadStr8Buf(io, prompt_buf, prompt_max);
  if (io->err) {
    LOG_ERRORF("MSG_ReadSessionCreate: failed to read prompt");
    return NULL;
  }

  LOG_DEBUGF(
      "MSG_ReadSessionCreate: template='%s' template_body_len=%u prompt_len=%u",
      template_name_buf,
      (u32)strlen(template_body_buf),
      (u32)strlen(prompt_buf));

  return template_name_buf;
}

// ---
// Agent streaming events

// Agent session started
// Format: [SV_AGENT_START][template_name (Str8)][model (Str8)]
void MSG_SendAgentStart(Socket* socket, const char* template_name, const char* model) {
  IO io = {&socket->reliable};
  IO_WriteU8(&io, SV_AGENT_START);
  IO_WriteStr8(&io, &(Str8){(char*)template_name, strlen(template_name)});
  IO_WriteStr8(&io, &(Str8){(char*)model, strlen(model)});
  ASSERT_CONTEXT(!io.err, "error writing agent start. %d", io.err);
  LOG_DEBUGF("MSG_SendAgentStart: template='%s' model='%s'", template_name, model);
}

// Tool being invoked
// Format: [SV_AGENT_TOOL_CALL][tool_name (Str8)][arguments_json (Str8)]
void MSG_SendAgentToolCall(Socket* socket, const char* tool_name, const char* arguments) {
  LOG_TRACE;
  LOG_DEBUGF("MSG_SendAgentToolCall: ENTRY");
  LOG_DEBUGF("  socket pointer=%p", socket);
  LOG_DEBUGF(
      "  tool_name pointer=%p, strlen=%zu, value='%s'",
      tool_name,
      strlen(tool_name),
      tool_name);
  LOG_DEBUGF("  arguments pointer=%p, strlen=%zu", arguments, strlen(arguments));

  if (!socket) {
    LOG_ERRORF("MSG_SendAgentToolCall: socket is NULL!");
    return;
  }

  LOG_DEBUGF("MSG_SendAgentToolCall: socket->reliable = %p", &socket->reliable);

  IO io = {&socket->reliable};
  LOG_DEBUGF("MSG_SendAgentToolCall: IO initialized, buf=%p", io.buf);

  IO_WriteU8(&io, SV_AGENT_TOOL_CALL);
  LOG_DEBUGF(
      "MSG_SendAgentToolCall: After WriteU8(SV_AGENT_TOOL_CALL), io.written=%u io.err=%d",
      io.written,
      io.err);

  if (io.err) {
    LOG_ERRORF("MSG_SendAgentToolCall: ERROR after WriteU8: %d", io.err);
    return;
  }

  IO_WriteStr8(&io, &(Str8){(char*)tool_name, strlen(tool_name)});
  LOG_DEBUGF(
      "MSG_SendAgentToolCall: After WriteStr8(tool_name), io.written=%u io.err=%d",
      io.written,
      io.err);

  if (io.err) {
    LOG_ERRORF("MSG_SendAgentToolCall: ERROR after WriteStr8(tool_name): %d", io.err);
    return;
  }

  IO_WriteStr8(&io, &(Str8){(char*)arguments, strlen(arguments)});
  LOG_DEBUGF(
      "MSG_SendAgentToolCall: After WriteStr8(arguments), io.written=%u io.err=%d",
      io.written,
      io.err);

  if (io.err) {
    LOG_ERRORF("MSG_SendAgentToolCall: ERROR after WriteStr8(arguments): %d", io.err);
    return;
  }

  ASSERT_CONTEXT(!io.err, "error writing agent tool call. %d", io.err);
  LOG_DEBUGF(
      "MSG_SendAgentToolCall: SUCCESS - io.written=%u, tool='%s' args_len=%zu",
      io.written,
      tool_name,
      strlen(arguments));
}

// Tool result
// Format: [SV_AGENT_TOOL_RESULT][tool_name (Str8)][result (Str8)]
void MSG_SendAgentToolResult(Socket* socket, const char* tool_name, const char* result) {
  LOG_DEBUGF(
      "MSG_SendAgentToolResult: BEFORE - tool='%s' result_len=%zu socket=%p",
      tool_name,
      strlen(result),
      socket);

  IO io = {&socket->reliable};
  IO_WriteU8(&io, SV_AGENT_TOOL_RESULT);
  IO_WriteStr8(&io, &(Str8){(char*)tool_name, strlen(tool_name)});
  IO_WriteStr8(&io, &(Str8){(char*)result, strlen(result)});
  ASSERT_CONTEXT(!io.err, "error writing agent tool result. %d", io.err);
  LOG_DEBUGF(
      "MSG_SendAgentToolResult: AFTER - io.written=%u, tool='%s' result_len=%zu",
      io.written,
      tool_name,
      strlen(result));
}

// Assistant message
// Format: [SV_AGENT_ASSISTANT][content (Str8)]
void MSG_SendAgentAssistant(Socket* socket, const char* content) {
  LOG_DEBUGF("MSG_SendAgentAssistant: BEFORE - content_len=%zu socket=%p", strlen(content), socket);

  IO io = {&socket->reliable};
  IO_WriteU8(&io, SV_AGENT_ASSISTANT);
  IO_WriteStr8(&io, &(Str8){(char*)content, strlen(content)});
  ASSERT_CONTEXT(!io.err, "error writing agent assistant. %d", io.err);
  LOG_DEBUGF(
      "MSG_SendAgentAssistant: AFTER - io.written=%u content_len=%zu",
      io.written,
      strlen(content));
}

// Session complete
// Format: [SV_AGENT_COMPLETE][prompt_tokens (u32)][completion_tokens (u32)]
void MSG_SendAgentComplete(Socket* socket, u32 prompt_tokens, u32 completion_tokens) {
  IO io = {&socket->reliable};
  IO_WriteU8(&io, SV_AGENT_COMPLETE);
  IO_WriteU32(&io, prompt_tokens);
  IO_WriteU32(&io, completion_tokens);
  ASSERT_CONTEXT(!io.err, "error writing agent complete. %d", io.err);
  LOG_DEBUGF("MSG_SendAgentComplete: prompt=%u completion=%u", prompt_tokens, completion_tokens);
}

// Error occurred
// Format: [SV_AGENT_ERROR][error_message (Str8)]
void MSG_SendAgentError(Socket* socket, const char* error) {
  IO io = {&socket->reliable};
  IO_WriteU8(&io, SV_AGENT_ERROR);
  IO_WriteStr8(&io, &(Str8){(char*)error, strlen(error)});
  ASSERT_CONTEXT(!io.err, "error writing agent error. %d", io.err);
  LOG_DEBUGF("MSG_SendAgentError: error='%s'", error);
}

// Hub requests worker to run agent
// Format: [SV_AGENT_REQUEST][template_name (Str8)][prompt (Str8)][requester_name (Str8)]
void MSG_SendAgentRequest(
    Socket* socket, const char* template_name, const char* prompt, const char* requester) {
  IO io = {&socket->reliable};
  IO_WriteU8(&io, SV_AGENT_REQUEST);
  IO_WriteStr8(&io, &(Str8){(char*)template_name, strlen(template_name)});
  IO_WriteStr8(&io, &(Str8){(char*)prompt, strlen(prompt)});
  IO_WriteStr8(&io, &(Str8){(char*)requester, strlen(requester)});
  ASSERT_CONTEXT(!io.err, "error writing agent request. %d", io.err);
  LOG_DEBUGF(
      "MSG_SendAgentRequest: template='%s' prompt='%.50s' requester='%s'",
      template_name,
      prompt,
      requester);
}
