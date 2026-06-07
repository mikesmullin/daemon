# Testing the Application

## Overview

Unit tests are C programs located in `test/unit/app/common/` that validate modules in `src/app/common/`. Each test file:
- Includes `src/unity.h` with `ENGINE_TEST` defined (compile-time constant header)
- Uses `ASSERT()` macros that terminate on failure (defined in unity.h with debug context)
- Contains a `main()` function that returns 0 on success, non-zero on failure
- Follows scenario-based test structure with comments marking test sections

## Directory & File Mapping

Test coverage exists for these modules:
- `test/unit/app/common/RingBuffer.c` ↔ `src/app/common/RingBuffer.c` (ring buffer data structure)
- `test/unit/app/common/Sock.c` ↔ `src/app/common/Sock.c` (socket I/O)
- `test/unit/app/common/CRC.c` ↔ `src/app/common/CRC.c` (checksum)
- `test/unit/app/common/Env.c` ↔ `src/app/common/Env.c` (environment variables)
- `test/unit/app/common/RingBuffer.c`, `Spawn.c`, `Curl.c`, `ChaCha.c` (cryptography, process spawning, HTTP client)

Although it remains an aspirational goal,
not all `src/app/common/` modules have unit test coverage (e.g., `String.c`, `Math.c`, `File.c`);
we have been creating the unit test coverage as we modify those existing files, or add new files.

## Running Unit Tests

Invoke tests via Makefile:
```bash
TEST=RingBuffer make test
```

This:
1. Compiles `test/unit/app/common/{TEST}.c` with CLANG (C99 standard, debug symbols, linked with `-lm -lcurl`)
2. Outputs executable to `build/{TEST}`
3. Runs the executable and reports "Test passed" or "Test failed"
4. Test output includes trace logs (e.g., `*** TRACE file:line functionName`)

## After Modifying Source Files

When changing a module in `src/app/common/` that has unit tests:
1. Update the corresponding test file if the module interface/behavior changed
2. Run `TEST=ModuleName make test` to verify tests still pass
3. Commit test changes alongside source changes

# ai tests

Isolated test files in `ai/test/` for agent use only:
- **Location**: `ai/test/Makefile` and `ai/test/*.c`
- **Purpose**: Ad-hoc testing without full application complexity
- **Lifecycle**: Temporary; can be deleted when no longer useful
- **When to use**: 
  - Testing subsystems in isolation (e.g., crypto, networking)
  - Verifying understanding of concepts before integrating
  - Avoiding cascading failures from unrelated app bugs

Example: `ai/test/Makefile` with `test_netframe_crypto.c` for cryptography testing.

# Running the application

## Build & Start Daemon

The typical test scenario for the main application is
- ensure no prior version of process is running
- rebuild the binary
- start the server (hub)
- start the client (term)
- compare log output from server and client

What we expect to see is:
- server listens
- client connects
- server sends exactly one "server hello" message
  - server receives the "client hello" message
    - server acks receipt to client
- client sends exactly one "client hello" message
  - client receives the "server hello" message
    - client acks receipt to server
