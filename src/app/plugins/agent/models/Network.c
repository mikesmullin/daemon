#pragma once

#include "../../../../unity.h"

// ---
// @class Network (NET)
// socket and network communication between hub (server) and client (terminal/worker)
// see: `ai/docs/NET_CODE.md`
//
// Function | Purpose
// --- | ---
// Network__sv_init(server, session_id) | initialize server socket
// Network__cl_init(client, session_id) | initialize client socket
// Network__updateSystem(socket, isHub) | process network frames (read/write)
// Network__shutdown() | cleanup and shutdown network resources
//
// _Network__sock_alloc(socket) | allocate socket buffers and crypto keys
// _Network__sock_recv(socket) | receive data on socket
// _Network__sock_drop(socket) | close and destroy socket
//
// _Network__cl_connect(socket) | initiate client connection to hub
// _Network__cl_send(sock, buf, len) | send data from client to hub
// _Network__cl_recv(sock, buf, len) | receive data on client from hub
//
// _Network__hub_connect(client) | handle hub client connection
// _Network__hub_alloc(sock) | allocate hub socket from worker pool
// _Network__hub_accept(listener, socket) | accept new connection on hub
// _Network__hub_send(sock, buf, len) | send data from hub to client
// _Network__hub_recv(sock, buf, len) | receive data on hub from client

// Forward declarations
static void _Network__readFrames(Socket* socket, bool isHub);
static void _Network__writeFrame(Socket* socket, bool isHub);
static void _Network__writeFrameToSession(Socket* socket, NetSession* session);
static void _Network__readFramesFromSession(Socket* socket, NetSession* session);

// Tool batch aggregation forward declarations (Phase 4)
void PendingToolBatch__receiveResult(u64 batch_id, u8 batch_idx, const char* result);
bool PendingToolBatch__isComplete(u64 batch_id);
static bool PendingToolBatch__findByCmdId(u64 cmd_id, u64* out_batch_id, u8* out_batch_idx);

void _Network__sock_alloc(Socket* socket) {
  RB_Alloc(_G->arena, &socket->reliable, SOCKET_BUF_SIZE);
  RB_Zero(&socket->reliable);
  RB_Alloc(_G->arena, &socket->unacked, SOCKET_BUF_SIZE);
  RB_Zero(&socket->unacked);
  RB_Alloc(_G->arena, &socket->datagram, SOCKET_BUF_SIZE);
  RB_Zero(&socket->datagram);
  RB_Alloc(_G->arena, &socket->inbound, SOCKET_BUF_SIZE);
  RB_Zero(&socket->inbound);

  // Initialize encryption key/nonce from environment (hex encoded)
  char keyHex[65] = {0};
  char nonceHex[17] = {0};
  Env__get("D4_CHACHA_KEY", keyHex);
  Env__get("D4_CHACHA_NONCE", nonceHex);

  if (keyHex[0] && nonceHex[0]) {
    cstr__hexToBytes(keyHex, socket->key, 32);
    cstr__hexToBytes(nonceHex, socket->nonce, 8);
  } else {
    // Fallback to default (for testing only - not secure)
    LOG_ERRORF("D4_CHACHA_KEY/D4_CHACHA_NONCE not set, using insecure defaults");
    memset(socket->key, 0, 32);
    memset(socket->nonce, 0, 8);
  }
}

void _Network__sock_recv(Socket* socket) {
  // TODO: on Network__*_recv(), if ack_seq and flags ok, clear unacked
}

void _Network__sock_drop(Socket* socket) {
  Sock__close(socket);
  Sock__shutdown(socket);
  Sock__free(socket);
  Sock__destroy(socket);
}

// Hub (Server)

void _Network__hub_connect(Socket* client) {
  LOG_TRACE;
}

void _Network__hub_alloc(Socket** sock) {
  LOG_TRACE;
  u32 session_id = _G->worker_sv_ct++;
  Socket* socket = &_G->worker_sv[session_id];
  *sock = socket;
  _Network__sock_alloc(socket);
}
void _Network__hub_accept(Socket* listener, Socket* socket) {
  LOG_TRACE;
  LOG_DEBUGF("Hub: accepted new connection");
}
void _Network__hub_send(Socket* sock, u8* buf, u32 len) {
  LOG_TRACE;
}
void _Network__hub_recv(Socket* sock, u8* buf, u32 len) {
  LOG_TRACE;

  // For UDP hub, find or create session based on sender address
  NetSession* session = Session__findOrCreate(&sock->_nix_peer_addr, sock->_nix_peer_len);
  if (!session) {
    LOG_ERRORF("Failed to find/create session, dropping packet");
    return;
  }

  // Update last recv time
  session->lastRecvAt = _G->now;

  // Push data to session's inbound buffer
  IO io = {&session->inbound};
  RB_Push(&io, buf, len);
  RB_Print(&session->inbound, "Hub recv (session)", 0);
}

// Check if command is a tool/session command (session.*, fs.*, shell.*, browser.*)
static bool _Network__isToolCmd(const char* cmd) {
  return cstr__eq(8, cmd, "session.") || cstr__eq(3, cmd, "fs.") || cstr__eq(6, cmd, "shell.") ||
         cstr__eq(8, cmd, "browser.");
}

