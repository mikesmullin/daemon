# 👺 Daemon CLI

A Multi-Agent Delegation (MAD) CLI 
for orchestrating multiple AI agents using the GitHub Copilot API. 
Promotes Unix-philosophy over TUI.
Built for advanced users who want to delegate complex tasks across specialized agents while maintaining simple, pipeable command-line interfaces.

We aim to be deterministic, testable, auditable, and composable.

## Features

- 🤖 **Multi-agent orchestration** - Delegate tasks across specialized AI agents that collaborate autonomously
- ⚡ **Quick-prompt mode** - Get instant command suggestions with `d "your task"` 
- 📄 **YAML-based agent templates** - Clean, structured agent definitions for reusable behaviors
- 🔄 **Session-based workflows** - Persistent, stateful agent interactions with BehaviorTree state management
- 🔒 **Security allowlist** - Safe terminal command execution with comprehensive approval controls
- 🛠️ **Rich tool ecosystem** - File operations, shell execution, web fetching, agent coordination
- 🔌 **MCP integration** - Extend capabilities with Model Context Protocol servers (Chrome DevTools, etc.)
- 🔑 **GitHub Copilot integration** - Native GitHub OAuth with automatic token management
- ⛽ **Pump mode** - Step-through debugging for development and external orchestration
- 👀 **Watch mode** - Continuous background operation for daily workflows  
- �️ **Parallel execution** - Watch parallel processes, optionally with automatic tmux pane creation
- �🔗 **Pipeline-friendly** - Designed for Unix-style stdin/stdout composition
- 📊 **Multiple output formats** - JSON, YAML, CSV, and table output for scripting

## Architecture

The system uses a **file-based multi-agent architecture** with YAML configuration:

Code built with Node.js ES6 module syntax, with dependencies:
- **OpenAI SDK** for Copilot API compatibility

### Agent Templates (`agents/templates/*.yaml`)
Reusable agent blueprints that define specialized behaviors:
- Agent capabilities and system prompts
- Available tools and model preferences  
- Behavioral parameters and constraints
- Versioned and shareable across projects
- Future: Templates for complex multi-agent collaboration patterns

### Agent Sessions (`agents/sessions/`)
Active conversation instances created from templates:
- Persistent conversation history and context
- BehaviorTree state tracking: `success`, `running`, `pending`, `fail`
- Multiple sessions can spawn from the same template
- Isolated workspaces for each session
- Sessions can spawn sub-agent sessions for task delegation

### Operation Modes

**Quick-prompt mode** (`d "task"`):
- Instant command suggestions for immediate tasks
- Future: Intelligent agent team orchestration for complex requests
- Example: `d "read slack and reply"` → spawns retriever + executor + evaluator agents

**Pump mode** (`d pump`):  
- Execute one iteration and exit
- Perfect for development, testing, and external orchestration
- Enables step-through debugging and state inspection

**Watch mode** (`d watch`):
- Continuous background monitoring with configurable intervals
- Processes pending sessions autonomously 
- Session-specific watching: `d watch <session_id>` for targeted monitoring
- Auto-tmux integration: New sessions automatically create dedicated watch panes
- Ideal for daily operation and long-running workflows

**Parallel execution**:
- Process-based parallelism with one watch process per session
- Tmux integration for visual monitoring of multiple sessions
- Serial execution within sessions prevents conflicts
- Auto-scaling: New sessions spawn their own monitoring processes

**Session management**:
- Direct session manipulation (new, push, fork, eval)
- Pipeline-friendly for automation and scripting

## Installation

```bash
npm install
npm link  # Creates global 'd' command alias
```

## Usage

The tool offers three primary interaction patterns:

### 1. Quick-Prompt Mode (Most Common)
Get instant command suggestions or trigger agent workflows:

```bash
# Simple command help
d "check if redis is running"
d "find large files in current directory"
d "deploy app to staging"

# Future: Complex multi-agent workflows
d "read slack and reply"           # → spawns retriever + executor + evaluator
d "code review pull request #123"  # → spawns analyzer + reviewer + commenter
```

### 2. Session Management
Direct control over agent conversations:

