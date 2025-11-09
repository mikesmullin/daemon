# 👺 Daemon CLI

A Multi-Agent Delegation (MAD) CLI 
for orchestrating multiple AI agents with multi-provider AI support.
Promotes Unix-philosophy over TUI.
Built for advanced users who want to delegate complex tasks across specialized agents while maintaining simple, pipeable command-line interfaces.

We aim to be deterministic, testable, auditable, and composable.

## Features

- 🤖 **Multi-agent orchestration** - Delegate tasks across specialized AI agents that collaborate autonomously
- 🌐 **Multi-provider AI support** - Access models from Copilot, xAI, Gemini, Ollama, and more
- ⚡ **Quick-prompt mode** - Get instant command suggestions with `d "your task"` 
- 📄 **YAML-based agent templates** - Clean, structured agent definitions for reusable behaviors
- 🔄 **Session-based workflows** - Persistent, stateful agent interactions with BehaviorTree state management
- 🔒 **Security allowlist** - Safe terminal command execution with comprehensive approval controls
- 🛠️ **Rich tool ecosystem** - File operations, shell execution, web fetching, agent coordination
- 🔌 **MCP integration** - Extend capabilities with Model Context Protocol servers (Chrome DevTools, etc.)
- 🔑 **Flexible authentication** - GitHub OAuth for Copilot, API keys for other providers
- 👀 **Watch mode** - Continuous background operation for daily workflows  
- �🔗 **Pipeline-friendly** - Designed for Unix-style stdin/stdout composition
- 📊 **Multiple output formats** - JSON, YAML, CSV, and table output for scripting
- 📈 **Usage metrics** - Track tokens/sec, time-to-first-token, and quota usage when available

## AI Provider Support

Daemon supports multiple AI providers, giving you flexibility to choose the best model for each task:

### Supported Providers

| Provider | Models | Configuration | Status |
|----------|--------|---------------|--------|
| **GitHub Copilot** | claude-sonnet-4, gpt-4o, o1-preview, o1-mini | GitHub OAuth (automatic) | ✅ Fully supported |
| **xAI** | grok-code-fast-1, grok-beta | `XAI_API_KEY` | ✅ Fully supported |
| **Google Gemini** | gemini-2.0-flash-exp, gemini-1.5-pro | `GOOGLE_AI_API_KEY` | ✅ Fully supported |
| **Ollama** | qwen3:8b, llama3.3, mistral, codellama, etc. | `OLLAMA_BASE_URL` (default: localhost:11434) | ✅ Fully supported |
| **Anthropic** | claude-sonnet-4.5, claude-opus-4 | `ANTHROPIC_API_KEY` | 🚧 Placeholder (use Copilot) |
| **OpenAI** | gpt-5, gpt-4.5, o1 | `OPENAI_API_KEY` | 🚧 Placeholder (use Copilot) |
| **z.ai** | GLM-4, GLM-3 | `ZAI_API_KEY` | 🚧 Placeholder |

### Model Naming

Models can be specified in two ways:

1. **Auto-detection**: `model: grok-code-fast-1`
2. **Explicit provider prefix** (recommended): `model: xai:grok-code-fast-1`

Example in `agents/templates/solo.yaml`:
```yaml
metadata:
  name: solo
  model: grok-code-fast-1  # Auto-detects xAI provider
  # OR
  model: claude-sonnet-4   # Auto-detects Copilot provider
  # OR  
  model: gemini-2.0-flash-exp  # Auto-detects Gemini provider
  # OR
  model: qwen3:8b          # Auto-detects Ollama provider
```

### Configuration

1. Copy `.env.example` to `.env`
2. Add your API keys for the providers you want to use
3. List available models: `d models`

```bash
# Example .env configuration
XAI_API_KEY=xai-your-api-key-here
GOOGLE_AI_API_KEY=your-google-api-key-here
OLLAMA_BASE_URL=http://localhost:11434  # If using Ollama
```

See [.env.example](.env.example) for complete configuration options.

#### Ollama

If you're like me running Daemon in WSL2 Ubuntu but hostin Ollama from Windows 11,
you need to expose the service like so.

On Windows (cmd.exe):
```
set OLLAMA_HOST="0.0.0.0"
ollama serve
```

In WSL2 Ubuntu:
```
export OLLAMA_HOST=http://172.24.0.1:11434
```

## Architecture

The system uses a **file-based multi-agent architecture** with YAML configuration:

Code built with Bun runtime and ES6 module syntax, with dependencies:
- **OpenAI SDK** for Copilot and xAI API compatibility
- **Google Generative AI** for Gemini models
- **Ollama SDK** for local model inference
- Provider-agnostic abstraction layer for easy extensibility

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

**Quick-prompt mode** (`d "fuzzy description of a command line invocation"`):
- Instant command suggestions

**Watch mode** (`d watch`):
- Continuous background monitoring with configurable intervals
- Processes pending sessions autonomously 
- Session-specific watching: `d watch <session_id>` for targeted monitoring
- Ideal for daily operation and long-running workflows

**Parallel execution**:
- Process-based parallelism with one watch process per session
- Serial execution within sessions prevents conflicts
- Auto-scaling: New sessions spawn their own monitoring processes

**Session management**:
- Direct session manipulation via tools and agent commands
- Pipeline-friendly for automation and scripting

## Installation