// Execute a command on the hub (called when CL_CMD_REQUEST is received)
static void _Network__executeCmd(
    Socket* socket, const char* sender, const char* cmd, char* result, size_t result_sz) {
  LOG_DEBUGF("_Network__executeCmd: sender='%s' cmd='%s'", sender, cmd);

  // Handle tool commands via CmdRegistry tick functions
  if (_Network__isToolCmd(cmd)) {
    CmdMessage msg = {0};
    msg.id = _G->unow;
    strncpy(msg.term, sender, sizeof(msg.term) - 1);
    strcpy(msg.worker, "hub");
    msg.state = CMD_PENDING;

    // Parse "cmd.name arg1: val1, arg2: val2"
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

    // Execute via tick function
    CmdTickFn fn = CmdRegistry__getTickFn(&msg);
    CmdExecState state = {.state = CMD_RUNNING, .tick_count = 0, .context = NULL};

    int max_ticks = 1000;
    while (state.state == CMD_RUNNING && max_ticks-- > 0) {
      state = fn(state, &msg);
      if (state.state == CMD_RUNNING) {
        SleepMs(10);
      }
    }

    strncpy(result, msg.result, result_sz - 1);
    return;
  }

  // Parse command
  if (cstr__eq(6, cmd, "spawn")) {
    u32 session_id = ++_G->worker_sv_ct;
    LOG_INFOF(COLOR__GREEN "Spawn: %u (requested by %s)", session_id, sender);
    Worktree__create(session_id);
    Container__create(session_id);
    snprintf(result, result_sz, "Spawned worker %u", session_id);
  } else if (cstr__eq(5, cmd, "help")) {
    snprintf(
        result,
        result_sz,
        "Commands: help, <template> <prompt>, spawn, session.*, fs.*, shell.*, browser.*");
  } else if (cstr__eq(8, cmd, "register")) {
    // Worker registration - name already set by CL_CMD_REQUEST handler
    LOG_INFOF("🔗 Client registered: %s", sender);
    snprintf(result, result_sz, "Registered as %s", sender);
  } else {
    // Try to parse as template + prompt (e.g., "tooltest What files are in src?")
    // Format: "<template_name> <prompt>"
    const char* space = strchr(cmd, ' ');
    char template_name[64] = {0};
    const char* prompt = "";

    if (space) {
      size_t tmpl_len = space - cmd;
      if (tmpl_len >= sizeof(template_name))
        tmpl_len = sizeof(template_name) - 1;
      memcpy(template_name, cmd, tmpl_len);
      template_name[tmpl_len] = '\0';

      prompt = space + 1;
      while (*prompt == ' ') prompt++;
    } else {
      strncpy(template_name, cmd, sizeof(template_name) - 1);
    }

    // Try to load template to verify it exists
    AgentTemplate tmpl = {0};
    if (template_name[0] && AgentTemplate__load_by_name(&tmpl, template_name)) {
      // Template found - invoke agent session with streaming socket
      LOG_INFOF(
          "🤖 Executing agent: template='%s' prompt='%s' requester='%s'",
          template_name,
          prompt,
          sender);
      Agent__runLoop(template_name, prompt, socket);
      snprintf(result, result_sz, "Agent session completed for template '%s'", template_name);
    } else {
      snprintf(result, result_sz, "Unknown command: %s", cmd);
    }
  }
}

void Network__sv_init(Socket* server, u32 session_id) {
  LOG_TRACE;

  // bindings
  _G->onsockconnect = _Network__hub_connect;
  _G->onsockalloc = _Network__hub_alloc;
  _G->onsockaccept = _Network__hub_accept;
  _G->onsocksend = _Network__hub_send;
  _G->onsockrecv = _Network__hub_recv;

  _Network__sock_alloc(server);

  // Build UDP address from global config
  char addr[512] = "";
  char port[8] = "";
  sprintf(addr, "udp://%s", _G->hub_host);
  sprintf(port, "%u", _G->hub_port);

  Sock__init(server, addr, port, SERVER_SOCKET);
  LOG_INFOF("Network Hub listening on %s:%s (UDP)", _G->hub_host, port);
  Sock__listen(server);
}

// ---
// Network Update System (Quake2-inspired pattern)