```bash
# Create a new agent session
d new solo "Check if Redis is running with podman"
d new executor "Deploy the application to staging"

# Create session from stdin (pipe-friendly)
echo "System status check" | d new solo -
todo next | d new planner

# Quick agent execution (creates session, runs until completion, shows result)
d agent @solo "Check if Redis is running with podman"
d agent @executor "Deploy the application to staging"
d agent --last @solo "What is the current time?"  # Only show final response

# Interact with existing sessions
d sessions                    # List all sessions
d push 0 "Now check PostgreSQL as well"  # Add message to session
d fork 0 "Use docker instead of podman"  # Fork session with new direction
d eval 0                      # Process pending work in session
```

### 3. Daemon Operations
Background orchestration and development modes:

```bash
# Development and debugging
d pump                        # Process one iteration, then exit
d clean                       # Reset all transient state

# Background operation  
d watch                       # Continuous monitoring of all pending sessions
d watch 4                     # Monitor only session 4 (parallel execution)

# Tmux integration
tmux -f .tmux.conf new-session -s daemon    # Start w/ this if you want tmux auto-pane creation
# New sessions auto-create watch panes when auto_tmux_panes: true in config

# Inspect system state
d sessions --format json      # Machine-readable session status
d tool                        # List available agent tools
```

### Pipeline Integration

Designed to work seamlessly with Unix tools and automation:

```bash
# Pipe tasks to agents
todo next | d new planner
kubectl get pods --field-selector=status.phase=Failed | d new troubleshooter -

# Combine with other CLI tools
d sessions --format json | jq '.[] | select(.state == "pending")'
d sessions --format csv | grep "success" | wc -l

# External orchestration (via pump mode)
while true; do
  d pump
  sleep 30
done
```

## Available Agent Templates

The system includes specialized agent templates for different workflows:

- **solo**: General-purpose agent for standalone tasks and quick automation
- **planner**: Strategic planning, task breakdown, and workflow orchestration  
- **executor**: Implementation-focused agent for running commands and deployments
- **evaluator**: Analysis, testing, and quality assessment tasks
- **retriever**: Information gathering, research, and data collection

*Future: Templates will support complex multi-agent collaboration patterns where agents automatically spawn and coordinate sub-agents for sophisticated workflows.*

## Security

The system includes a comprehensive security allowlist for terminal commands (`storage/terminal-cmd-allowlist.yaml`) - a central feature for safe agent operation:

**Command Classification:**
- **Allowed**: Safe commands like `ls`, `cat`, `git status`, `kubectl get`
- **Blocked**: Dangerous commands like `rm -rf`, `kill`, `dd`, `mkfs`  
- **Pattern-based**: Regex rules for complex command validation and parameter restrictions

**Security Features:**
- Agents execute approved commands automatically
- Risky operations flagged for human review
- Allowlist is extensible and version-controlled
- Commands logged for audit trails

*The allowlist system is essential for autonomous agent operation while maintaining system security.*

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

System configuration via `config.yaml`:

- **Daemon settings**: Watch mode polling intervals, session timeouts
- **GitHub OAuth**: Device flow endpoints and client configuration  
- **Copilot API**: Endpoint URLs and authentication parameters
- **Security**: Terminal allowlist policies and tool restrictions

See [config.yaml](config.yaml) for current settings.

## Logging

Filter using the `LOG` environment variable:

```bash
LOG=*                    # (default) Enable all logging (debug, info, warn, error)
LOG=warn,error           # Only warnings and errors
LOG=-debug               # Everything except debug messages
```

## Development

```bash
# Install and link globally
npm install
npm link                      # Creates global 'd' command

# Development workflow
d clean                       # Reset all transient state  
d pump                        # Debug single iteration
d watch                       # Test continuous operation

# Testing
npm test                      # Run test suite
./tests/integration/agent-demo.sh  # Integration tests
```

## Roadmap

**Near-term:**
- Enhanced multi-agent collaboration workflows
- Advanced session state management and recovery
- Template sharing and versioning system

**Long-term:**
- Multi-provider LLM support (while maintaining Copilot focus)
- File-based workflow designer for complex agent orchestrations  
- Plugin ecosystem for domain-specific agent behaviors
- Enterprise features: audit logs, role-based access, team collaboration

**Vision:**
Transform from command-line helper to full autonomous agent orchestration platform - where simple prompts like `d "deploy feature X"` automatically coordinate teams of specialized agents to handle complex, multi-step workflows.
