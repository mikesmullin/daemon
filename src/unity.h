// Single Compilation Unit 1 (Unity Build: main.exe)
// vim: set expandtab ts=2 sw=2:

#pragma once

// ---
// POSIX support

#if defined(__APPLE__) || defined(__linux__)
// needed by:
// - time.h on linux to provide nanosleep() (a POSIX fn)
// - terminal to capture raw (non-canonical) mode stdin
#define _POSIX_C_SOURCE 200809L
// standard POSIX header (available on all Unix-like systems)
#include <unistd.h>  // IWYU pragma: keep
#endif

// ---
// DLL import/export

#ifdef _WIN32
#ifdef __cplusplus
#define DLL_EXPORT extern "C" __declspec(dllexport)
#else
#define DLL_EXPORT __declspec(dllexport)
#endif
#else
#ifdef __cplusplus
#define DLL_EXPORT extern "C" __attribute__((visibility("default")))
#else
#define DLL_EXPORT __attribute__((visibility("default")))
#endif
#endif

#ifdef _WIN32
#ifdef __cplusplus
#define DLL_IMPORT extern "C" __attribute__((dllimport))
#else
#define DLL_IMPORT __attribute__((dllimport))
#endif
#else
#define DLL_IMPORT
#endif

#define DISPATCHER(T1, V1, ...) \
  T1 __VA_ARGS__;               \
  T1* V1[] = {__VA_ARGS__};

#include <stddef.h>  // IWYU pragma: keep // NULL, offsetof()
// #define NULL (0)

// ---
// Types

// fixed-width types
#include <stdint.h>  // IWYU pragma: keep
// aliases
typedef int8_t s8;
typedef int16_t s16;
typedef int32_t s32;
typedef int64_t s64;
typedef uint8_t u8;
typedef uint16_t u16;
typedef uint32_t u32;
typedef uint64_t u64;
typedef float f32;
typedef double f64;

// boolean
#include <stdbool.h>  // IWYU pragma: keep // typedef bool, #define true (1), false (0)
// typedef u8 bool;
// #define false (0)
// #define true (1)

// ---
// Math (portable)
// set rounding mode for portable fixed-point math (float) determinism
#include <fenv.h>  // IWYU pragma: keep // fesetround
#define MATH_INIT() fesetround(FE_TONEAREST)

// Time
#include <time.h>  // IWYU pragma: keep
// POSIX (cont'd)
#if defined(__APPLE__) || defined(__linux__)
#include <signal.h>  // IWYU pragma: keep
#include <termios.h>  // IWYU pragma: keep
#endif

// ---
// Windows API
// shared generally in several places (sokol, sleep)
#include "app/common/Windows.c"  // IWYU pragma: keep

// ---
// Spawn
#ifdef _WIN32
#include <process.h>
#else
#include <sys/types.h>
#include <sys/wait.h>
#endif

// ---
// File Watch
#include <sys/stat.h>

// ---
// Global Dependencies
#include <ctype.h>  // IWYU pragma: keep // tolower()
#include <stdarg.h>  // IWYU pragma: keep // va_list
#include <stdio.h>  // IWYU pragma: keep // sprintf()
#include <stdlib.h>  // IWYU pragma: keep  // malloc(), exit()
#include <string.h>  // IWYU pragma: keep // memset

// Time (cont'd)
#include "app/common/Time.c"  // IWYU pragma: keep

// ---
// Global Configuration

// Verbosity levels (via -v, -vv, -vvv, etc.)
#define VERBOSITY_NONE (0)  // No debug output
#define VERBOSITY_TOOLS (1)  // Tools level
#define VERBOSITY_SESSION (2)  // Session, Tools
#define VERBOSITY_XAI (3)  // XAI, Session, Tools
#define VERBOSITY_NETWORK (4)  // Network, XAI, Session, Tools
#define VERBOSITY_MESSAGE (5)  // Message, Network, XAI, Session, Tools
#define VERBOSITY_IO (6)  // IO, Message, Network, XAI, Session, Tools

// Verbosity checking macros
#define VERBOSITY_CHECK(level) (_G && _G->verbosity >= level)
#define LOG_VERBOSE(level, ...)   \
  do {                            \
    if (VERBOSITY_CHECK(level)) { \
      LOG_DEBUGF(__VA_ARGS__);    \
    }                             \
  } while (0)