// Read inbound frames from socket
static void _Network__readFrames(Socket* socket, bool isHub) {
  while (!RB_Empty(&socket->inbound)) {
    LOG_DEBUGF(
        "readFrames loop: inbound.head=%u tail=%u used=%u",
        socket->inbound.head,
        socket->inbound.tail,
        RB_Used(&socket->inbound));
    IO io = {0};
    io.buf = &socket->inbound;
    IO_Begin(&io);

    NetFrame frame = {0};
    u8 buf[2048] = {0};
    frame.data = buf;

    MSG_ReadFrame(&io, &frame, socket->key, socket->nonce);
    IO_RollbackOrCommit(&io);

    if (io.err) {
      RB_Seek(&io, io.read);
      continue;
    }

    MSG_PrintFrame(isHub ? "hub read" : "client read", &frame);

    // Only ACK frames with payload (empty frames don't require ACK)
    if (frame.len > 0) {
      socket->ack = frame.seq;
      socket->pendingAck = true;  // Mark that we need to send an ACK
    }

    // Clear unacked if peer ACKed our last sent seq
    if (frame.ack >= socket->seq - 1 && !RB_Empty(&socket->unacked)) {
      RB_Reset(&socket->unacked);
    }

    // Dispatch messages from frame payload
    if (frame.len > 0) {
      // Use sz = len+1 to prevent tail from wrapping when it reaches head
      RingBuffer payload = {frame.data, (u16)(frame.len + 1), (u16)frame.len, 0};
      IO msg_io = {&payload};

      while (!RB_Empty(&payload) && msg_io.err == 0) {
        u8 msg_code = 0;
        IO_ReadU8(&msg_io, &msg_code);
        if (msg_io.err)
          break;

        switch (msg_code) {
          case CL_STDIN: {
            char data[1024] = {0};
            u32 len = MSG_ReadStdin(&msg_io, data, sizeof(data));
            if (msg_io.err)
              break;
            LOG_DEBUGF("CL_STDIN: len=%u data=%.*s", len, len, data);
            // For UDP hub, track session state when we receive client message
            if (isHub) {
              // Check if this is first message (session not yet established)
              if (socket->sessionState < SESSION_SERVER_CONNECTED) {
                socket->sessionState = SESSION_SERVER_CONNECTED;
                LOG_DEBUGF("Hub: session established");
              }
            }
            break;
          }
          case SV_STDOUT: {
            char data[1024] = {0};
            u32 len = MSG_ReadStdout(&msg_io, data, sizeof(data));
            if (msg_io.err)
              break;
            LOG_DEBUGF("SV_STDOUT: len=%u data=%.*s", len, len, data);
            break;
          }
          case CL_SESSION_CREATE: {
            // Handle session creation request from term
            char template_name[256] = {0};
            char template_body[8192] = {0};
            char prompt[4096] = {0};

            MSG_ReadSessionCreate(
                &msg_io,
                template_name, sizeof(template_name),
                template_body, sizeof(template_body),
                prompt, sizeof(prompt));

            if (msg_io.err) {
              LOG_ERRORF("CL_SESSION_CREATE: Failed to parse message");
              break;
            }

            LOG_INFOF("CL_SESSION_CREATE: template='%s' prompt_len=%zu", template_name, strlen(prompt));

            if (isHub) {
              // Hub: Run agent session and send results back to term
              Agent__runLoop(template_name, prompt, socket);
            }
            break;
          }
          case MSG_CMD: {
            CmdMessage msg = {0};
            MSG_ReadCmd(&msg_io, &msg);
            if (msg_io.err)
              break;

            LOG_INFOF(
                "MSG_CMD: id=%llu term='%s' worker='%s' cmd='%s' state=%u",
                msg.id,
                msg.term,
                msg.worker,
                msg.cmd,
                msg.state);

            if (isHub) {
              // Hub routing logic

              // Check if this is a result from a worker (state is COMPLETED or FAILED)
              if (msg.state == CMD_COMPLETED || msg.state == CMD_FAILED) {
                // Phase 4: Attempt to aggregate result in pending batch
                u64 batch_id = 0;
                u8 batch_idx = 0;
                if (PendingToolBatch__findByCmdId(msg.id, &batch_id, &batch_idx)) {
                  // Result belongs to a pending batch - aggregate it
                  LOG_INFOF("Hub: Result from worker belongs to batch_id=%llu batch_idx=%u",
                            batch_id, batch_idx);
                  PendingToolBatch__receiveResult(batch_id, batch_idx, msg.result);

                  // Check if batch is now complete
                  if (PendingToolBatch__isComplete(batch_id)) {
                    LOG_INFOF("Hub: Tool batch complete (batch_id=%llu) - forwarding to term '%s'",
                              batch_id, msg.term);
                    // Batch is complete - forward this result to term
                    // (Other results will also be forwarded)
                    NetSession* term_session = Session__findByName(msg.term);
                    if (term_session && term_session->active) {
                      Socket term_sock = {0};
                      Session__toSocket(term_session, &term_sock);
                      IO term_io = {&term_sock.reliable};
                      MSG_WriteCmd(&term_io, &msg);
                      Session__syncFromSocket(term_session, &term_sock);
                    } else {
                      LOG_ERRORF("Hub: Could not find term '%s' to send result", msg.term);
                    }
                  } else {
                    LOG_DEBUGF("Hub: Waiting for more results in batch (batch_id=%llu)", batch_id);
                    // Wait for more results before forwarding
                  }
                } else {
                  // Result not in pending batch - just forward it (local execution or non-batched)
                  LOG_INFOF("Hub: Result not in batch, forwarding directly to term '%s'", msg.term);
                  NetSession* term_session = Session__findByName(msg.term);
                  if (term_session && term_session->active) {
                    Socket term_sock = {0};
                    Session__toSocket(term_session, &term_sock);
                    IO term_io = {&term_sock.reliable};
                    MSG_WriteCmd(&term_io, &msg);
                    Session__syncFromSocket(term_session, &term_sock);
                  } else {
                    LOG_ERRORF("Hub: Could not find term '%s' to send result", msg.term);
                  }
                }
              } else if (msg.worker[0] && strcmp(msg.worker, "hub") != 0) {
                // Route to worker
                NetSession* worker = Session__findByName(msg.worker);
                if (worker && worker->active) {
                  LOG_INFOF("Hub: Routing CMD to worker '%s'", msg.worker);
                  // Forward the message to worker
                  Socket worker_sock = {0};
                  Session__toSocket(worker, &worker_sock);
                  IO worker_io = {&worker_sock.reliable};
                  MSG_WriteCmd(&worker_io, &msg);
                  Session__syncFromSocket(worker, &worker_sock);
                } else {
                  // Worker not connected - send error back to term
                  LOG_ERRORF("Hub: Worker '%s' not connected", msg.worker);
                  CmdMessage response = msg;
                  snprintf(
                      response.result,
                      sizeof(response.result),
                      "Error: Worker '%s' not connected",
                      msg.worker);
                  response.state = CMD_FAILED;
                  response.progress = 100;
                  IO resp_io = {&socket->reliable};
                  MSG_WriteCmd(&resp_io, &response);
                }
              } else {
                // Execute locally
                LOG_INFOF("Hub: Executing CMD locally");
                char result[2048] = {0};
                _Network__executeCmd(socket, msg.term, msg.cmd, result, sizeof(result));

                // Send response back to term
                // We need to construct a response CmdMessage
                CmdMessage response = msg;
                strncpy(response.result, result, sizeof(response.result) - 1);
                response.state = CMD_COMPLETED;
                response.progress = 100;

                IO resp_io = {&socket->reliable};
                MSG_WriteCmd(&resp_io, &response);
              }
            } else if (_G->mode == MODE_WORKER) {
              // Worker execution logic - execute command and send result back to hub
              // Use the pre-parsed msg.cmd and msg.args directly (already parsed by term/hub)
              LOG_INFOF("Worker: Executing CMD '%s' args='%.50s'", msg.cmd, msg.args);

              // Execute via tick function using pre-parsed args
              CmdTickFn fn = CmdRegistry__getTickFn(&msg);
              CmdExecState state = {.state = CMD_RUNNING, .tick_count = 0, .context = NULL};

              int max_ticks = 1000;
              while (state.state == CMD_RUNNING && max_ticks-- > 0) {
                state = fn(state, &msg);
              }

              // Send response back to hub (which will route to term)
              CmdMessage response = msg;
              response.state = (state.state >= CMD_COMPLETED) ? state.state : CMD_FAILED;
              response.progress = 100;
              response.term[0] = '\0';  // Clear term to prevent hub routing loop

              IO resp_io = {&socket->reliable};
              MSG_WriteCmd(&resp_io, &response);
              LOG_INFOF("Worker: Sent result back to hub: %.100s", response.result);
            } else if (_G->mode == MODE_TERM) {
              // Term result handling
              LOG_INFOF("Term: Received CMD result: %s", msg.result);
              if (msg.state == CMD_COMPLETED || msg.state == CMD_FAILED) {
                printf("%s\n", msg.result);
                // In oneshot mode, quit after receiving result
                if (_G->cli_mode == CLI_ONESHOT) {
                  _G->quit = true;
                }
              }
            }
            break;
          }
          // CL_CMD_REQUEST and SV_CMD_RESPONSE removed (RFC 0004)
          // --- Agent streaming events (term receives from hub) ---
          case SV_AGENT_START: {
            VInt32 name_len = {0}, model_len = {0};
            char template_name[64] = {0}, model[64] = {0};
            IO_ReadVInt32(&msg_io, &name_len);
            if (!msg_io.err)
              IO_ReadBytes(&msg_io, (u8*)template_name, name_len.value.u);
            IO_ReadVInt32(&msg_io, &model_len);
            if (!msg_io.err)
              IO_ReadBytes(&msg_io, (u8*)model, model_len.value.u);
            if (msg_io.err)
              break;
            printf(COLOR__CYAN "🤖 Agent: %s (model: %s)" COLOR__RESET "\n", template_name, model);
            break;
          }
          case SV_AGENT_TOOL_CALL: {
            VInt32 name_len = {0}, args_len = {0};
            char tool_name[64] = {0}, arguments[2048] = {0};
            IO_ReadVInt32(&msg_io, &name_len);
            if (!msg_io.err)
              IO_ReadBytes(&msg_io, (u8*)tool_name, name_len.value.u);
            IO_ReadVInt32(&msg_io, &args_len);
            if (!msg_io.err)
              IO_ReadBytes(&msg_io, (u8*)arguments, args_len.value.u);
            if (msg_io.err)
              break;
            printf(COLOR__YELLOW "🔧 Tool: %s" COLOR__RESET "\n", tool_name);
            printf("   Args: %.200s%s\n", arguments, strlen(arguments) > 200 ? "..." : "");
            break;
          }
          case SV_AGENT_TOOL_RESULT: {
            VInt32 name_len = {0}, result_len = {0};
            char tool_name[64] = {0}, result[4096] = {0};
            IO_ReadVInt32(&msg_io, &name_len);
            if (!msg_io.err)
              IO_ReadBytes(&msg_io, (u8*)tool_name, name_len.value.u);
            IO_ReadVInt32(&msg_io, &result_len);
            if (!msg_io.err)
              IO_ReadBytes(&msg_io, (u8*)result, result_len.value.u);
            if (msg_io.err)
              break;
            printf(COLOR__GREEN "📤 Result (%s):" COLOR__RESET "\n%s\n", tool_name, result);
            break;
          }
          case SV_AGENT_ASSISTANT: {
            VInt32 len = {0};
            char content[4096] = {0};
            IO_ReadVInt32(&msg_io, &len);
            if (!msg_io.err)
              IO_ReadBytes(&msg_io, (u8*)content, len.value.u);
            if (msg_io.err)
              break;
            printf(COLOR__PINK "🤖 Assistant: %s" COLOR__RESET "\n", content);
            break;
          }
          case SV_AGENT_COMPLETE: {
            u32 prompt_tokens = 0, completion_tokens = 0;
            IO_ReadU32(&msg_io, &prompt_tokens);
            IO_ReadU32(&msg_io, &completion_tokens);
            if (msg_io.err)
              break;
            printf(
                COLOR__GREEN "✅ Complete (tokens: %u prompt, %u completion)" COLOR__RESET "\n",
                prompt_tokens,
                completion_tokens);
            _G->quit = true;  // Signal quit after agent completes
            break;
          }
          case SV_AGENT_ERROR: {
            VInt32 len = {0};
            char error[256] = {0};
            IO_ReadVInt32(&msg_io, &len);
            if (!msg_io.err)
              IO_ReadBytes(&msg_io, (u8*)error, len.value.u);
            if (msg_io.err)
              break;
            printf(COLOR__RED "❌ Error: %s" COLOR__RESET "\n", error);
            _G->quit = true;
            break;
          }
          case SV_AGENT_REQUEST: {
            // Worker receives agent request from hub
            VInt32 tmpl_len = {0}, prompt_len = {0}, req_len = {0};
            char template_name[64] = {0}, prompt[2048] = {0}, requester[64] = {0};
            IO_ReadVInt32(&msg_io, &tmpl_len);
            if (!msg_io.err)
              IO_ReadBytes(&msg_io, (u8*)template_name, tmpl_len.value.u);
            IO_ReadVInt32(&msg_io, &prompt_len);
            if (!msg_io.err)
              IO_ReadBytes(&msg_io, (u8*)prompt, prompt_len.value.u);
            IO_ReadVInt32(&msg_io, &req_len);
            if (!msg_io.err)
              IO_ReadBytes(&msg_io, (u8*)requester, req_len.value.u);
            if (msg_io.err)
              break;

            // Only workers should handle this
            if (_G->mode == MODE_WORKER) {
              LOG_INFOF(
                  "🤖 Worker received agent request: template='%s' from='%s'",
                  template_name,
                  requester);
              LOG_INFOF("   Prompt: %s", prompt);

              // Run agent loop with streaming back to hub
              Agent__runLoop(template_name, prompt, socket);
            } else {
              LOG_DEBUGF("SV_AGENT_REQUEST ignored (not in worker mode)");
            }
            break;
          }
          default:
            LOG_DEBUGF("Unknown message code: 0x%02X", msg_code);
            msg_io.err = -1;
            break;
        }
      }

      socket->lastReadErr = (msg_io.err != 0);
      if (msg_io.err)
        LOG_DEBUGF("Error parsing frame messages: %d", msg_io.err);
    }
  }
}

