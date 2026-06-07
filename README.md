> 📦 **Part of the [Daemon multi-version archive](https://github.com/mikesmullin/daemon).** This is **v3** — a ground-up Bun rewrite: Podman-sandboxed agents, containerized sessions, a plugin architecture, and a persistent db. Shares no history with v1/v2.
>
> **Versions:** [v1](https://github.com/mikesmullin/daemon/tree/v1) · [v2](https://github.com/mikesmullin/daemon/tree/v2) · [v3](https://github.com/mikesmullin/daemon/tree/v3) · [v4](https://github.com/mikesmullin/daemon/tree/v4) · [v2-web-ui](https://github.com/mikesmullin/daemon/tree/v2-web-ui) · [overview](https://github.com/mikesmullin/daemon)

---

# Daemon V3

This is the third iteration of the Daemon project, a local AI agent runner and management system.
It is built with [Bun](https://bun.com) and uses Podman for sandboxing agents.

## 🤖 AI Agent Context

**If you are an AI agent working on this codebase, read this section first.**

### 1. Project Structure
- **Core**: `index.mjs` (entry point), `daemon/` (main loop), `common/` (utils, globals, db).
- **Plugins**: `plugins/` contains the modular logic. `plugins/agent/` is the primary plugin for managing AI agents.
- **Data**: `db/` stores sessions and groups. `agent/templates/` stores agent definitions.
- **CLI**: `cli.mjs` is the command-line interface.

### 2. Setup & Installation
Run these commands once to set up the environment:

```bash
# Install dependencies
bun install

# Build container image (includes host bun cache for faster module resolution)
podman build -t daemon-v3-image .

# Link the CLI command 'd' globally
bun link
```

### 3. Development Workflow
- **Start Daemon**: `d -d` (runs in background)
- **Stop Daemon**: `d -k` (kills background process)
- **Restart**: `d -k && d -d`
- **Logs**: `podman logs <session_id>` (for agent containers) or check stdout if running in foreground.

### 4. Testing

Prefer to run tests after making changes, using commands like:

```
d -k && d -d && d clean # kill proc, restart (daemonized), make clean
d tool agent__session__new default "what is 3+3?" # begin simple test
sleep 3 # allow for completion (<=3sec is ideal)
d tool agent__session__log 1 # check output
d agent__session__last 1 # check agent response
d agent__session__status 1 # check agent state
d agent__session__ps 1 # check container state
```

After major changes, you may also run this more comprehensive (but slower) test:

```bash
./tests/integration/cli-test.sh
```

This script covers the full lifecycle: starting the daemon, creating sessions, sending messages, and cleanup.

### 5. Documentation & Specs
Detailed specifications and planning documents are located in the `tmp/` directory:
- **PRD**: `tmp/PRD_DAEMON_V3.md` (Product Requirements Document)
- **Refactor Plan**: `tmp/REFACTOR.md`
- **Architecture**: `tmp/PLAN_A.md`

## Usage

### Basic Commands
```bash
d                       # Start interactive REPL
d -d                    # Start daemon in background
d agent list            # List available templates
d agent new default     # Create a new session
d sessions              # List active sessions
d session <id> chat "msg" # Send message to agent
d session <id> last     # Get last response
```

## Architecture Notes
- **Runtime**: Bun.js
- **Containerization**: Podman (using `daemon-v3-image`)
- **Communication**: Unix Sockets for CLI-Daemon (`cli.sock`) and Host-Container communication.
- **Persistence**: YAML-based flat-file database in `db/` and `agent/templates/`.
- **Agent Loop**: Runs inside the container (`plugins/agent/controllers/agent-loop.mjs`), polling the DB for messages.