// Debug
#define NET_DEBUG_RAW (0)  // raw packets
#define NET_DEBUG_WS (0)  // websocket frame
#define NET_DEBUG_CMD (0)  // cmd parsing
#define NET_DEBUG_BUF (0)  // individual buffers
#define NET_DEBUG_FRAME (0)  // wsframe, gframe, etc.
#define IO_DEBUG (0)  // type encoding/serialization

typedef struct {
  u32 ct;
  void* ptr;
} ARange;
#define ARRAYSIZE(A) (sizeof(A) / sizeof((A)[0]))
#define ARANGE(A) ((ARange){.ct = ARRAYSIZE(A), .ptr = A})
typedef struct {
  u32 ct;
  u32 stride;
  void* ptr;
} ARange2;
#define ARANGE2(A) ((ARange2){.ct = ARRAYSIZE(A), sizeof((A)[0]), .ptr = A})

// Profiler
// comment next line when not in use
// #define PROFILER__INSTRUMENTED
#ifdef PROFILER__INSTRUMENTED
#define PROFILE__BEGIN(id) Profiler__beginTrace(id)
#define PROFILE__END(id) Profiler__endTrace(id)
#define PROFILE__PRINT() Profiler__printf()
#else
#define PROFILE__BEGIN(id)
#define PROFILE__END(id)
#define PROFILE__PRINT()
#endif

typedef enum {
  PROFILED_FN_NONE,
  ENTITY__UPDATESYSTEM,
  ENTITY__RENDERSYSTEM,
  COLLISION__RESOLVE,
  COLLISION__PREUPDATE,
  COLLISION__UPDATE,
  PROFILED_FN_COUNT,
} ProfiledFns;

// ---
// Math

// min, max, clamp
#define Math__min(a, b) (((a) < (b)) ? (a) : (b))
#define Math__max(a, b) (((a) > (b)) ? (a) : (b))
#define Math__clampi(min, n, max) (((n) < (min)) ? (min) : ((max) < (n)) ? (max) : (n))
#define Math__clampb(min, n, max) \
  if (n < min) {                  \
    n = min;                      \
  } else if (max < n) {           \
    n = max;                      \
  }
#define Math__between(min, n, max) (((min) < (n)) && ((n) < (max)))

// ---
// Breakpoint

// #define DEBUGGER breakpoint (compiler-specific)
#ifdef ENGINE_DLL
DLL_IMPORT bool IsDebugger(void);
#else
DLL_EXPORT bool IsDebugger(void) {
#if defined(__GNUC__) || defined(__clang__)
#if defined(__x86_64__) || defined(__i386__)
#ifdef _WIN32
  return IsDebuggerPresent();
#endif
#endif
#endif
  return false;
}
#endif

// clang-format off
#if defined(__GNUC__) || defined(__clang__)
#if defined(__x86_64__) || defined(__i386__)
#define DEBUGGER if(IsDebugger()) __asm__("int3")  // GCC/Clang x86/x86_64
#elif defined(_MSC_VER)
#include <intrin.h>
#define DEBUGGER if(IsDebugger()) __debugbreak()  // MSVC
#else
#include <signal.h>
#define DEBUGGER if(IsDebugger()) raise(SIGTRAP)  // GCC/Clang on non-x86 platforms
#endif
#else
#error "DEBUGGER Breakpoint unsupported by this compiler!"
#endif
// clang-format on

// ---
// Log

// allow intercept from unit test
static bool __asserted = false;
static bool __expect_assert = false;
static bool __log_to_file = false;

void Repl__resetPrompt(void);  // fwd decl
void Repl__renderPrompt(void);  // fwd decl

#include "app/common/Color.c"  // IWYU pragma: keep
#include "app/common/Log.c"  // IWYU pragma: keep

static const char* S_CONSOLE_LOG1 = "*** TRACE %s:%u %s\n";
static const char* S_CONSOLE_LOG3 = "Assertion failed: %s\n  at %s:%u\n";