// Compose body from reliable + datagram buffers
static void _Network__composeBody(Socket* socket, IO* body_io) {
  // Reliable: only one in-transit at a time (stop-and-wait ARQ)
  if (RB_Empty(&socket->unacked) && !RB_Empty(&socket->reliable)) {
    // New reliable data to send
    IO unacked_io = {&socket->unacked};
    RB_Clone(&unacked_io, &socket->reliable);
    RB_Reset(&socket->reliable);
    RB_Copy(body_io, &socket->unacked);
  } else if (!RB_Empty(&socket->unacked) && _G->now - socket->lastSentAt > 1000 * 10) {
    // Retransmit on timeout (10 sec)
    RB_Copy(body_io, &socket->unacked);
  }

  // Datagram: append unreliable data (rebuilt each frame)
  if (!RB_Empty(&socket->datagram)) {
    RB_Copy(body_io, &socket->datagram);
    RB_Reset(&socket->datagram);
  }
}

// Write outbound frame to socket
static void _Network__writeFrame(Socket* socket, bool isHub) {
  // Compose body from reliable + datagram
  RingBuffer body = {(u8[SOCKET_BUF_SIZE]){0}, SOCKET_BUF_SIZE};
  IO body_io = {&body};
  _Network__composeBody(socket, &body_io);

  bool hasPayload = !RB_Empty(&body);
  bool needsAck = socket->pendingAck;

  if (!hasPayload && !needsAck) {
    return;
  }

  // Build frame
  NetFrame frame = {
      .flags = socket->lastReadErr ? NFRAME_INVALID : NFRAME_OK,
      .seq = socket->seq,
      .ack = socket->ack,
      .qport = socket->qport,
      .len = RB_Used(&body),
      .data = body.data,
  };
  if (frame.len == 0) {
    frame.flags |= NFRAME_EMPTY_ACK;
  }

  if (frame.len == 0 && !socket->pendingAck) {
    return;
  }

  // Serialize and send
  RingBuffer outbound = {(u8[SOCKET_BUF_SIZE]){0}, SOCKET_BUF_SIZE};
  IO io = {&outbound};
  MSG_WriteFrame(&io, &frame, socket->key, socket->nonce);
  ASSERT_CONTEXT(!io.err, "error writing frame: %d", io.err);

  Sock__write(socket, outbound.data, RB_Used(&outbound));
  MSG_PrintFrame(isHub ? "hub write" : "client write", &frame);

  if (hasPayload) {
    socket->seq++;
    socket->lastSentAt = _G->now;  // Only update on NEW data, not retransmits
  }
  socket->lastAckSent = socket->ack;
  socket->pendingAck = false;  // ACK has been sent
}

// ---
// Session-aware functions for UDP hub

