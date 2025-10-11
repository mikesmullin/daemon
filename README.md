# 👺 Daemon CLI

A Multi-Agent Delegation (MAD) CLI 
for orchestrating multiple AI agents using the GitHub Copilot API. 
Promotes Unix-philosophy over TUI.
Built for advanced users who want to delegate complex tasks across specialized agents while maintaining simple, pipeable command-line interfaces.

We aim to be deterministic, testable, auditable, and composable.

## Features

- 🤖 **Multi-agent orchestration** - Delegate tasks across specialized AI agents
- 📄 **YAML-based agent templates** - Clean, structured agent definitions
- 🔄 **Session-based conversations** - Persistent, stateful agent interactions
- 🔒 **Security allowlist** - Safe terminal command execution with approval controls
- 🛠️ **Rich tool ecosystem** - File operations, shell execution, web fetching, and more
- 🔑 **GitHub OAuth integration** - Seamless authentication with automatic token management
- 🚀 **Pump/Watch modes** - Run one iteration or continuously monitor
- 🔗 **Pipeline-friendly** - Designed for Unix-style stdin/stdout composition
- 📊 **Multiple output formats** - JSON, YAML, CSV, and table output for scripting

## Architecture

The system uses a **file-based multi-agent architecture** with YAML configuration:

Code built with Node.js ES6 module syntax, with dependencies:
- **OpenAI SDK** for Copilot API compatibility

### Agent Templates (`agents/templates/*.yaml`)
Reusable agent blueprints that define:
- Agent capabilities and system prompts
- Available tools and models
- Behavioral parameters
- Can be versioned and shared across projects

### Agent Sessions (`agents/sessions/`)
Active conversation instances created from templates:
- Persistent conversation history
- Session state tracking (idle, running, success, fail)
- Multiple sessions can be spawned from the same template
- Isolated workspaces for each session

### Daemon Modes
- **Pump mode**: Execute one iteration and exit (perfect for testing/debugging)
- **Watch mode**: Continuous monitoring with configurable check-in intervals
- **Command mode**: Direct session manipulation (new, push, fork, eval)

## Installation

```bash
npm install
npm link  # Creates global 'd' command alias
```

## Usage

Use `d --help` to see all available commands and options. The tool follows Unix philosophy with simple, composable commands:

```bash
# Create a new agent session
d new solo "Check if Redis is running with podman"

# Create session from stdin (pipe-friendly)
echo "System status check" | d new solo
echo "Deploy app" | d new executor -

# List all active sessions
d sessions

# Add a message to an existing session
d push 0 "Now check PostgreSQL as well"

# Fork a session to try a different approach
d fork 0 "Use docker instead of podman"

# Evaluate a session (let the agent process pending work)
d eval 0

# Run daemon in pump mode (one iteration, then exit)
d pump

# Run daemon in watch mode (continuous monitoring)
d watch
```

### Pipeline Integration

Designed to work well with other Unix tools:

```bash
# Pipe task lists to create agent sessions
todo next | d new planner

# Use explicit stdin syntax
echo "Check system status" | d new solo -

# Combine prompt with stdin
echo "Additional context" | d new executor "Deploy the application"

# Format output for further processing
d sessions --format json | jq '.[] | select(.state == "running")'

# Combine with other CLI tools
d sessions --format csv | grep "success" | wc -l
```

## Available Agent Templates

The system comes with several pre-built agent templates:

- **solo**: General-purpose agent for standalone tasks
- **planner**: Strategic planning and task breakdown
- **executor**: Implementation and execution focused
- **evaluator**: Analysis and assessment tasks
- **retriever**: Information gathering and research

## Security

The system includes a comprehensive security allowlist for terminal commands (`storage/terminal-cmd-allowlist.yaml`). Commands are automatically categorized as:

- **Allowed**: Safe commands like `ls`, `cat`, `git status`
- **Blocked**: Dangerous commands like `rm`, `kill`, `dd`
- **Pattern-based**: Regex rules for complex command validation

Agents can execute approved commands automatically while flagging risky operations for human review.

## Authentication

The system uses GitHub OAuth device flow for authentication:

1. **Device Flow**: Initiates GitHub OAuth device flow
2. **Browser Auth**: Opens browser for GitHub authorization
3. **Token Exchange**: Exchanges device code for GitHub OAuth token
4. **Copilot Token**: Uses OAuth token to get Copilot API access
5. **Auto Caching**: Saves tokens to `.tokens.yaml` with automatic renewal

Tokens are stored securely in `.tokens.yaml` (add to `.gitignore`):

```yaml
github_token: ghp_xxxxx...
copilot_token: cop_xxxxx...
expires_at: 1234567890
api_url: https://api.githubcopilot.com
```

## Configuration

System configuration is managed via [config.yaml](config.yaml).

## Development

```bash
# Run tests
npm test

# Clean transient state
d clean

# Debug with pump mode
d pump

# Monitor continuous operation
d watch
```