- server and client are now idle (no new messages transmitted
- messages are
  - valid crc
  - valid encryption/decryption
  - valid serialize/deserialize
- queues are processed entirely
- no segfault or other unexpected errors

The commands used to rebuild and start the hub:
```bash
make rebuild                   # Rebuild from source (clean + compile + pkill old processes)
d4 -t tooltest -v "What is 2+2?"  # Start hub with template and prompt
```

**What each command does:**
- `make rebuild`: Full clean compile to `build/main` (automatically kills any running d4 processes)
- `d4 -t tooltest -v "..."`: Start hub (default role) with the `tooltest` template, verbosity level 1, and a prompt

**Note:** Manual `pkill -9 d4` is no longer needed before `make rebuild` since it's now done automatically.

**CLI Modes:**
- Default (no flags): Oneshot mode - execute a command with a template and exit immediately (AI-friendly, default)
  - Syntax: `d4 [-v] [-r/--role <role>] [-h/--hub <hub>] [-t/--template <template.yaml>] <prompt...>`
- Interactive mode (with `-i` flag): DEPRECATED - removed in v4. Use oneshot mode for all operations.

See `ai/docs/cli.md` for full CLI documentation.

**Optional CLI arguments:**
- `d4 -t tooltest -v "prompt"`: Hub mode with tooltest template (default role is hub)
- `d4 -h 127.0.0.1:6543 -t tooltest -v "prompt"`: Term mode connecting to hub (role defaults to term when -h is specified)
- `d4 -r worker -h 127.0.0.1:6543 -t tooltest "prompt"`: Explicitly set role to worker

Note: Interactive mode (`-i` flag) has been removed. All operations use oneshot mode with templates.

## Reading Logs

**Hub-side activity:**
Run with verbosity to see logs:
```bash
d4 -t tooltest -vvv "List the files in src directory"
```
Output appears on stdout with log entries prefixed by log level and context.

**Important caveats:**
- Hub output is verbose at high verbosity levels
- Verbosity levels: 1=tools, 2=session, 3=xai, 4=network, 5=message, 6=io
- Output includes timestamps and debug context

## Testing Scenarios

### Scenario 001: 1-node test (no tool calls)
Test basic LLM integration without tool invocation:
```bash
pkill -9 d4 2>/dev/null
make rebuild
d4 -t tooltest -v "What is 2+2?"
```
Expect: LLM response printed to stdout
```
🤖 Assistant: 4
✅ Session complete (tokens: 476 prompt, 1 completion)
```

### Scenario 002: 1-node test with tool calls
Test tool execution in a single agent loop:
```bash
pkill -9 d4 2>/dev/null
make rebuild  
d4 -t tooltest -v "List the files in the src directory"
```
Expect: Agent detects need for `fs__ls` tool, executes it, processes result, and returns final response:
```
[TOOLS] LLM invoked 1 tools
[TOOLS] Executing tool: fs__ls
[TOOLS] Tool call id=call_12345
[TOOLS] Tool call params: {"path":"src"}
[TOOLS] Tool result: ...
🤖 Assistant: The src directory contains: app, dll.c, main.c, unity.h.
✅ Session complete
```

### Scenario 003: Verbosity levels
Test each verbosity level shows correct logging layers:
```bash
# Level 1: Tools + Assistant
d4 -t tooltest -v "List files in src" 2>&1 | grep -E "\[TOOLS\]|Assistant"

# Level 2: Session + Tools + Assistant
d4 -t tooltest -vv "List files in src" 2>&1 | grep -E "\[SESSION\]|\[TOOLS\]|Assistant"

# Level 3: XAI + Session + Tools + Assistant
d4 -t tooltest -vvv "List files in src" 2>&1 | grep -E "\[XAI\]|\[SESSION\]|\[TOOLS\]"
```

Each level adds additional log output per NET_CODE.md section 16.2.1.

## Remote/Cross-Machine Testing

This section describes testing across multiple physical machines on a LAN.

### Network Topology

```
                    ┌──────────────────────┐
                    │   d4 hub             │
                    │   10.1.10.1 (router) │
                    │   (OrangePi 5 Plus)  │
                    │   Armbian arm64      │
                    └─────────┬────────────┘
                              │ UDP :6543
              ┌───────────────┼───────────────┐
              │               │               │
              ▼               ▼               ▼
    ┌─────────────────┐ ┌───────────┐ ┌─────────────────┐
    │ d4 worker       │ │ d4 term   │ │ mintty term     │
    │ Arch Linux PC   │ │ (any PC)  │ │ Android phone   │
    │ (this machine)  │ │           │ │ (Pixel 6)       │
    └─────────────────┘ └───────────┘ └─────────────────┘
```

**Nodes:**
- **Hub (10.1.10.1)**: OrangePi 5 Plus running Armbian (arm64). Runs as containerized systemd service. Has XAI API key. Routes commands between clients. Hostname is `pfsense`, although unrelated to pfSense project.
- **Worker (Arch Linux PC)**: Runs worker mode, executes tool_calls (e.g., `shell_execute` to control lights attached via USB/GPIO).
- **Term (any PC)**: Interactive terminal client for testing.
- **Mintty (Android)**: Mobile terminal client. See `tmp/mintty/` for details. *(TODO: describe mintty integration)*

### Deployment Architecture

Hub runs as a Podman Quadlet systemd unit on Armbian, deployed via Ansible.

**Key files:**
- [Dockerfile.alpine](Dockerfile.alpine) - Multi-arch container image
- [Makefile](Makefile#L50-L70) - Build/deploy targets (`alpine-arm64`, `push-arm64`, `deploy-daemon`)
- [tmp/router/roles/daemon/](tmp/router/roles/daemon/) - Ansible role (podman install + Quadlet unit)

### Deployment Workflow

**One-time setup:**
```bash
# If cross-platform builds fail with "Exec format error":
sudo podman run --rm --privileged multiarch/qemu-user-static --reset -p yes
```

**Build, push, restart:**
```bash
make alpine-arm64
make push-arm64
ssh 10.1.10.1 "systemctl --user restart daemon-hub"
```

**Verify:** 
```bash
ssh 10.1.10.1 "systemctl --user status daemon-hub"
```

**View Logs:**
```bash
ssh 10.1.10.1 "journalctl | grep systemd-daemon-hub | tail -40"
```

### Test Scenarios

1. **Remote hub with template**
```bash
make rebuild  # Rebuild locally (kills old processes automatically)

# On local machine, start hub listening
d4 -t tooltest

# On another terminal, connect term client to hub
d4 -h 127.0.0.1:6543 -t tooltest "What is 2+2?"
```

2. **Remote home automation**
```
Phone (mintty) → Hub (10.1.10.1) → Worker (Arch PC) → Lights
```
- Phone sends: "turn all lights red"
- Hub invokes XAI, gets `tool_call: shell_execute("govee color red")`
- Hub routes to worker, worker executes, returns result

### Mintty (Android Terminal)

Mintty is a Kotlin Android app that connects directly to the d4 hub over UDP, enabling mobile control of the daemon network from a smartphone.

**Architecture:**
```
┌─────────────┐     UDP/6543       ┌─────────────┐
│  Android    │ ────────────────▶ │  d4 hub     │
│  Phone      │ ◀──────────────── │  (router)   │
└─────────────┘  ChaCha20+CRC32    └─────────────┘
```

**Key files:**
- [tmp/mintty/](tmp/mintty/) - Android app source
- [NetworkClient.kt](tmp/mintty/app/src/main/java/com/mintty/app/NetworkClient.kt) - d4 protocol implementation (ChaCha20, CRC32, NetFrame)

**Protocol:** Mintty implements the full d4 NetFrame protocol:
- ChaCha20 encryption (replaces old RC4)
- CRC32 checksums (LITTLE_ENDIAN byte order)
- VInt32 encoding (d4 custom: 6 bits first byte, 7 bits rest)
- Str8 strings (VInt32 length prefix, not u8)
- `CL_SESSION_CREATE` messages to hub (template name, body, and prompt)
- Agent streaming event messages from hub

### DEV vs PROD Environments

| Aspect | DEV (Local) | PROD (Remote) |
|--------|-------------|---------------|
| Hub location | `10.1.10.121` (this PC) | `10.1.10.1` (Armbian router) |
| Hub process | tmux session | systemd Quadlet unit |
| Change NetworkClient.kt | `SERVER_HOST = "10.1.10.121"` | `SERVER_HOST = "10.1.10.1"` |
| Log access | `tmux capture-pane -t d4hub -p` | `ssh 10.1.10.1 journalctl --user -u daemon-hub -f` |

**Testing locally before remote (recommended):**

Before deploying to PROD (Armbian), testing with Android devices or remote machines... test locally (1-node, 2-node, 3-node) to verify changes.

**Note on remote testing:** Currently d4 supports hub mode (listening on local loopback) and term mode (connecting to remote hub) via the `-h` flag, but not true interactive multi-client communication. For now, test basic LLM functionality first, then consider the multi-client scenarios as future work.

one node:
```bash
make rebuild

# Test with different verbosity levels
d4 -t tooltest -v "What is 2+2?"      # Tools + Assistant
d4 -t tooltest -vv "List files in src"  # Session + Tools + Assistant
d4 -t tooltest -vvv "What color is the sky?"  # XAI + Session + Tools + Assistant
```

This verifies the basic oneshot functionality works before deploying to remote machines.

moving to more than one node:

```bash
# Kill existing processes and create tmux session with hub + 2 terms
pkill -9 d4 2>/dev/null
tmux new-session -d -s d4test -x 200 -y 50 -n hub
tmux send-keys -t d4test:hub "cd /workspace/daemon-v4 && d4 -i hub" Enter
sleep 1
tmux new-window -t d4test -n term1
tmux send-keys -t d4test:term1 "d4 -i term -name term1" Enter
tmux new-window -t d4test -n term2
tmux send-keys -t d4test:term2 "d4 -i term -name term2" Enter

# Wait for connections, then send different commands from each term
sleep 3
tmux send-keys -t d4test:term1 "chat what is 2+2?" Enter
tmux send-keys -t d4test:term2 "chat tell me a joke" Enter

# Capture outputs to verify each client got their own response
sleep 10
tmux capture-pane -t d4test:term1 -p -S -30 | tail -15
tmux capture-pane -t d4test:term2 -p -S -30 | tail -15

# Cleanup
tmux kill-session -t d4test
```

This verifies session isolation works before testing with Android devices.

**Troubleshooting tip:** If a client receives stale/wrong responses, the hub may have a backlog of messages it is retransmitting from a previous session. Restart the hub to flush the retransmit queue, then restart the client.

**DEV testing workflow:**
```bash
# 1. Start hub locally in tmux
pkill -9 main
tmux new-session -d -s d4hub "cd /workspace/daemon-v4 && ./build/main -i hub -l 0.0.0.0:6543 -name local-hub"

# 2. Build and install APK
cd tmp/mintty && ./gradlew assemblePhoneDebug
adb install -r app/build/outputs/apk/phone/debug/app-phone-debug.apk

# 3. Test via ADB
adb shell am force-stop com.mintty.app
adb shell am start -n com.mintty.app/.MainActivity

# 4. Check hub logs
tmux capture-pane -t d4hub -p -S -50
```

**PROD testing workflow:**
```bash
# 1. Update SERVER_HOST in NetworkClient.kt to 10.1.10.1
# 2. Build and install APK (same as DEV)

# 3. Verify hub is running on Armbian
ssh 10.1.10.1 "systemctl --user status daemon-hub"

# 4. Watch hub logs (in separate terminal)
ssh 10.1.10.1 "journalctl --user -u daemon-hub -f"

# 5. Test via ADB (same commands as DEV)

# If hub needs restart after code changes:
make alpine-arm64 && make push-arm64
ssh 10.1.10.1 "systemctl --user restart daemon-hub"
```

### Testing Mintty with ADB

**Prerequisites:**
- `adb` installed on dev machine
- Android device(s) connected via USB with USB debugging enabled

**Device IDs:**
| Device | Serial ID | Model | APK Flavor | Package Name |
|--------|-----------|-------|------------|--------------|
| Google Pixel 6 | `1B061FDF6002SD` | oriole | `phone` | `com.mintty.app` |
| Amazon Kindle Fire | `G090ME08750709T8` | KFDOWI | `fire` | `com.mintty.app.fire` |

List connected devices: `adb devices -l`

**Screen reading and input automation:** See [ai/skills/tap/SKILL.md](ai/skills/tap/SKILL.md) for the `tap` tool which provides screen reading and input automation via ADB.

**Build and install (both devices):**
```bash
cd tmp/mintty

# Build both flavors
./gradlew assemblePhoneDebug assembleFireDebug

# Install to Pixel 6
adb -s 1B061FDF6002SD install -r app/build/outputs/apk/phone/debug/app-phone-debug.apk

# Install to Kindle Fire
adb -s G090ME08750709T8 install -r app/build/outputs/apk/fire/debug/app-fire-debug.apk
```

**Launch app:**
```bash
# Pixel 6
adb -s 1B061FDF6002SD shell am start -n com.mintty.app/.MainActivity

# Kindle Fire (note: activity path differs from package name)
adb -s G090ME08750709T8 shell am start -n com.mintty.app.fire/com.mintty.app.MainActivity
```

**Read screen (using tap tool):**

```bash
cd /workspace/daemon-v4/ai/skills/tap && source .venv/bin/activate

# List connected devices
python main.py devices

# Read screen from specific device
python main.py read-screen --format text --device 1B061FDF6002SD     # Pixel 6
python main.py read-screen --format summary --device G090ME08750709T8  # Kindle Fire

# Find element coordinates
python main.py find-element "Send" --device 1B061FDF6002SD
```

**Tap and type (coordinates differ per device):**

| Device | Input Field | Send Button (keyboard visible) |
|--------|-------------|--------------------------------|
| Pixel 6 | (540, 2064) | (931, 1407) |
| Kindle Fire | (400, 1076) | (728, 747) |

Note: The Send button position changes when the on-screen keyboard appears. The coordinates above are for when the keyboard is visible (after tapping the input field).

```bash
# Pixel 6
adb -s 1B061FDF6002SD shell input tap 540 2064
adb -s 1B061FDF6002SD shell input text "hello"
adb -s 1B061FDF6002SD shell input tap 931 1407

# Kindle Fire  
adb -s G090ME08750709T8 shell input tap 400 1076
adb -s G090ME08750709T8 shell input text "hello"
adb -s G090ME08750709T8 shell input tap 728 747
```

**Check app logs:**
```bash
adb logcat -c                                    # Clear log buffer
adb logcat -d | grep -i "mintty" | tail -30      # Dump recent mintty logs
```

### Debugging Connectivity Issues

**Symptom:** App shows "Error: null" or connection timeout

**Step 1: Verify basic network path**
```bash
# From phone (via adb shell)
adb shell ping -c 3 10.1.10.121   # Ping dev machine
adb shell ping -c 3 10.1.10.1     # Ping prod hub
```
Note: ICMP may be blocked even when UDP works. Don't rely solely on ping.

**Step 2: Test UDP specifically with netcat**
```bash
# On hub machine (listener)
nc -ul -p 6543

# On phone (sender) - via adb shell or Termux
echo 'HELLO_FROM_PHONE' | nc -u -w 1 10.1.10.121 6543
```
If the message appears on the hub side, UDP connectivity is confirmed.

**Step 3: Check app exception details**
```bash
adb logcat -d | grep -E "mintty.*Error|Exception" | tail -10
```

### Common Protocol Bugs & Fixes

| Error | Cause | Fix |
|-------|-------|-----|
| `CRC mismatch: expected AABBCCDD, got DDCCBBAA` | Endianness mismatch | Use `ByteOrder.LITTLE_ENDIAN` for all ByteBuffer |
| `BufferUnderflowException` in parseFrame | VInt32 decoded wrong length | Implement d4's custom VInt: 6 bits first byte, 7 bits rest |
| `BufferUnderflowException` in readStr8 | String length assumed u8 | Use VInt32 for Str8 length prefix |
| `BufferOverflowException` in buildFrame | ByteBuffer position exceeded | Use `rewind()` instead of `flip()` + `position()` |

**Key protocol details:**
- **Byte order**: Always LITTLE_ENDIAN (matches C's native order on x86/arm)
- **VInt32 format**: First byte `[cont][sign][6 bits]`, rest `[cont][7 bits]`
- **Str8 format**: `[VInt32 length][UTF-8 bytes]`
- **CRC32**: Standard CRC32, appended as 4 bytes little-endian

**Network requirements:**
- Phone must be on same LAN as hub (WiFi to 10.1.10.0/24)
- UDP port 6543 must not be firewalled