// Compose body from session's reliable + datagram buffers
static void _Network__composeBodyFromSession(NetSession* session, IO* body_io) {
  // Reliable: only one in-transit at a time (stop-and-wait ARQ)
  if (RB_Empty(&session->unacked) && !RB_Empty(&session->reliable)) {
    IO unacked_io = {&session->unacked};
    RB_Clone(&unacked_io, &session->reliable);
    RB_Reset(&session->reliable);
    RB_Copy(body_io, &session->unacked);
  } else if (!RB_Empty(&session->unacked) && _G->now - session->lastSentAt > 1000 * 10) {
    // Retransmit on timeout (10 sec)
    RB_Copy(body_io, &session->unacked);
  }

  // Datagram: append unreliable data
  if (!RB_Empty(&session->datagram)) {
    RB_Copy(body_io, &session->datagram);
    RB_Reset(&session->datagram);
  }
}

// Read frames from a specific session's inbound buffer
static void _Network__readFramesFromSession(Socket* socket, NetSession* session) {
  while (!RB_Empty(&session->inbound)) {
    LOG_DEBUGF(
        "readFrames (session): inbound.head=%u tail=%u used=%u",
        session->inbound.head,
        session->inbound.tail,
        RB_Used(&session->inbound));
    IO io = {0};
    io.buf = &session->inbound;
    IO_Begin(&io);

    NetFrame frame = {0};
    u8 buf[2048] = {0};
    frame.data = buf;

    MSG_ReadFrame(&io, &frame, session->key, session->nonce);
    IO_RollbackOrCommit(&io);

    if (io.err) {
      RB_Seek(&io, io.read);
      continue;
    }

    MSG_PrintFrame("hub read (session)", &frame);

    // Only ACK frames with payload
    if (frame.len > 0) {
      session->ack = frame.seq;
      session->pendingAck = true;  // Mark that we need to send an ACK
    }

    // Clear unacked if peer ACKed our last sent seq
    if (frame.ack >= session->seq - 1 && !RB_Empty(&session->unacked)) {
      RB_Reset(&session->unacked);
    }

    // Dispatch messages from frame payload
    if (frame.len > 0) {
      RingBuffer payload = {frame.data, (u16)(frame.len + 1), (u16)frame.len, 0};
      IO msg_io = {&payload};
      bool lastReadErr = false;

      while (!RB_Empty(&payload) && msg_io.err == 0) {
        u8 msg_code = 0;
        IO_ReadU8(&msg_io, &msg_code);
        if (msg_io.err)
          break;

        switch (msg_code) {
          case CL_STDIN: {
            char data[1024] = {0};
            u32 len = MSG_ReadStdin(&msg_io, data, sizeof(data));
            if (msg_io.err)
              break;
            LOG_DEBUGF("CL_STDIN (session): len=%u data=%.*s", len, len, data);

            if (session->sessionState < SESSION_SERVER_CONNECTED) {
              session->sessionState = SESSION_SERVER_CONNECTED;
              // Queue hello to session's reliable buffer
              IO rel_io = {&session->reliable};
              IO_WriteU8(&rel_io, SV_STDOUT);
              IO_WriteStr8(&rel_io, &(Str8){"Hello from d4 hub (session)!"});
              LOG_DEBUGF("Hub: queued hello to session");
            }
            break;
          }
          case CL_SESSION_CREATE: {
            // Handle session creation request from term
            char template_name[256] = {0};
            char template_body[8192] = {0};
            char prompt[4096] = {0};

            MSG_ReadSessionCreate(
                &msg_io,
                template_name, sizeof(template_name),
                template_body, sizeof(template_body),
                prompt, sizeof(prompt));

            if (msg_io.err) {
              LOG_ERRORF("CL_SESSION_CREATE: Failed to parse message");
              break;
            }

            LOG_INFOF("CL_SESSION_CREATE: template='%s' prompt_len=%zu", template_name, strlen(prompt));

            // Create socket from session for passing to Agent__runLoop
            Socket session_sock = {0};
            Session__toSocket(session, &session_sock);

            // Hub: Run agent session and send results back to term
            Agent__runLoop(template_name, prompt, &session_sock);

            // Sync results back to session
            Session__syncFromSocket(session, &session_sock);
            break;
          }
          case MSG_CMD: {
            CmdMessage msg = {0};
            MSG_ReadCmd(&msg_io, &msg);
            if (msg_io.err)
              break;

            LOG_INFOF(
                "MSG_CMD (session): id=%llu term='%s' worker='%s' cmd='%s' state=%u",
                msg.id,
                msg.term,
                msg.worker,
                msg.cmd,
                msg.state);

            // Store client name in session if not set
            if (session->name[0] == '\0' && msg.term[0] != '\0') {
              strncpy(session->name, msg.term, sizeof(session->name) - 1);
              session->name[sizeof(session->name) - 1] = '\0';
            }

            // Handle worker registration: when a node sends "register" command, explicitly mark it as registered
            if (cstr__eq(9, msg.cmd, "register")) {
              session->active = true;  // Ensure session is active
              LOG_INFOF(
                  "✅ Worker Registration: '%s' is now available for tool dispatch",
                  session->name);
            }

            // Check if this is a result from a worker (state is COMPLETED or FAILED)
            if (msg.state == CMD_COMPLETED || msg.state == CMD_FAILED) {
              // This is a result - forward to the originating term (if specified)
              if (msg.term[0]) {
                LOG_INFOF("Hub: Received result from worker, routing to term '%s'", msg.term);
                NetSession* term_session = Session__findByName(msg.term);
                if (term_session && term_session->active) {
                  IO term_io = {&term_session->reliable};
                  MSG_WriteCmd(&term_io, &msg);
                } else {
                  LOG_ERRORF("Hub: Could not find term '%s' to send result", msg.term);
                }
              } else {
                LOG_INFOF("Hub: Worker result has no target term (internal processing only)");
              }
            } else if (msg.worker[0] && strcmp(msg.worker, "hub") != 0) {
              // Route to worker
              NetSession* worker = Session__findByName(msg.worker);
              if (worker) {
                LOG_INFOF("Hub: Routing CMD to worker '%s'", msg.worker);
                IO worker_io = {&worker->reliable};
                MSG_WriteCmd(&worker_io, &msg);
              } else {
                LOG_ERRORF("Hub: Worker '%s' not found", msg.worker);
                // Send error back to term
                CmdMessage response = msg;
                snprintf(
                    response.result,
                    sizeof(response.result),
                    "Error: Worker '%s' not found",
                    msg.worker);
                response.state = CMD_FAILED;

                IO resp_io = {&session->reliable};
                MSG_WriteCmd(&resp_io, &response);
              }
            } else {
              // Check for agent invocation: cmd = template name, args = prompt
              // Format: <template_name> is the command, <prompt> is in args
              bool delegated = false;
              char template_name[64] = {0};
              const char* prompt_str = msg.args;

              // cmd is the template name
              strncpy(template_name, msg.cmd, sizeof(template_name) - 1);
              template_name[sizeof(template_name) - 1] = '\0';

              // Check if template exists
              AgentTemplate tmpl = {0};
              if (template_name[0] && AgentTemplate__load_by_name(&tmpl, template_name)) {
                // Template found - try delegation if workers available
                // Collect workers from all tools
                for (u8 t = 0; t < tmpl.metadata.tool_count && !delegated; t++) {
                  AgentTool* tool = &tmpl.metadata.tools[t];
                  for (u8 w = 0; w < tool->worker_count && !delegated; w++) {
                    const char* worker_name = tool->workers[w];
                    NetSession* worker = Session__findByName(worker_name);
                    if (worker) {
                      LOG_INFOF("🔀 Delegating agent to worker '%s'", worker_name);
                      strncpy(msg.worker, worker_name, sizeof(msg.worker) - 1);
                      IO worker_io = {&worker->reliable};
                      MSG_WriteCmd(&worker_io, &msg);
                      delegated = true;
                    }
                  }
                }

                if (!delegated) {
                  // Run locally
                  LOG_INFOF(
                      "🤖 Hub: Running agent locally template='%s' prompt='%.100s'",
                      template_name,
                      prompt_str);
                  Socket* session_sock = (Socket*)malloc(sizeof(Socket));
                  if (session_sock) {
                    Session__toSocket(session, session_sock);
                    Agent__runLoop(template_name, prompt_str, session_sock);
                    Session__syncFromSocket(session, session_sock);
                    free(session_sock);
                  }
                  // Agent__runLoop handles responses via streaming events
                  CmdMessage response = msg;
                  strcpy(response.result, "Agent session completed");
                  response.state = CMD_COMPLETED;
                  response.progress = 100;
                  IO resp_io = {&session->reliable};
                  MSG_WriteCmd(&resp_io, &response);
                }
              } else {
                // Not an agent command - execute as tool command
                LOG_INFOF("Hub: Adding CMD to registry (non-agent)");
                CmdRegistry__add(&_G->cmd_reg, &msg);
                // Result will be sent by CmdRegistry__tick
              }
            }
            break;
          }
          // CL_CMD_REQUEST removed (RFC 0004)

          // --- Agent events from worker - relay to requester ---
          case SV_AGENT_START: {
            // Parse: [template_name (Str8)][model (Str8)]
            VInt32 name_len = {0}, model_len = {0};
            char template_name[64] = {0}, model[64] = {0};
            IO_ReadVInt32(&msg_io, &name_len);
            if (!msg_io.err)
              IO_ReadBytes(&msg_io, (u8*)template_name, name_len.value.u);
            IO_ReadVInt32(&msg_io, &model_len);
            if (!msg_io.err)
              IO_ReadBytes(&msg_io, (u8*)model, model_len.value.u);
            if (msg_io.err)
              break;

            LOG_DEBUGF(
                "Hub: relaying SV_AGENT_START template='%s' model='%s' to '%s'",
                template_name,
                model,
                session->requester_name);

            // Route to specific requester
            NetSession* requester = Session__findByName(session->requester_name);
            if (requester) {
              Socket term_sock;
              Session__toSocket(requester, &term_sock);
              MSG_SendAgentStart(&term_sock, template_name, model);
              Session__syncFromSocket(requester, &term_sock);
            }
            break;
          }
          case SV_AGENT_TOOL_CALL: {
            // Parse: [tool_name (Str8)][arguments_json (Str8)]
            VInt32 name_len = {0}, args_len = {0};
            char tool_name[64] = {0}, arguments[2048] = {0};
            IO_ReadVInt32(&msg_io, &name_len);
            if (!msg_io.err)
              IO_ReadBytes(&msg_io, (u8*)tool_name, name_len.value.u);
            IO_ReadVInt32(&msg_io, &args_len);
            if (!msg_io.err)
              IO_ReadBytes(&msg_io, (u8*)arguments, args_len.value.u);
            if (msg_io.err)
              break;

            LOG_DEBUGF(
                "Hub: relaying SV_AGENT_TOOL_CALL tool='%s' to '%s'",
                tool_name,
                session->requester_name);

            NetSession* requester = Session__findByName(session->requester_name);
            if (requester) {
              Socket term_sock;
              Session__toSocket(requester, &term_sock);
              MSG_SendAgentToolCall(&term_sock, tool_name, arguments);
              Session__syncFromSocket(requester, &term_sock);
            }
            break;
          }
          case SV_AGENT_TOOL_RESULT: {
            // Parse: [tool_name (Str8)][result (Str8)]
            VInt32 name_len = {0}, result_len = {0};
            char tool_name[64] = {0}, result[4096] = {0};
            IO_ReadVInt32(&msg_io, &name_len);
            if (!msg_io.err)
              IO_ReadBytes(&msg_io, (u8*)tool_name, name_len.value.u);
            IO_ReadVInt32(&msg_io, &result_len);
            if (!msg_io.err)
              IO_ReadBytes(&msg_io, (u8*)result, result_len.value.u);
            if (msg_io.err)
              break;

            LOG_DEBUGF(
                "Hub: relaying SV_AGENT_TOOL_RESULT tool='%s' to '%s'",
                tool_name,
                session->requester_name);

            NetSession* requester = Session__findByName(session->requester_name);
            if (requester) {
              Socket term_sock;
              Session__toSocket(requester, &term_sock);
              MSG_SendAgentToolResult(&term_sock, tool_name, result);
              Session__syncFromSocket(requester, &term_sock);
            }
            break;
          }
          case SV_AGENT_ASSISTANT: {
            // Parse: [content (Str8)]
            VInt32 len = {0};
            char content[4096] = {0};
            IO_ReadVInt32(&msg_io, &len);
            if (!msg_io.err)
              IO_ReadBytes(&msg_io, (u8*)content, len.value.u);
            if (msg_io.err)
              break;

            LOG_DEBUGF("Hub: relaying SV_AGENT_ASSISTANT to '%s'", session->requester_name);

            NetSession* requester = Session__findByName(session->requester_name);
            if (requester) {
              Socket term_sock;
              Session__toSocket(requester, &term_sock);
              MSG_SendAgentAssistant(&term_sock, content);
              Session__syncFromSocket(requester, &term_sock);
            }
            break;
          }
          case SV_AGENT_COMPLETE: {
            // Parse: [prompt_tokens (u32)][completion_tokens (u32)]
            u32 prompt_tokens = 0, completion_tokens = 0;
            IO_ReadU32(&msg_io, &prompt_tokens);
            IO_ReadU32(&msg_io, &completion_tokens);
            if (msg_io.err)
              break;

            LOG_DEBUGF(
                "Hub: relaying SV_AGENT_COMPLETE tokens=%u/%u to '%s'",
                prompt_tokens,
                completion_tokens,
                session->requester_name);

            NetSession* requester = Session__findByName(session->requester_name);
            if (requester) {
              Socket term_sock;
              Session__toSocket(requester, &term_sock);
              MSG_SendAgentComplete(&term_sock, prompt_tokens, completion_tokens);
              Session__syncFromSocket(requester, &term_sock);
            }
            // Clear requester after completion
            session->requester_name[0] = '\0';
            break;
          }
          case SV_AGENT_ERROR: {
            // Parse: [error_message (Str8)]
            VInt32 len = {0};
            char error[256] = {0};
            IO_ReadVInt32(&msg_io, &len);
            if (!msg_io.err)
              IO_ReadBytes(&msg_io, (u8*)error, len.value.u);
            if (msg_io.err)
              break;

            LOG_DEBUGF("Hub: relaying SV_AGENT_ERROR: %s to '%s'", error, session->requester_name);

            NetSession* requester = Session__findByName(session->requester_name);
            if (requester) {
              Socket term_sock;
              Session__toSocket(requester, &term_sock);
              MSG_SendAgentError(&term_sock, error);
              Session__syncFromSocket(requester, &term_sock);
            }
            // Clear requester after error
            session->requester_name[0] = '\0';
            break;
          }
          default:
            LOG_DEBUGF("Unknown message code: 0x%02X", msg_code);
            msg_io.err = -1;
            break;
        }
      }

      lastReadErr = (msg_io.err != 0);
      if (msg_io.err)
        LOG_DEBUGF("Error parsing frame messages: %d", msg_io.err);
    }
  }
}

