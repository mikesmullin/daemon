# Creating New Agent Templates

This guide explains how to create custom agent templates for the Daemon CLI multi-agent orchestration system.

## What is Daemon?

Daemon is a Multi-Agent Delegation (MAD) CLI for orchestrating specialized AI agents with multi-provider support. Agents are defined as YAML templates that specify their capabilities, tools, and behavior.

**For complete project details**, see the main [README.md](../../README.md).

## Agent Template Schema

Agent templates are YAML files that follow this structure:

```yaml
---
apiVersion: daemon/v1
kind: Agent
metadata:
  description: Brief description of the agent's purpose
  model: provider:model-name        # AI model to use
  tools:                            # List of available tools
    - tool_name_1
    - tool_name_2
  labels:                           # Optional labels for agent classification
    - label1
    - label2
spec:
  system_prompt: |
    Instructions for the AI model that define the agent's behavior,
    personality, and capabilities. Can use EJS templates for dynamic
    content like <%= os.platform() %> or <%= process.cwd() %>.
```

### Required Fields

- `apiVersion`: Must be `daemon/v1`
- `kind`: Must be `Agent`
- `metadata.description`: Short description of the agent's purpose
- `metadata.model`: The AI model this agent will use
- `spec.system_prompt`: Instructions that define agent behavior

### Optional Fields

- `metadata.tools`: Array of tool names the agent can use (if omitted, agent has no tools)
- `metadata.labels`: Array of labels for categorization and filtering

## Available Models

Models are specified as `provider:model-name` or just `model-name` (auto-detects provider).

**To see all available models**, run:
```bash
LOG=-debug d models
```

Common examples:
- `copilot:claude-sonnet-4.5` - Anthropic Claude via GitHub Copilot (slow, 200K context window, well-reasoned, best for complex tasks)
- `xai:grok-4-fast-reasoning` - xAI Grok model (fast, 2M context window, reasoned, good for many tasks)
- `ollama:qwen3:8b` - Local Ollama model (small model, 30K context window, naive, fast but only effective for simple tasks)

**For provider configuration details**, see [README.md - AI Provider Support](../../README.md#ai-provider-support).

## Available Tools

Tools extend agent capabilities for specific tasks like file operations, web browsing, or managing subagents.

**To see all available tools**, run:
```bash
LOG=-debug d tool
```

Common tool categories:
- **File Operations**: `create_file`, `view_file`, `edit_file`, `apply_patch`, `list_directory`, `create_directory`, `grep_search`
- **Shell Execution**: `execute_shell`
- **Web Access**: `fetch_webpage`, `open_browser`
- **Agent Management**: `available_agents`, `running_agents`, `create_agent`, `command_agent`, `check_agent_response`, `delete_agent`
- **Human Interaction**: `speak_to_human`, `ask_human`, `list_voice_presets`
- **Memory**: `recall`, `memorize`, `forget` (vector database for long-term memory)

More features are availble via plugins. Check your local install to verify availability.

## Common Labels

Labels help organize agents and enable team-of-agents workflows:

### `orchestrator` (few)
- **Purpose**: Marks agents that coordinate and manage other agents
- **Behavior**: Typically has agent management tools (`create_agent`, `command_agent`, etc.)
- **Usage**: High-level agents that break down complex tasks and delegate to subagents
- **Example**: `ada` - voice-enabled orchestrator that manages a team of coding agents

### `subagent` (most common)
- **Purpose**: Marks agents designed to be spawned by other agents
- **Behavior**: These agents are listed by the `available_agents` tool
- **Usage**: Worker agents that perform specific tasks (coding, research, analysis)
- **Example**: `solo` - general-purpose coding agent

### Team Workflow Pattern

1. **Orchestrator** receives complex task from user
2. Uses `available_agents` to discover capable subagents
3. Uses `create_agent` to spawn specialized subagents for subtasks
4. Uses `running_agents` to track active subagents
5. Uses `check_agent_response` to monitor progress
6. Uses `command_agent` to guide stuck subagents
7. Uses `delete_agent` to archive completed subagents

(May have one or two other tools, and corresopnding variations in system prompt, that help them become specialized orchestrators.)

**For complete workflow details**, see [README.md - Orchestrator Agent Pattern](../../README.md#orchestrator-agent-pattern).

## Template Discovery & Resolution

Agent templates can be referenced by name or file path.

### Search Order
When you reference an agent like `@my-agent`, Daemon searches:
1. Current working directory (`./my-agent.yaml`)
2. Workspace templates directory (`agents/templates/my-agent.yaml`)

### Valid Locations
- `agents/templates/*.yaml` - Standard location for built-in templates
- `custom/agents/*.yaml` - Custom subdirectory (reference as `@custom/agents/name`)
- `./local-agent.yaml` - Current directory (reference as `@./local-agent`)

### Usage Examples
```bash
# Built-in template
d agent @solo "analyze the codebase"

# Custom subdirectory
d agent @custom/specialist "perform specialized task"

# Local template
d agent @./my-agent "run custom workflow"

# With .yaml extension (auto-stripped)
d agent @custom/agent.yaml "task description"
```

**For more CLI details**, run:
```bash
d agent --help
```

## Example Templates

### Minimal Agent (No Tools)
```yaml
---
apiVersion: daemon/v1
kind: Agent
metadata:
  description: Simple conversational agent
  model: copilot:claude-sonnet-4
spec:
  system_prompt: |
    You are a helpful assistant. Answer questions concisely.
```

### Worker Agent (Subagent)
```yaml
---
apiVersion: daemon/v1
kind: Agent
metadata:
  description: Code analysis and refactoring specialist
  model: xai:grok-4-fast-reasoning
  tools:
    - view_file
    - edit_file
    - grep_search
    - list_directory
  labels:
    - subagent
spec:
  system_prompt: |
    You are a code analysis expert. Review code for bugs, performance
    issues, and improvement opportunities. Make precise edits when needed.
```

### Orchestrator Agent
```yaml
---
apiVersion: daemon/v1
kind: Agent
metadata:
  description: Team coordinator for multi-agent workflows
  model: copilot:claude-sonnet-4
  tools:
    - available_agents
    - running_agents
    - create_agent
    - command_agent
    - check_agent_response
    - delete_agent
    - ask_human
  labels:
    - orchestrator
spec:
  system_prompt: |
    You are a project manager coordinating a team of AI agents.
    Break down complex tasks, delegate to specialists, and monitor progress.
    Keep the user informed of overall status.
```

## Best Practices

1. **Keep system prompts focused** - Define clear responsibilities and constraints
2. **Minimize tool sets** - Only include tools the agent actually needs (better performance)
3. **Use labels consistently** - `subagent` for workers, `orchestrator` for coordinators
5. **Take inspiration from existing templates** - See `agents/templates/solo.yaml` and `agents/templates/ada.yaml` for production examples
6. **Use EJS if it makes sense** - ie. for dynamic OS/environment values like `<%= os.platform() %>`, it may be helpful to mention in system prompt (ie. if shell execution tool is needed)
