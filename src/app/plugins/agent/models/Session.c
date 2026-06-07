#pragma once

#include "../../../../unity.h"

// ---
// @class Session
// agent session management
//
// Function | Purpose
// --- | ---
// Session__alloc(session) | allocate buffers for a new session
// Session__find(peer_addr) | find session by peer address
// Session__findOrCreate(peer_addr, peer_len) | find or create session by peer address
// Session__findByName(name) | find session by client name
// Session__toSocket(session, sock) | create a Socket wrapper for a session's reliable buffer
// Session__syncFromSocket(session, sock) | copy updated buffer state back to session

// Allocate buffers for a new session
void Session__alloc(NetSession* session) {
  RB_Alloc(_G->arena, &session->reliable, SOCKET_BUF_SIZE);
  RB_Zero(&session->reliable);
  RB_Alloc(_G->arena, &session->unacked, SOCKET_BUF_SIZE);
  RB_Zero(&session->unacked);
  RB_Alloc(_G->arena, &session->datagram, SOCKET_BUF_SIZE);
  RB_Zero(&session->datagram);
  RB_Alloc(_G->arena, &session->inbound, SOCKET_BUF_SIZE);
  RB_Zero(&session->inbound);

  // Initialize encryption key/nonce from environment (for now, same for all)
  // TODO: per-session keys via handshake
  char keyHex[65] = {0};
  char nonceHex[17] = {0};
  Env__get("D4_CHACHA_KEY", keyHex);
  Env__get("D4_CHACHA_NONCE", nonceHex);

  if (keyHex[0] && nonceHex[0]) {
    cstr__hexToBytes(keyHex, session->key, 32);
    cstr__hexToBytes(nonceHex, session->nonce, 8);
  } else {
    LOG_ERRORF("D4_CHACHA_KEY/D4_CHACHA_NONCE not set, using insecure defaults");
    memset(session->key, 0, 32);
    memset(session->nonce, 0, 8);
  }

  session->seq = 0;
  session->ack = 0;
  session->lastAckSent = 0;
  session->qport = 0;
  session->lastSentAt = 0;
  session->lastRecvAt = _G->now;
  session->sessionState = SESSION_NONE;
}

// Find session by peer address, returns NULL if not found
NetSession* Session__find(struct sockaddr_in* peer_addr) {
  for (u8 i = 0; i < MAX_SESSIONS; i++) {
    NetSession* s = &_G->sessions[i];
    if (s->active && s->peer_addr.sin_addr.s_addr == peer_addr->sin_addr.s_addr &&
        s->peer_addr.sin_port == peer_addr->sin_port) {
      return s;
    }
  }
  return NULL;
}

// Find or create session by peer address
NetSession* Session__findOrCreate(struct sockaddr_in* peer_addr, socklen_t peer_len) {
  // First try to find existing
  NetSession* session = Session__find(peer_addr);
  if (session) {
    return session;
  }

  // Find empty slot
  for (u8 i = 0; i < MAX_SESSIONS; i++) {
    NetSession* s = &_G->sessions[i];
    if (!s->active) {
      s->active = true;
      s->peer_addr = *peer_addr;
      s->peer_len = peer_len;
      s->requester_name[0] = '\0';  // No active request
      Session__alloc(s);
      _G->session_ct++;

      char ip_str[INET_ADDRSTRLEN];
      inet_ntop(AF_INET, &peer_addr->sin_addr, ip_str, sizeof(ip_str));
      LOG_INFOF("New session [%d] from %s:%d", i, ip_str, ntohs(peer_addr->sin_port));

      return s;
    }
  }

  LOG_ERRORF("Session table full (max %d)", MAX_SESSIONS);
  return NULL;
}

// Find session by client name (e.g., "worker-1")
NetSession* Session__findByName(const char* name) {
  for (u8 i = 0; i < MAX_SESSIONS; i++) {
    NetSession* s = &_G->sessions[i];
    if (s->active && strcmp(s->name, name) == 0) {
      return s;
    }
  }
  return NULL;
}

// Create a Socket wrapper for a session's reliable buffer
// This allows MSG_Send* functions to work with sessions
// IMPORTANT: After using, call _Session__syncFromSocket to copy buffer state back
// NOTE: Do NOT memset the entire Socket struct - it's ~600 bytes and causes stack corruption on ARM64
void Session__toSocket(NetSession* session, Socket* sock) {
  // Only initialize the reliable field that we actually use in MSG_Send* functions
  // Leave other fields uninitialized (they shouldn't be accessed)
  sock->reliable = session->reliable;
}

// Copy updated buffer state back to session after socket operations
void Session__syncFromSocket(NetSession* session, Socket* sock) {
  session->reliable = sock->reliable;
}