```bash
bun install
bun link  # Creates global 'd' command alias
```

## Usage

The tool offers three primary interaction patterns:

### 1. Quick-Prompt Mode (Most Common)
Get instant command suggestions or trigger agent workflows:

```bash
# Simple command help
d "use podman to check if redis is running"
d "use podman to start redis"
d "use podman to stop the running redis container"
```

### 2. Session Management
Direct control over agent conversations:

```bash
# Quick agent execution (creates session, runs until completion, shows result)
d agent @solo "Check if Redis is running with podman"
d agent @executor "Deploy the application to staging"
d agent --last @solo "What is the current time?"  # Only show final response

# Or use agent tools directly for more control
d tool create_agent '{"agent":"solo","prompt":"Check if Redis is running with podman"}'
d tool create_agent '{"agent":"executor","prompt":"Deploy the application to staging"}'

# Interact with existing sessions using tools
d sessions                    # List all sessions
d tool running_agents '{}'    # List active subagent sessions
d tool command_agent '{"session_id":"0","prompt":"Now check PostgreSQL as well"}'
d tool delete_agent '{"session_id":"0"}'
```

### 3. Daemon Operations
Background orchestration and development modes:

```bash
# Development and debugging
d clean                       # Reset all transient state

# Background operation  
d watch                       # Continuous monitoring of all pending sessions
d watch 4                     # Monitor only session 4 (parallel execution)

# Inspect system state
d sessions --format json      # Machine-readable session status
d tool                        # List available agent tools
```

### Pipeline Integration

Designed to work seamlessly with Unix tools and automation:

```bash
# Pipe tasks to agents using tool commands
echo "analyze logs" | xargs -I {} d tool create_agent "{\"agent\":\"planner\",\"prompt\":\"{}\"}"

# Combine with other CLI tools
d sessions --format json | jq '.[] | select(.state == "pending")'
d sessions --format csv | grep "success" | wc -l
```

## Orchestrator Agent Pattern

The orchestrator pattern enables voice-driven, parallel multi-agent workflows. An orchestrator agent manages subagents, dispatching tasks and monitoring their progress while you interact via voice prompts.

### Setup

**Terminal 1 (Secondary - Start this first):**
```bash
LOG=-debug d watch --labels subagent --no-human
```

This starts the background worker that processes all subagent sessions in parallel with automatic rejection (with advice to use allowlisted commands) for non-allowlisted commands.

**Terminal 2 (Primary - Your interaction point):**
```bash
LOG=-debug d agent -i @ada
```

This creates an orchestrator agent session that runs in a REPL-like loop.

### How It Works

1. **Orchestrator Agent** (Terminal 2):
   - Receives voice prompts (works great with the `whisper` voice keyboard repo)
   - Analyzes tasks and breaks them into subtasks
   - Dispatches specialized subagents using the `create_agent` tool
   - Monitors subagent progress with `running_agents` and `check_agent_response`
   - Helps stuck subagents with `command_agent` when needed
   - Uses the `sleep` tool to pause between status checks

2. **Subagent Worker** (Terminal 1):
   - Runs `d watch` in a continuous loop
   - Filters for `--labels subagent` to only process delegated work
   - Uses `--no-human` to auto-approve allowlisted commands (unattended mode)
   - Executes subagent tasks in parallel as they're created

### Voice Integration

When using a voice keyboard (like the `whisper` repo):
- Speak your commands naturally to the orchestrator
- The orchestrator dictates responses back
- Creates a seamless voice-driven workflow
- Multiple subagents run in parallel while you continue speaking with the orchestrator

### Benefits

- **Parallel Execution**: Subagents work simultaneously in the background
- **Voice-Driven**: Natural language interaction via dictation
- **Autonomous Coordination**: Orchestrator manages task distribution and progress
- **Failure Recovery**: Orchestrator can detect and help stuck subagents
- **Unattended Operation**: `--no-human` mode allows fully autonomous execution

## Available Agent Templates

The system includes specialized agent templates for different workflows:

- **ada**: Voice-enabled human assistant and multi-agent orchestrator with full toolset including subagent management (uses xAI grok-code-fast-1 or Copilot claude-sonnet-4.5)
- **solo**: Capable full-size LLM for complex reasoning and problem-solving with comprehensive file operations and shell execution (uses Copilot claude-sonnet-4, xAI grok, or Ollama qwen3:8b)
- **mini**: Tiny local LLM for quick GPU execution and lightweight tasks with minimal toolset (uses Ollama deepseek-r1:8b, qwen3:8b, or phi4-mini)

**Agent Template Capabilities:**

| Template | Model | Tools | Use Case |
|----------|-------|-------|----------|
| `ada` | xAI grok-code-fast-1 | File ops, web, agent management, speak/ask, sleep | Orchestrator for multi-agent workflows with voice |
| `solo` | Copilot claude-sonnet-4 | File ops, shell, web, patches | General-purpose subagent for complex tasks |
| `mini` | Ollama deepseek-r1:8b | Limited file ops | Quick local reasoning with minimal overhead |

*Templates are YAML-based and fully customizable in `agents/templates/`. Each template defines the model, available tools, system prompts, and behavioral parameters.*

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
bun install
bun link                      # Creates global 'd' command

# Development workflow
d clean                       # Reset all transient state  
d watch                       # Test continuous operation
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
