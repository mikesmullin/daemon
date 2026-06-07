
# Network Protocol

A reliable UDP network stack with encryption. Uses ring buffers for zero-copy I/O and stop-and-wait ARQ for reliable delivery. Designed for portability across Linux, macOS, Windows, and browser (Emscripten/WebSocket).

## File Overview

- `src/app/plugins/agent/models/Network.c`: update loop, frame processing
- `src/app/plugins/agent/models/Message.c`: NetFrame struct serialization with ChaCha20 encryption + CRC32
- `src/app/common/IO.c`: Scalar type serialization (u8, u16, u32, VInt32, etc.) to RingBuffer
- `src/app/common/RingBuffer.c`: Circular buffer with wrap-around, push/shift/peek ops
- `src/app/common/Sock.c`: Cross-platform socket abstraction (TCP, UDP, Unix domain, WebSocket)

## Important Qualities
- **Portable**: Linux, macOS, Windows, browser/Emscripten
- **Minimalist**: Each file <1k lines
- **Minimal stdlib dependency**: For potential microcontroller/console ports
- **Unified interface**: Async callbacks regardless of socket type

### Sock.c
Socket types supported:
1. TCP (default, stream-oriented)
2. UDP (prefix: `udp://`, datagram-oriented)
3. Unix domain (prefix: `unix://`, local IPC)
4. WebSocket (when compiled with Emscripten)

Unified interface uses async callbacks (`onsockrecv`, `onsocksend`, `onsockconnect`, `onsockaccept`) to abstract platform differences. WebSocket's async nature dictates the pattern.

### RingBuffer.c
Circular buffer with:
- `RB_Push()` - Append to head (write)
- `RB_Shift()` - Remove from tail (read/consume)
- `RB_Peek()` - Read without consuming
- Wrap-around handling for efficient memory use
- etc.

### IO.c
Type-safe serialization layer using `IO` struct:
- `IO_WriteU8/U16/U32/U64()` - Fixed-width integers
- `IO_WriteVInt32()` - Variable-length encoding
- `IO_Begin()/IO_RollbackOrCommit()` - Transaction support (rollback on error)
- etc.

### Message.c
NetFrame serialization with security:
- `MSG_WriteFrame()` - Serialize, encrypt (ChaCha20), append CRC32
- `MSG_ReadFrame()` - Decrypt, verify CRC32, deserialize
- Length prefix (VInt) is unencrypted; payload is encrypted
- etc.

Also intended to be the place for easy serialization of individaul application network messages (which are accrued to each frame body; one NetFrame has many Messages).

### Network.c
Quake2-inspired per-frame pump (`Network__updateSystem()`):
- here, `System` refers to an ECS-style system/loop
- Reads from socket → parses frames → dispatches messages
- Composes outbound frames from buffers → encrypts → sends
- Only sends frames when data pending (not every tick)

## Socket Buffers

Each `Socket` has four `RingBuffer`s for data management:

| Buffer      | Purpose                                                                 |
|-------------|-------------------------------------------------------------------------|
| `reliable`  | Outbound queue for guaranteed-delivery messages (priority)             |
| `unacked`   | Copy of last-sent reliable data, held until ACK received (stop-and-wait ARQ) |
| `datagram`  | Outbound queue for unreliable messages, rebuilt each frame             |
| `inbound`   | Incoming raw bytes from socket, parsed into frames                     |

**Flow:**
1. App writes to `reliable` or `datagram`
2. `_Network__composeBody()` moves `reliable` → `unacked`, appends `datagram`
3. Frame is encrypted and sent
4. On ACK received, `unacked` is cleared
5. On timeout (10s), `unacked` is retransmitted

## NetFrame Header Fields

Each NetFrame contains these header fields:

| Field | Type | Purpose |
|-------|------|---------|
| `flags` | u8 | Frame status (OK, INVALID, EMPTY_ACK) |
| `seq` | u8 | Outgoing sequence number (increments per payload frame) |
| `ack` | u8 | Last received sequence number from peer |
| `qport` | u16 | Client port identifier (for NAT traversal, future use) |
| `len` | u16 | Payload length (encrypted body size) |
| `crc` | u32 | CRC32 checksum of encrypted payload |

### Understanding ACK vs Response

**Critical distinction:**
- `ack` does NOT mean "response to a request" - it only represents **guaranteed delivery confirmation**
- `ack` tells the sender their message was received by the receiver's network stack
- `ack` does NOT pair request/response messages together
- Either side can send empty ACK frames (frames with no payload, just acknowledging receipt)

**Implication for clients:**
- After sending a request, the client may receive an empty ACK frame first
- The actual response (with payload) arrives in a subsequent frame
- Clients must continue receiving frames after an empty ACK until payload data arrives

## Sessions (Multi-Client Hub)

For a UDP hub serving multiple clients, each client needs isolated state. The `NetSession` struct provides per-client:

| Field | Purpose |
|-------|---------|
| `peer_addr` | Client's IP:port for sendto() |
| `reliable`, `unacked`, `datagram`, `inbound` | Per-session ring buffers |
| `seq`, `ack`, `lastAckSent` | Per-session sequence tracking |
| `key`, `nonce` | Per-session ChaCha20 keys (future: handshake) |
| `sessionState` | Connection state machine |
| `lastRecvAt`, `lastSentAt` | Timestamps for timeout handling |

**Why sessions matter:**
Without sessions, a single `Socket` struct shares buffers among all clients. When Client B sends a packet, it overwrites the peer address - causing retransmits intended for Client A to go to Client B instead.

**Session lookup:**
- `_Session__find()` - Find existing session by peer address
- `_Session__findOrCreate()` - Find or allocate new session slot
- Hub's `recv` callback creates/finds session, pushes to session's `inbound` buffer
- `Network__updateSystem()` iterates all active sessions for read/write

## Encryption (ChaCha20)

- Payload is encrypted with ChaCha20 (32-byte key, 8-byte nonce)
- CRC32 is computed on encrypted payload (detect transmission errors)
- Length prefix (VInt) is unencrypted (needed to know how many bytes to read)
- Currently uses hardcoded key/nonce; future: per-session handshake