// Write frame to a specific session
static void _Network__writeFrameToSession(Socket* socket, NetSession* session) {
  RingBuffer body = {(u8[SOCKET_BUF_SIZE]){0}, SOCKET_BUF_SIZE};
  IO body_io = {&body};
  _Network__composeBodyFromSession(session, &body_io);

  bool hasPayload = !RB_Empty(&body);
  bool needsAck = session->pendingAck;

  if (!hasPayload && !needsAck) {
    return;
  }

  NetFrame frame = {
      .flags = NFRAME_OK,
      .seq = session->seq,
      .ack = session->ack,
      .qport = session->qport,
      .len = RB_Used(&body),
      .data = body.data,
  };
  if (frame.len == 0) {
    frame.flags |= NFRAME_EMPTY_ACK;
  }

  if (frame.len == 0 && !session->pendingAck) {
    return;
  }

  RingBuffer outbound = {(u8[SOCKET_BUF_SIZE]){0}, SOCKET_BUF_SIZE};
  IO io = {&outbound};
  MSG_WriteFrame(&io, &frame, session->key, session->nonce);
  ASSERT_CONTEXT(!io.err, "error writing frame: %d", io.err);

  Sock__writeTo(socket, outbound.data, RB_Used(&outbound), &session->peer_addr, session->peer_len);
  MSG_PrintFrame("hub write (session)", &frame);

  if (hasPayload) {
    session->seq++;
    session->lastSentAt = _G->now;  // Only update on NEW data, not retransmits
  }
  session->lastAckSent = session->ack;
  session->pendingAck = false;  // ACK has been sent
}