#define STATIC_ARRAY_LEN(a) (sizeof(a) / sizeof(a[0]))
#define LOG_TRACE Console__log(S_CONSOLE_LOG1, __FILE__, __LINE__, __func__)
// TODO: define -DDEBUG_FAST (`-O0`) and -DDEBUG_SLOW from Makefile, defaulting to `-O3` for prod builds
#define LOG_INFOF(s, ...) Console__log(COLOR__BLUE s COLOR__RESET "\n", ##__VA_ARGS__)
#define LOG_ERRORF(s, ...) Console__error(COLOR__PINK s COLOR__RESET "\n", ##__VA_ARGS__)
#ifdef DEBUG_SLOW
#define LOG_DEBUGF(s, ...) Console__log(s "\n", ##__VA_ARGS__)
#define ASSERT(cond)                                           \
  if (!(cond)) {                                               \
    DEBUGGER;                                                  \
    Console__abort(S_CONSOLE_LOG3, #cond, __FILE__, __LINE__); \
  }
#define ASSERT_CONTEXT(cond, ctx, ...)                            \
  if (!(cond)) {                                                  \
    DEBUGGER;                                                     \
    Console__abort(                                               \
        "Assertion failed: %s\n  at %s:%u\n  Context: " ctx "\n", \
        #cond,                                                    \
        __FILE__,                                                 \
        __LINE__,                                                 \
        ##__VA_ARGS__);                                           \
  }
#else
#define LOG_DEBUGF(s, ...)
#define ASSERT(cond)
#define ASSERT_CONTEXT(cond, ctx, ...)
#endif

// ---
// Socket

#ifdef _WIN32
#include <winsock2.h>
#pragma comment(lib, "Ws2_32.lib")
#include <ws2tcpip.h>
#endif

#ifdef __linux__
#include <arpa/inet.h>
#include <errno.h>
#include <fcntl.h>
#include <netinet/in.h>
#include <netinet/tcp.h>
#include <sys/socket.h>
#include <sys/un.h>
#endif

#ifdef __APPLE__
#include <arpa/inet.h>
#include <netinet/in.h>
#include <sys/socket.h>
#include <sys/types.h>
#include <unistd.h>
#endif

// ---
// Engine

typedef struct Cmd {
} Cmd;

// min, max, clamp
#define Math__min(a, b) (((a) < (b)) ? (a) : (b))
#define Math__max(a, b) (((a) > (b)) ? (a) : (b))
#define Math__clampi(min, n, max) (((n) < (min)) ? (min) : ((max) < (n)) ? (max) : (n))
#define Math__clampb(min, n, max) \
  if (n < min) {                  \
    n = min;                      \
  } else if (max < n) {           \
    n = max;                      \
  }
#define Math__between(min, n, max) (((min) < (n)) && ((n) < (max)))

// vector structures (1D, 2D, 3D, and 4D)

typedef struct {
  f32 x;
} v1;

typedef struct {
  f32 x, y;
} v2;

typedef struct {
  f32 x, y, z;
} v3;

typedef struct {
  f32 x, y, z, w;
} v4;

typedef v4 q4;  // Quaternions

// clang-format off
typedef struct  {
  // f32 rows[4][4]; // row-major
  // v4 cols[4]; // col-major

  // row-major
  // f32 ax, ay, az, aw,
  //     bx, by, bz, bw,
  //     cx, cy, cz, cw,
  //     dx, dy, dz, dw;

  // col-major (for GPU)
  f32 ax, bx, cx, dx,
      ay, by, cy, dy,
      az, bz, cz, dz,
      aw, bw, cw, dw;
} m4;
// clang-format on

// vector constants

static const v3 V3_ZERO = (v3){0.0f, 0.0f, 0.0f};
static const v3 V3_ONE = (v3){1.0f, 1.0f, 1.0f};
static const v3 V3_UP = (v3){0.0f, 1.0f, 0.0f};  // +Y_UP
static const v3 V3_FWD = (v3){0.0f, 0.0f, -1.0f};  // -Z_FWD (right-handed)
static const v3 V3_RIGHT = (v3){1.0f, 0.0f, 0.0f};  // +X_RIGHT
// clang-format off
static const m4 M4_IDENTITY = (m4){
  1.0f, 0.0f, 0.0f, 0.0f,
  0.0f, 1.0f, 0.0f, 0.0f,
  0.0f, 0.0f, 1.0f, 0.0f,
  0.0f, 0.0f, 0.0f, 1.0f,
};
// clang-format on

typedef struct {
  u32 state;  // seed state for LCG
  u32 index;  // index into RNG_T
} Seed;  // PRNG

typedef struct {
  f32 min, max;
} Range;

typedef struct {
  f32 min, max, rng;
} RngRange;

typedef struct {
  f32 r, g, b, a;
} Color;

typedef struct Pixel {
  u8 r, g, b, a;
} Pixel;

// @deprecated
typedef u32 Cooldown;  // (ms) completeAt
typedef u32 Timer;  // (ms) completeAt
#define TIMER_PAUSE_MASK (0x80000000)
typedef u32 Ticker;  // (ticks) completeAt

typedef struct {
  u8* buf;
  u8* pos;
  u8* end;
} Arena;

typedef struct {
  u32 sz;
  char* str;
} String8;

typedef enum {
  STR_STATIC = 0,  // immutable const char*
  STR_STACK = 1,  // mutable char*
  STR_MALLOC = 2,  // malloc() heap
  STR_ARENA1 = 3,  // Arena__Push(_G.arena) heap
  STR_ARENA2 = 4,  // Arena__Push(_G.frameArena) heap
} Str8Lifetime;

typedef struct {
  char* str;
  u16 len;  // 65535 max

  bool slice;  // termination: 0 = null, 1 = slice
  // IMPORTANT: mutability of str BUFFER, not the Str8 wrapper struct
  bool mut;  // mutability: 0 = immutable, 1 = mutable
  Str8Lifetime life;  // lifetime
} Str8;

// ---
// JSON Parser Types

typedef enum {
  JSON_INVALID,
  JSON_EOF,

  // Punctuation
  JSON_OCURLY,
  JSON_CCURLY,
  JSON_OBRACKET,
  JSON_CBRACKET,
  JSON_COMMA,
  JSON_COLON,

  // Literals
  JSON_TRUE,
  JSON_FALSE,
  JSON_NULL,

  // Types
  JSON_STRING,
  JSON_NUMBER,
  JSON_BOOL,

  JSON_COUNT,
} JsonTok;  // JSON Token

typedef struct {
  JsonTok token;
  const char* symbol;
} JsonSym;  // JSON Symbol

// iterator
typedef struct {
  Str8 data;  // parser boundary
  u32 cur;  // read cursor

  // current token
  JsonTok token;  // kind
  union {
    f64 number;  // number value
    Str8 str;  // string value (view/slice)
  } token_value;

  // debug; mainly referenced when errors log
  const char* file_path;
  u32 token_start;
} Json;

// ---
// YAML Parser Types

typedef enum {
  YAML_INVALID,
  YAML_EOF,

  // Punctuation
  YAML_COLON,  // :
  YAML_DASH,  // - (list item)
  YAML_PIPE,  // | (literal block scalar)
  YAML_GT,  // > (folded block scalar)

  // Whitespace (significant in YAML)
  YAML_NEWLINE,
  YAML_INDENT,

  // Literals
  YAML_TRUE,
  YAML_FALSE,
  YAML_NULL,

  // Types
  YAML_STRING,  // quoted or unquoted
  YAML_NUMBER,
  YAML_KEY,  // foo: (key before colon)

  YAML_COUNT,
} YamlTok;

typedef struct {
  YamlTok token;
  const char* symbol;
} YamlSym;

// YAML parser state
typedef struct {
  Str8 data;  // input buffer
  u32 cur;  // read cursor

  // Current token
  YamlTok token;
  union {
    f64 number;
    Str8 str;
  } token_value;

  // Indentation tracking
  u16 indent;  // current line indentation
  u16 indent_stack[32];  // stack of indentation levels
  u8 indent_depth;  // stack depth

  // Debug
  const char* file_path;
  u32 token_start;
  u32 line;
  u32 col;
} Yaml;

// ---
// Agent Types (daemon/v1 schema)

#define AGENT_MAX_TOOLS (32)
#define AGENT_MAX_WORKERS (8)
#define AGENT_MAX_TOOL_WORKERS (8)
#define AGENT_MAX_MESSAGES (256)

typedef struct {
  char name[64];  // tool function name
  char description[256];  // human-readable description
  char workers[AGENT_MAX_TOOL_WORKERS][64];  // workers that can handle this tool
  u8 worker_count;
} AgentTool;

typedef struct {
  char name[64];
  char description[256];
  char model[64];  // provider:model (e.g., xai:grok-4-fast-reasoning)
  AgentTool tools[AGENT_MAX_TOOLS];
  u8 tool_count;
} AgentMetadata;

typedef enum {
  MSG_ROLE_SYSTEM,
  MSG_ROLE_USER,
  MSG_ROLE_ASSISTANT,
  MSG_ROLE_TOOL,
} AgentMsgRole;

#define AGENT_MAX_TOOL_CALLS (8)

// Tool call from assistant (xAI/OpenAI format)
typedef struct {
  char id[64];  // e.g., "call_abc123"
  char name[64];  // e.g., "shell__execute"
  char arguments[2048];  // JSON string of arguments
} AgentToolCall;

typedef struct {
  AgentMsgRole role;
  char content[4096];
  char tool_call_id[64];  // for tool responses (role=TOOL)
  AgentToolCall tool_calls[AGENT_MAX_TOOL_CALLS];  // for assistant messages
  u8 tool_call_count;
} AgentMessage;

// Finish reason from LLM response
typedef enum {
  FINISH_REASON_NONE,
  FINISH_REASON_STOP,
  FINISH_REASON_TOOL_CALLS,
  FINISH_REASON_LENGTH,
  FINISH_REASON_ERROR,
} AgentFinishReason;

// XAI chat completion response
typedef struct {
  AgentMessage message;  // The assistant's response message
  AgentFinishReason finish_reason;
  u32 prompt_tokens;
  u32 completion_tokens;
  bool success;
  char error[256];
} XAIResponse;

// Tool definition for XAI API
typedef struct {
  char name[64];
  char description[256];
  char parameters_json[1024];  // JSON schema for parameters
} XAIToolDef;

typedef struct {
  char system_prompt[8192];
  AgentMessage messages[AGENT_MAX_MESSAGES];
  u16 message_count;
} AgentSpec;

typedef struct {
  char apiVersion[16];  // daemon/v1
  char kind[16];  // Agent
  AgentMetadata metadata;
  AgentSpec spec;
  // Convenience fields
  char name[64];
} AgentTemplate;

typedef enum {
  AGENT_STATUS_PENDING,
  AGENT_STATUS_RUNNING,
  AGENT_STATUS_PAUSED,
  AGENT_STATUS_SUCCESS,
  AGENT_STATUS_ERROR,
  AGENT_STATUS_STOPPED,
} AgentStatus;

typedef struct {
  u32 id;  // unique session ID
  AgentStatus status;
  AgentTemplate template;  // copy of template
  u32 prompt_tokens;
  u32 completion_tokens;
  u64 created_at;
  u64 last_read_at;
} AgentSession;

#define SOCKET_BUF_SIZE (1024 * 16)

typedef struct {
  u8* data;  // data ptr
  u16 sz;  // capacity
  u16 head; /* Next write position (aka end) */
  u16 tail; /* Oldest item (aka start) */
} RingBuffer;  // Ring Buffer

typedef struct {
  RingBuffer* buf;
  u16 rb_head, rb_tail;
  u16 written, read;
  s32 err;
} IO;

typedef enum {
  SERVER_SOCKET,
  CLIENT_SOCKET,
} SocketOpts;

typedef enum {
  SOCKET_NONE,
  SOCKET_ACCEPTING,
  SOCKET_CONNECTED,
  SOCKET_CLOSED,
} SocketState;

typedef enum {
  SESSION_NONE,
  SESSION_SERVER_HANDSHAKE_AWAIT,
  SESSION_SERVER_HANDSHAKE_RESPONDED,
  SESSION_CLIENT_HANDSHAKE_REQUESTED,
  SESSION_SERVER_CONNECTED,
  SESSION_CLIENT_HANDSHAKE_RECEIVED,
  SESSION_CLIENT_HELLO_SENT,
  SESSION_CLIENT_WASM_CONNECT_CB,
  SESSION_CLIENT_CONNECTED,
  SESSION_SERVER_HUNGUP,
} SessionState;

typedef struct {
  char addr[256], port[6];
  u32 opts;
#ifdef __linux__
  u64 _nix_socket;
  struct sockaddr_in _nix_addr;
  struct sockaddr_in _nix_peer_addr;  // UDP peer address for sendto/recvfrom
  socklen_t _nix_peer_len;
  struct sockaddr_un _nix_unix_sock;  // unix domain socket file
#endif
#ifdef _WIN32
  u64 _win_socket;
  struct addrinfo* _win_addr;
#endif
#ifdef __EMSCRIPTEN__
  u32 _web_socket;
#endif
  bool unix_domain_socket;  // true for Unix domain sockets
  bool udp_socket;  // true for UDP, false for TCP (when not unix_domain_socket)
  RingBuffer reliable;  // priority; guaranteed ordered delivery
  RingBuffer unacked;  // last sent reliable batch, awaiting ack
  RingBuffer datagram;  // secondary; only sent if there's room, regenerated per frame
  RingBuffer inbound;  // incoming frames
  SocketState state;
  SessionState sessionState;
  u8 seq;
  u8 ack;
  u8 lastAckSent;
  bool pendingAck;  // true if we received payload and haven't ACKed yet
  u8 qport;
  u32 lastSentAt;  // ms
  bool lastReadErr;
  u8 key[32];
  u8 nonce[8];
  // u64 connectedAt;

  // u16 ping;
  // f32 ts;  // last client seconds since connect (for RTT)
  // u8 rate;  // KB/sec
  // u8 cl_updaterate;  // snapshot/sec
  // u8 cl_interp;  // lag compensation (ms)
  // u64 lastPacket, lastSnapshot;
  // void* userdata;
} Socket;
typedef void (*Socket__alloc_t)(Socket** sock);
typedef void (*Socket__accept_t)(Socket* listener, Socket* accepted);
typedef void (*Socket__connect_t)(Socket* client);
typedef void (*Socket__recv_t)(Socket* sock, u8* buf, u32 len);
typedef void (*Socket__send_t)(Socket* sock, u8* buf, u32 len);

// Per-client session state for UDP hub (one per connected client)
#define MAX_SESSIONS (16)

typedef struct {
  bool active;  // true if session slot is in use
  char name[64];  // client name (e.g., "term", "worker-1") from first CL_CMD_REQUEST
  char requester_name[64];  // for workers: name of term session that requested current task
#ifdef __linux__
  struct sockaddr_in peer_addr;  // client's IP:port for sendto
  socklen_t peer_len;
#endif
  RingBuffer reliable;  // outbound guaranteed-delivery queue
  RingBuffer unacked;  // awaiting ack (stop-and-wait ARQ)
  RingBuffer datagram;  // outbound unreliable, rebuilt per frame
  RingBuffer inbound;  // incoming frames from this client
  u8 seq;  // outgoing sequence number
  u8 ack;  // last received sequence from client
  u8 lastAckSent;  // last ack we sent to client
  bool pendingAck;  // true if we received payload and haven't ACKed yet
  u8 qport;  // client's qport (for NAT traversal)
  u32 lastSentAt;  // ms, for retransmit timeout
  u32 lastRecvAt;  // ms, for session timeout
  SessionState sessionState;
  u8 key[32];  // per-session ChaCha20 key (future: handshake)
  u8 nonce[8];  // per-session ChaCha20 nonce
} NetSession;

typedef struct {
  bool b0, b1, b2, b3, b4, b5, b6, b7;
} BitArrayU8;

typedef union {
  u32 u;
  s32 s;
} VIntSU;

typedef struct {
  VIntSU value;
  bool sign;
} VInt32;

typedef struct {
  u32 schedule[16];
  u32 keystream[16];
  size_t available;
} ChaCha20;

// ---
// RFC 0004: Command Message Layer

typedef enum { CMD_PENDING = 0, CMD_RUNNING = 1, CMD_COMPLETED = 2, CMD_FAILED = 3 } CmdState;

typedef struct {
  u64 id;  // Unique command ID (snowflake/timestamp)
  u64 parent_id;  // Parent command ID (for traces/sub-commands)
  char term[64];  // Originator node name (e.g., "term-1")
  char worker[64];  // Executor node name (e.g., "worker-1")
  char cmd[128];  // Command name (e.g., "fs.read", "agent.run")
  char args[4096];  // JSON arguments
  char result[4096];  // JSON result or error message
  u8 state;  // CmdState (PENDING, RUNNING, COMPLETED, FAILED)
  u8 progress;  // 0-100
} CmdMessage;

typedef struct {
  u8 state;  // CmdState (PENDING, RUNNING, COMPLETED, FAILED)
  u32 tick_count;  // Number of loop iterations
  void* context;  // Tool-specific state (PTY handle, HTTP request, etc.)
} CmdExecState;

// Tick function signature (continuation-style)
typedef CmdExecState (*CmdTickFn)(CmdExecState prev, CmdMessage* cmd);

typedef struct {
  u32 capacity;
  u32 count;
  CmdMessage* commands;  // Array of pending commands
  CmdExecState* states;  // Parallel array of execution states
} CmdRegistry;

// Forward declarations for CmdRegistry
void CmdRegistry__init(CmdRegistry* reg, u32 capacity);
bool CmdRegistry__add(CmdRegistry* reg, CmdMessage* cmd);
void CmdRegistry__remove(CmdRegistry* reg, u32 index);
void CmdRegistry__tick(CmdRegistry* reg);
CmdTickFn CmdRegistry__getTickFn(CmdMessage* cmd);

typedef enum {
  SV_INVALID = 0,
  CL_STDIN = 0x01,
  SV_STDOUT = 0x02,
  CL_CMD_REQUEST = 0x03,  // DEPRECATED - use CL_SESSION_CREATE instead
  SV_CMD_RESPONSE = 0x04,  // DEPRECATED - use agent streaming events instead
  MSG_CMD = 0x05,  // Unified command message (RFC 0004)

  // Agent streaming events (hub/worker → term)
  SV_AGENT_START = 0x07,  // agent session started: [template_name][model]
  SV_AGENT_TOOL_CALL = 0x08,  // tool being invoked: [tool_name][arguments_json]
  SV_AGENT_TOOL_RESULT = 0x09,  // tool result: [tool_name][result_text]
  SV_AGENT_ASSISTANT = 0x0A,  // assistant message: [content]
  SV_AGENT_COMPLETE = 0x0B,  // session complete: [prompt_tokens][completion_tokens]
  SV_AGENT_ERROR = 0x0C,  // error occurred: [error_message]

  // Agent delegation (hub → worker)
  SV_AGENT_REQUEST =
      0x0D,  // hub requests worker to run agent: [template_name][prompt][requester_name]

  // Session management messages (RFC 0004)
  CL_SESSION_CREATE = 0x10,  // [code:u8][template_name:Str8][template_body:Str8][prompt:Str8]
  CL_SESSION_APPEND = 0x11,  // [code:u8][session_id:u32][msg:Str8]
  CL_SESSION_PAUSE = 0x12,  // [code:u8][session_id:u32]
  CL_SESSION_RESUME = 0x13,  // [code:u8][session_id:u32]
  CL_SESSION_DELETE = 0x14,  // [code:u8][session_id:u32]
  CL_GOODBYE = 0x15,  // [code:u8][sender:Str8]
  SV_SESSION_CREATED = 0x20,  // [code:u8][session_id:u32]
  SV_SESSION_STATE = 0x21,  // [code:u8][session_id:u32][state:u8]
} NetMsgCode;

typedef enum {  // u8 implements BitArray
  NFRAME_OK = 0,
  NFRAME_INVALID = 1,
  NFRAME_RELIABLE = 2,
  NFRAME_DATAGRAM = 4,
  NFRAME_EMPTY_ACK = 8,
} NetFrameFlags;

typedef struct {
  u32 len;  // length of entire frame
  u8 flags;  // NetFrameFlags
  u8 seq;  // outbound sequence
  u8 ack;  // last sequence acknowledged
  u8 qport;  //  (ip+qport+secret) == secure session uuid
  u8* data;  // payload data
  u32 crc;  // checksum (because transport layer enforcement is unreliable)
} NetFrame;

typedef enum {
  MODE_WORKER,
  MODE_HUB,
  MODE_TERM,
} ServerMode;

typedef enum {
  CLI_ONESHOT,  // default: process one command and exit (ai-friendly)
  CLI_INTERACTIVE,  // -i flag: raw terminal, d> prompt, stays running
} CliMode;

// ---
// Math

#include <math.h>  // IWYU pragma: keep

#include "app/common/MathTables.c"  // IWYU pragma: keep

// ---
// Pending Tool Batch Tracking (for distributed tool execution)

typedef struct {
  u64 cmd_id;  // Command ID for this tool
  char tool_name[64];  // Tool name (e.g., "shell__execute")
  char tool_call_id[128];  // LLM tool call id (e.g., "call_001")
  char result[4096];  // Result buffer
  u8 batch_idx;  // Position in batch [0, batch_total)
  bool received;  // Whether result has been received
} PendingToolResult;

typedef struct {
  u64 batch_id;  // Unique batch identifier
  u8 batch_total;  // How many tools in this batch
  u8 batch_received;  // How many results received so far
  u32 dispatch_time_ms;  // When batch was dispatched (for timeout)
  bool complete;  // Whether all results received
  PendingToolResult tools[32];  // Results for each tool (indexed by batch_idx)
} PendingToolBatch;

typedef struct {
  PendingToolBatch batches[16];  // Pending batches
  u8 batch_count;  // Number of active batches
} PendingToolBatchRegistry;

// ---
// Global State

typedef struct Engine__State {
  bool quit;
  ServerMode mode;
  Arena *arena, *frameArena, *curlArena;

  struct {
    Seed nosync;
  } seeds;  // prng

  u64 unow;  // cycles
  u32 now;  // ms

  bool promptVisible;
  char prompt[1024];
  bool promptDirty;

  // Save original terminal settings and restore on exit
  struct termios old_tio, new_tio;

  u8 queue_ct;
  Cmd queue;

  char XAI_API_KEY[120];

  // CLI
  CliMode cli_mode;  // CLI_ONESHOT (default) or CLI_INTERACTIVE (-i)
  u8 verbosity;  // Verbosity level (0-6): 0=off, 1=tools, 2=session, 3=xai, 4=network, 5=message, 6=io
  char oneshot_cmd[1024];  // command to execute in oneshot mode
  char process_name[128];  // -name <name> for process identification
  char default_template[64];  // -t <template> for default agent template

  // Net
  char hub_host[256];  // UDP host for hub (default: 127.0.0.1)
  u16 hub_port;  // UDP port for hub (default: 6543)
  u32 session_id;  // Worker session ID (only used in worker mode)

  Socket__connect_t onsockconnect;
  Socket__alloc_t onsockalloc;
  Socket__accept_t onsockaccept;
  Socket__send_t onsocksend;
  Socket__recv_t onsockrecv;

  Socket hub_sv;  // Hub's listening socket (renamed from server_sv)
  NetSession sessions[MAX_SESSIONS];  // Per-client session state for UDP hub
  u8 session_ct;  // Number of active sessions

  AgentSession agent_sessions[MAX_SESSIONS];  // Agent sessions (FSM)
  u8 agent_session_ct;

  Socket term_cl;  // Term's client socket (renamed from client_cl)
  u8 worker_sv_ct;  // Worker server count (renamed from agent_sv_ct)
  Socket worker_sv[10];  // Worker server sockets (renamed from agent_sv)
  Socket worker_cl;  // Worker client socket (renamed from agent_cl)

  // Command Registry
  CmdRegistry cmd_reg;

  // Pending Tool Batch Registry (for distributed tool execution)
  PendingToolBatchRegistry pending_batches;

} Engine__State;

#ifdef ENGINE_DLL
Engine__State* _G = NULL;  // ptr to main thread
#else
Engine__State* _G = &(Engine__State){0};  // stack allocation in main thread
#endif

//#if defined(ENGINE_DLL)
// clang-format off
char* _format_bytes(char* buf, u64 bytes, bool round); // fwd decl
char* format_bytes(u64 bytes, bool round); // fwd decl
#include "app/common/Arena.c"  // IWYU pragma: keep
#include "app/common/Math.c"  // IWYU pragma: keep
#include "app/common/Timer.c"  // IWYU pragma: keep
#include "app/common/Utils.c"  // IWYU pragma: keep
#include <ctype.h> // IWYU pragma: keep // isprint, isdigit, isspace
#include "app/common/String.c"  // IWYU pragma: keep

#include "app/common/Sock.c"  // IWYU pragma: keep
#include "app/common/RingBuffer.c"  // IWYU pragma: keep
#include "app/common/IO.c"  // IWYU pragma: keep
#include "app/common/ChaCha.c"  // IWYU pragma: keep
#include "app/common/CRC.c"  // IWYU pragma: keep

// clang-format on
//#endif

// ---
// Systems

// clang-format off
// order matters
#include "app/common/Sleep.c"  // IWYU pragma: keep
#include "app/common/Terminal.c"  // IWYU pragma: keep

#include "app/common/File.c"  // IWYU pragma: keep
#include "app/common/Env.c"  // IWYU pragma: keep

#include <curl/curl.h>
#include "app/common/Curl.c"  // IWYU pragma: keep

#include "app/common/Spawn.c"  // IWYU pragma: keep
#include "app/common/Json.c"  // IWYU pragma: keep
#include "app/common/Yaml.c"  // IWYU pragma: keep
#include "app/common/XAI.c"  // IWYU pragma: keep

// Plugins
#include "app/plugins/agent/models/Template.c"  // IWYU pragma: keep
#include "app/plugins/agent/models/Worktree.c"  // IWYU pragma: keep
#include "app/plugins/agent/models/Container.c"  // IWYU pragma: keep
#include "app/plugins/agent/models/Message.c"  // IWYU pragma: keep

// Forward declarations for cross-file dependencies
bool Agent__runLoop(const char* template_name, const char* user_prompt, Socket* socket);
static int CliParser__parse(int argc, char* argv[]);

#include "app/plugins/agent/models/Session.c"  // IWYU pragma: keep
#include "app/plugins/agent/models/Network.c"  // IWYU pragma: keep
#include "app/plugins/agent/controllers/Agent.c"  // IWYU pragma: keep
// /Plugins


#include "app/systems/CliParser.c"  // IWYU pragma: keep
#include "app/systems/Cmd.c"  // IWYU pragma: keep
#include "app/systems/Repl.c"  // IWYU pragma: keep
// clang-format on