// Main update loop (called end-of-frame)
void Network__updateSystem(Socket* socket, bool isHub) {
  if (isHub) {
    // For UDP hub, we don't accept() - just read directly
    if (socket->udp_socket) {
      // Read from socket (populates session inbound buffers via hub_recv callback)
      Sock__read(socket, SOCKET_BUF_SIZE);

      // Iterate all active sessions
      for (u32 i = 0; i < _G->session_ct; i++) {
        NetSession* session = &_G->sessions[i];
        if (!session->active)
          continue;

        // Process inbound frames and send outbound for this session
        _Network__readFramesFromSession(socket, session);
        _Network__writeFrameToSession(socket, session);
      }
    } else {
      // TCP/Unix domain still uses accept
      Sock__accept(socket);
    }
  } else {
    Sock__read(socket, SOCKET_BUF_SIZE);
    _Network__readFrames(socket, isHub);
    _Network__writeFrame(socket, isHub);
  }
}

// Client (Term/Worker)

void _Network__cl_connect(Socket* socket) {
  LOG_TRACE;
  LOG_DEBUGF("Client: connected to hub");

  // If this is a worker with a name, send registration to hub
  if (_G->mode == MODE_WORKER && _G->process_name[0]) {
    MSG_SendCmdRequest(socket, _G->process_name, "register");
    LOG_DEBUGF("Worker: sent registration as '%s'", _G->process_name);
  }
}
// void _Network__cl_alloc(Socket** sock) {
// *sock = &_scene.c1;
// }
void _Network__cl_send(Socket* sock, u8* buf, u32 len) {
  // No-op for client send
}
void _Network__cl_recv(Socket* sock, u8* buf, u32 len) {
  IO io = {&sock->inbound};
  RB_Push(&io, buf, len);
  RB_Print(&sock->inbound, "Client recv", 0);
  _Network__sock_recv(sock);
}

void Network__cl_init(Socket* client, u32 session_id) {
  LOG_TRACE;

  // bindings
  _G->onsockconnect = _Network__cl_connect;
  // _G->onsockalloc = _Network__cl_alloc;
  // _G->onsockaccept = _Network__cl_accept;
  _G->onsocksend = _Network__cl_send;
  _G->onsockrecv = _Network__cl_recv;

  _Network__sock_alloc(client);

  // Build UDP address from global config
  char addr[512] = "";
  char port[8] = "";
  sprintf(addr, "udp://%s", _G->hub_host);
  sprintf(port, "%u", _G->hub_port);

  Sock__init(client, addr, port, CLIENT_SOCKET);
  LOG_INFOF("Network Client connecting to %s:%s (UDP, session=%u)", _G->hub_host, port, session_id);
  Sock__connect(client);
}

// ============================================================================
// Pending Tool Batch Management Functions
// ============================================================================

// Add a tool to a pending batch (called when tool is dispatched to worker)
void PendingToolBatch__add(
    u64 batch_id,
    u8 batch_idx,
    u8 batch_total,
    const char* tool_name,
    const char* tool_call_id,
    u64 cmd_id) {
  LOG_DEBUGF(
      "PendingToolBatch__add: batch_id=%llu batch_idx=%u/%u tool='%s' cmd_id=%llu",
      batch_id,
      batch_idx,
      batch_total,
      tool_name,
      cmd_id);

  // Find or create batch
  PendingToolBatch* batch = NULL;
  for (u8 i = 0; i < _G->pending_batches.batch_count; i++) {
    if (_G->pending_batches.batches[i].batch_id == batch_id) {
      batch = &_G->pending_batches.batches[i];
      break;
    }
  }

  // Create new batch if not found
  if (!batch) {
    if (_G->pending_batches.batch_count >= 16) {
      LOG_ERRORF("PendingToolBatch__add: batch registry full");
      return;
    }
    batch = &_G->pending_batches.batches[_G->pending_batches.batch_count];
    _G->pending_batches.batch_count++;

    batch->batch_id = batch_id;
    batch->batch_total = batch_total;
    batch->batch_received = 0;
    batch->dispatch_time_ms = _G->now;
    batch->complete = false;
  }

  // Add tool to batch
  if (batch_idx < 32) {
    PendingToolResult* tool = &batch->tools[batch_idx];
    tool->batch_idx = batch_idx;
    tool->cmd_id = cmd_id;
    tool->received = false;
    strncpy(tool->tool_name, tool_name, sizeof(tool->tool_name) - 1);
    strncpy(tool->tool_call_id, tool_call_id, sizeof(tool->tool_call_id) - 1);
    LOG_DEBUGF("PendingToolBatch__add: added tool at index %u", batch_idx);
  }
}

// Receive a tool result (possibly out of order)
void PendingToolBatch__receiveResult(u64 batch_id, u8 batch_idx, const char* result) {
  LOG_DEBUGF("PendingToolBatch__receiveResult: batch_id=%llu batch_idx=%u result_len=%zu",
             batch_id,
             batch_idx,
             strlen(result));

  // Find batch
  PendingToolBatch* batch = NULL;
  for (u8 i = 0; i < _G->pending_batches.batch_count; i++) {
    if (_G->pending_batches.batches[i].batch_id == batch_id) {
      batch = &_G->pending_batches.batches[i];
      break;
    }
  }

  if (!batch) {
    LOG_ERRORF("PendingToolBatch__receiveResult: batch not found (batch_id=%llu)", batch_id);
    return;
  }

  // Store result at correct index
  if (batch_idx < 32 && !batch->tools[batch_idx].received) {
    strncpy(batch->tools[batch_idx].result, result, sizeof(batch->tools[batch_idx].result) - 1);
    batch->tools[batch_idx].received = true;
    batch->batch_received++;

    LOG_INFOF("PendingToolBatch__receiveResult: result %u/%u received",
              batch->batch_received,
              batch->batch_total);

    // Check if batch complete
    if (batch->batch_received == batch->batch_total) {
      batch->complete = true;
      LOG_INFOF("PendingToolBatch__receiveResult: batch complete! (batch_id=%llu)", batch_id);
    }
  }
}

// Check if batch is complete
bool PendingToolBatch__isComplete(u64 batch_id) {
  for (u8 i = 0; i < _G->pending_batches.batch_count; i++) {
    if (_G->pending_batches.batches[i].batch_id == batch_id) {
      return _G->pending_batches.batches[i].complete;
    }
  }
  return false;
}

// Get ordered results from a complete batch
bool PendingToolBatch__getResults(
    u64 batch_id,
    char results[][4096],
    u8* result_count) {
  LOG_DEBUGF("PendingToolBatch__getResults: batch_id=%llu", batch_id);

  PendingToolBatch* batch = NULL;
  for (u8 i = 0; i < _G->pending_batches.batch_count; i++) {
    if (_G->pending_batches.batches[i].batch_id == batch_id) {
      batch = &_G->pending_batches.batches[i];
      break;
    }
  }

  if (!batch || !batch->complete) {
    LOG_ERRORF("PendingToolBatch__getResults: batch not complete (batch_id=%llu)", batch_id);
    return false;
  }

  // Copy results in order
  *result_count = 0;
  for (u8 i = 0; i < batch->batch_total && i < 32; i++) {
    if (batch->tools[i].received) {
      strncpy(results[i], batch->tools[i].result, 4095);
      results[i][4095] = '\0';
      (*result_count)++;
    }
  }

  LOG_INFOF("PendingToolBatch__getResults: returning %u results", *result_count);
  return true;
}

// Remove a completed batch from tracking
void PendingToolBatch__remove(u64 batch_id) {
  LOG_DEBUGF("PendingToolBatch__remove: batch_id=%llu", batch_id);

  for (u8 i = 0; i < _G->pending_batches.batch_count; i++) {
    if (_G->pending_batches.batches[i].batch_id == batch_id) {
      // Shift remaining batches
      for (u8 j = i; j < _G->pending_batches.batch_count - 1; j++) {
        _G->pending_batches.batches[j] = _G->pending_batches.batches[j + 1];
      }
      _G->pending_batches.batch_count--;
      LOG_INFOF("PendingToolBatch__remove: batch removed, %u batches remaining",
                _G->pending_batches.batch_count);
      return;
    }
  }
}

// Helper: Find batch information from a cmd_id
// Returns true if found and sets batch_id and batch_idx
// Used when receiving tool results from workers
static bool PendingToolBatch__findByCmdId(u64 cmd_id, u64* out_batch_id, u8* out_batch_idx) {
  LOG_DEBUGF("PendingToolBatch__findByCmdId: searching for cmd_id=%llu", cmd_id);

  for (u8 i = 0; i < _G->pending_batches.batch_count; i++) {
    PendingToolBatch* batch = &_G->pending_batches.batches[i];

    // Search all tools in this batch
    for (u8 j = 0; j < 32; j++) {
      if (batch->tools[j].cmd_id == cmd_id) {
        *out_batch_id = batch->batch_id;
        *out_batch_idx = batch->tools[j].batch_idx;
        LOG_INFOF("PendingToolBatch__findByCmdId: found cmd_id=%llu in batch_id=%llu batch_idx=%u",
                  cmd_id, *out_batch_id, *out_batch_idx);
        return true;
      }
    }
  }

  LOG_DEBUGF("PendingToolBatch__findByCmdId: cmd_id=%llu not found in any batch", cmd_id);
  return false;
}

void Network__shutdown(void) {
  LOG_TRACE;

  Sock__close(&_G->term_cl);
  Sock__shutdown(&_G->term_cl);
  Sock__free(&_G->term_cl);
  Sock__destroy(&_G->term_cl);

  Sock__close(&_G->worker_cl);
  Sock__shutdown(&_G->worker_cl);
  Sock__free(&_G->worker_cl);
  Sock__destroy(&_G->worker_cl);

  for (u8 i = 0; i < _G->worker_sv_ct; i++) {
    Sock__close(&_G->worker_sv[i]);
    Sock__shutdown(&_G->worker_sv[i]);
    Sock__free(&_G->worker_sv[i]);
    Sock__destroy(&_G->worker_sv[i]);
  }

  Sock__close(&_G->hub_sv);
  Sock__shutdown(&_G->hub_sv);
  Sock__free(&_G->hub_sv);
  Sock__destroy(&_G->hub_sv);
}