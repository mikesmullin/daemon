# Multi-Agent Architecture Design

## Philosophy: Unix Meets Multi-Agent Orchestration

This system implements **file-based autonomous agent orchestration** where:
- **All state lives on disk** as human-readable text files
- **The filesystem is the UI** for human operators
- **Files are the message bus** for inter-agent communication
- **Git provides version control** for every decision and state change
- **Everything is auditable, reversible, and debuggable**

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         Human Operator                          │
│              (edits files, approves/rejects commands)           │
└──────────────────────┬──────────────────────────────────────────┘
                       │ edits *.task.md
                       ↓
┌─────────────────────────────────────────────────────────────────┐
│                       CLI Daemon (Orchestrator)                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │ File Watcher │  │ Agent Router │  │ Tool Executor│          │
│  │ (chokidar)   │  │ (messages)   │  │ (commands)   │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
│         ↕                  ↕                   ↕                 │
│  ┌──────────────────────────────────────────────────────┐      │
│  │         Copilot API Gateway (OpenAI SDK)             │      │
│  └──────────────────────────────────────────────────────┘      │
└──────────────────────┬──────────────────────────────────────────┘
                       │ reads/writes
                       ↓
┌─────────────────────────────────────────────────────────────────┐
│                     Filesystem (The "Database")                 │
│                                                                 │
│  templates/                                                     │
│    planner-001.agent.yaml    ← Agent template (blueprint)       │
│    retriever-001.agent.yaml  ← System prompt + capabilities     │
│    executor-001.agent.yaml                                      │
│    evaluator-001.agent.yaml                                     │
│                                                                 │
│  sessions/                                                      │
│    planner-001-abc123.session.yaml   ← Active chat instance     │
│    executor-001-def456.session.yaml  ← Conversation + state     │
│                                                                 │
│  tasks/                                                         │
│    approvals.task.md         ← Approval requests (todo format)  │
│                                                                 │
│  storage/                                                       │
│    planner-checkin.yaml      ← Planner check-in configuration   │
│    terminal-cmd-allowlist.yaml ← Command security allowlist     │
│                                                                 │
│  inbox/                                                         │
│    slack-messages.jsonl      ← External input streams           │
│    email-inbox.jsonl                                            │
│                                                                 │
│  memory/                                                        │
│    system-config.md          ← Knowledge base                   │
│    team-prefs.md                                                │
└─────────────────────────────────────────────────────────────────┘
```

## Core Components

### 1. Agent Templates (templates/*.agent.yaml)

Each agent template defines a reusable agent blueprint in YAML format:
- agent_id and agent_type classification
- System prompt defining role and capabilities
- Model selection (GPT-4o, Claude Sonnet, etc.)
- Tools list (available tool names)
- Metadata

**Format:**
```yaml
agent_id: planner-001
agent_type: planner
model: claude-sonnet-4.5
system_prompt: |
  You are a task planning agent. Your role is to decompose high-level 
  objectives into structured, actionable sub-tasks...
  
  You MUST use tools to accomplish your goals. Do not just describe what you would do.
  
  When using create_task, tasks will be written to tasks/approvals.task.md for human review.
tools:
  - create_task
  - query_tasks
  - send_message
  - read_file
metadata:
  description: Breaks down high-level goals into actionable tasks
  version: '0.0.1'
```

### 2. Chat Sessions (sessions/*.session.yaml)

Active conversation instances with full state:
- session_id and agent_id reference
- System prompt (copied from template)
- Complete message history with timestamps
- Session status (active, sleeping, completed, error)
- Timestamps for creation and updates

**Format:**
```yaml
session_id: planner-001-abc123
agent_id: planner-001
agent_type: planner
model: claude-sonnet-4.5
system_prompt: |
  You are a task planning agent...
created: '2025-10-04T10:00:00Z'
updated: '2025-10-04T10:05:00Z'
status: active
messages:
  - timestamp: '2025-10-04T10:05:23.000Z'
    role: user
    content: 'A message arrived from Slack: "Can you check if Redis is running?"'
  - timestamp: '2025-10-04T10:05:45.000Z'
    role: assistant
    content: |
      I will break this down into steps...
    tool_calls:
      - id: call_123
        type: function
        function:
          name: create_task
          arguments:
            file: tasks/redis-check.task.md
            content: '...'
  - timestamp: '2025-10-04T10:05:47.000Z'
    role: tool
    name: create_task
    content: |
      {"success": true, "task_ids": ["task-abc123"]}
    tool_call_id: call_123
metadata: {}
```

### 3. Approval System (tasks/approvals.task.md)

Approvals use the **todo CLI task format** from tmp6-todo project:

**Format:**
```markdown
## TODO

- [_] A @human #approval `Approve command: docker ps`
  id: approval-1759622866331-8228eefd
  approval_type: terminal_command
  agent: executor-001
  requesting_agent_session_id: executor-001-a37c0963
  created: 2025-10-05T00:07:46.331Z
  status: pending
  description: |
    Details:
      Command: docker ps
```

**Approval Workflow:**
1. Agent requests dangerous operation (e.g., terminal command)
2. System creates approval task in `tasks/approvals.task.md`
3. Human reviews and edits the task file:
   - **Approve:** Change `[_]` to `[x]`
   - **Reject:** Change `[_]` to `[-]`
4. Daemon detects file change and executes/rejects accordingly
5. Task remains in file for audit trail

### 4. Task Files (*.task.md)

Tasks use the **todo CLI format** (from tmp6-todo project):

```markdown
## TODO

- [x] A @planner-001 #redis "Plan Redis check workflow"
  id: task-001
  created: 2025-10-04T10:00:00Z
  completed: 2025-10-04T10:05:00Z
  
  - [ ] B @retriever-001 #system "Detect container runtime"
    id: task-002
    parent: task-001
    assigned: 2025-10-04T10:05:00Z
    
  - [ ] C @executor-001 #docker "Check Redis container status"
    id: task-003
    parent: task-001
    depends_on: task-002
    approval_required: true

- [ ] A @evaluator-001 "Validate Redis check result"
  id: task-004
  depends_on: task-003
```

### 5. Planner Check-in Configuration (storage/planner-checkin.yaml)

The planner check-in system uses a YAML configuration file to track timing and state:

**Format:**
```yaml
last_checkin: "2025-10-05T08:02:04.076Z"
interval_seconds: 60
planner_session: planner-001-abc123.session.yaml
checkin_count: 3
last_reason: "65s since last check-in (threshold: 60s)"
```

**Fields:**
- `last_checkin`: ISO timestamp of last check-in trigger
- `interval_seconds`: Configurable check-in frequency (default: 60)
- `planner_session`: Current active planner session filename
- `checkin_count`: Total number of check-ins triggered
- `last_reason`: Human-readable reason for last check-in

**Lifecycle:**
- File is removed by `npm run clean` for fresh testing
- First pump establishes baseline without triggering check-in
- Subsequent pumps trigger check-ins when interval has passed

### 6. Approval Workflow

When an agent proposes a terminal command,
it creates an approval request:

The daemon watches the `tasks\approvals.task.md` file  When a file is modified 
to indicate task approval, it executes the command.

### 7. CLI Daemon (daemon-yaml.js)

**Responsibilities:**
1. **File watching** - Monitor all session YAML files and tasks/approvals.task.md
2. **Message routing** - When agent A references agent B via send_message, append to B's session (and include requesting agent's session_id in message metadata)
3. **Task delegation** - When agent A references agent B via create_task, include requesting agent's session_id in task metadata
4. **Copilot API gateway** - Process agent messages through Copilot API with proper tool_choice
5. **Tool execution** - Execute approved commands, file operations, task management
6. **Session management** - Create sessions from templates, maintain conversation state
7. **Planner check-ins** - Periodically trigger planner check-ins to monitor agent progress
8. **Event logging** - Maintain system-wide event log
9. **Workspace management** - Maintain isolated Git workspaces per agent

**Planner Check-in System:**
- Monitors `storage/planner-checkin.yaml` for timing configuration
- First run establishes baseline timestamp without triggering check-in
- Subsequent runs trigger check-ins when interval (default 60s) has passed
- Appends "Check-in with running agents to ensure progress" message to planner session
- Planner uses session management tools to coordinate and guide other agents
- Configurable interval allows balancing oversight with agent autonomy

**Key behaviors:**
- Watches `sessions/*.session.yaml` for new user messages
- When new user message appears → call Copilot API
- When API returns tool_calls → execute tools or create approval request
- When approval task status changes → execute or reject accordingly
- Pump mode (--pump flag): Execute one iteration then exit for testing

### 8. Tool System

Tools available to agents:

#### File Operations
- `read_file` - Read file contents (with line ending normalization)
- `write_file` - Write/overwrite file (requires approval)
- `list_directory` - List files and folders
- `search_files` - Semantic search across files
- `create_directory` - Create directory structure

#### Task Management
- `query_tasks` - SQL-like query over task files (via todo CLI)
- `create_task` - Add new task to task file (via todo CLI, requires approval)
- `update_task` - Modify task status/fields (via todo CLI)

#### Terminal
- `execute_command` - Run shell command (approval required, allowlist-checked)

#### Agent Communication
- `send_message` - Append message to another agent's session file

#### Session Management (Planner Agent Only)
- `list_active_sessions` - List all active agent session files with metadata
- `read_session` - Read another agent's complete session file to understand progress
- `edit_session` - Replace entire session file content (requires approval, advanced intervention)

#### External Integration
- `slack_send` - Post message to Slack (requires approval)
- `slack_read` - Read from inbox/slack-messages.jsonl

## Agent Types

### Planner Agent
- **Role:** Decompose high-level goals into structured sub-tasks and coordinate other agents
- **Input:** User requests, system events, periodic check-ins
- **Output:** Task files with hierarchical breakdowns, agent coordination messages
- **Tools:** query_tasks, create_task, update_task, send_message, list_active_sessions, read_session, edit_session

**Enhanced Capabilities:**
- **Progress Monitoring:** Periodically checks in with running agents to ensure progress
- **Agent Management:** Can send guidance to stuck agents or modify their sessions
- **Session Oversight:** Lists and reads other agents' sessions to understand system state
- **Auto Check-ins:** Daemon triggers check-in messages every 60 seconds (configurable)

**Check-in Process:**
1. Daemon monitors `storage/planner-checkin.yaml` for timing
2. When interval passes, appends "Check-in with running agents to ensure progress" to planner session
3. Planner uses `list_active_sessions` and `read_session` to assess progress
4. Uses `send_message` to guide agents that need help ("Continue", "Change approach", etc.)
5. Can use `edit_session` to replace entire session files for advanced intervention

### Retriever Agent
- **Role:** Fetch contextual information from knowledge base
- **Input:** Information requests from other agents
- **Output:** Relevant facts, configuration details
- **Tools:** read_file, search_files, list_directory, send_message, update_task

### Executor Agent
- **Role:** Perform system-level operations
- **Input:** Approved action requests
- **Output:** Command execution results
- **Tools:** execute_command, read_file, write_file, send_message, update_task

### Evaluator Agent
- **Role:** Validate outputs and ensure quality
- **Input:** Execution results, agent responses
- **Output:** Validation reports, approval recommendations
- **Tools:** read_file, send_message, update_task

## DEMO

I refer to myself as Human.
I want my team of agents to help me with work.
Basically I want it to digest my work inputs, and recommend my work outputs.

Human-in-the-Loop:
  Input --> Human --> Agent <--> Human --> Output

Ultimately I will have to approve at important Junctions:

Examples of Input Junctions:
- Coworker sends me a Slack message
   - I need to verify message content is safe for AI to read (legal governance)

Examples of Output Junctions:
- Agent wants to reply to Coworker via Slack message
   - I need to verify message content is appropriate for work (quality, ethics, legal governance)

Daemon is the CLI tool that powers the Multi-Agent Workflows.
It has two modes:
- Watch: runs in a loop, reacts to changes on filesystem
  - This will be used during daily operation
- Pump: runs one iteration of the loop, reacts to latest state of files on filesystem, and then exits
  - This will be used during testing, to analyze each step independently

### Slack Workflow Example

0. **Reset:** We run `npm run clean` to setup a clean test environment; we re-run this between demos.

1. **External event:** Message arrives in Slack (this is mocked via `npm run demo`) from my boss Sarah
   - Daemon creates or updates planner session as `user` role with a copy of Sarah's message and additional metadata about how it was received

PUMP

2. **Planner processes:**
   - Daemon calls Copilot API with planner's full context, since its last message is from `user` and there is no `assistant` reply
     - Copilot as Planner Agent: responds with task breakdown, using create_task tool to assign a task to Executor agent
       - Task assigned to executor-001 is appended to `tasks\approvals.task.md` (using task.md syntax documented under `todo help` cli cmd)

PUMP

3. **Executor prepares command:**
   - Daemon sees task assigned to executor-001
   - Daemon creates/updates executor session YAML with task details
   - Executor Agent reads `memory/system-config.md` using read_file tool (as per its system prompt) and learns it must use `podman` to answer Sarah's question.
   - Executor proposes to run a command like `podman ps` via execute_command tool
   - Daemon creates approval request in `tasks/approvals.task.md` awaiting Human input

PUMP

4. **Human approval on Input:**
   - Daemon uses `todo` cli query SELECT to check for approval, but finding the task not approved, exits with nothing to do. (this may repeat over an indefinite number of pumps, until approval is found)
   - (sometime later) Human edits `tasks/approvals.task.md`, changes `[_]` to `[x]`

PUMP

5. **Daemon runs approved commands:**
   - (if in Watch mode) Daemon detects `tasks/approvals.task.md` file change via chokidar watcher
   - Daemon uses `todo` cli query SELECT to check which tasks have specific approval, and finds at least one new command task approved since last run
   - Daemon executes command in safe environment
   - Daemon Appends tool_result to Executor's session YAML

PUMP

6. **Executor concludes execution:**
   - Daemon calls Copilot API with Executor's full context, since its last message is not from `assistant`
   - Copilot as Executor Agent reads execution tool_result from Executor's session YAML
   - Executor Agent determines the answer to boss Sarah's question (ie. redis container is not found to be running via `podman`)
   - Executor Agent uses `update_task` tool (which calls `todo` cli query `UPDATE` statement on the original task id) to marks its task (the one that was assigned to it by Planner Agent) as complete

PUMP

7. **Planner delegates Slack reply composition:**
   - Daemon notices that the task Planner requested is now completed, and updates Planner session.yaml, including the relevant reply (conclusion) from Executor Agent's session.yaml
   - Copilot as Planner Agent interprets the Executor Agent's output to conclude the answer to Sarah's question (ie. podman redis container is not running)
   - Copilot as Planner Agent decides to invoke `create_task` tool (task: draft reply to Slack) and assign it to the Evaluator Agent
   - Daemon creates/updates Evaluator session YAML with task details

PUMP

8. **Evaluator designs outbound Slack message draft:**
   - Evaluator Agent reads `memory/team-prefs.md` using read_file tool (as per its system prompt) and learn's how Sarah prefers to be responded to (tone, etc.)
   - Copilot as Evaluator Agent crafts a beautiful response customized for Sarah and the Slack medium, on behalf of Human.
   - Evaluator Agent uses `update_task` tool (which calls `todo` cli query `UPDATE` statement on the original task id) to marks its task (the one that was assigned to it by Planner Agent) as complete

PUMP

9. **Planner delegates Slack delivery:**
   - Daemon notices that the task Planner requested is now completed, and updates Planner session.yaml, including the relevant reply (conclusion) from Evaluator Agent's session.yaml
   - Copilot as Planner Agent interprets the Evaluator Agent's output to be a valid Slack message
   - Copilot as Planner Agent decides to invoke `create_task` tool (task: send reply via Slack) and assign it to the Executor Agent
   - Daemon creates/updates Executor session YAML with task details

PUMP

10. **Executor prepares command:**
   - Daemon sees task assigned to executor-001
   - Daemon creates a new executor session YAML with task details
   - Executor Agent reads `memory/system-config.md` using read_file tool (as per its system prompt) and learns about `plugins/slack/actions/*.mjs` commands, picking one it can use to send a Slack reply to Sarah
   - Executor proposes to run a command like `plugins/slack/actions/reply.mjs <recipient> <message>` via execute_command tool
   - Daemon creates approval request in `tasks/approvals.task.md` awaiting Human input

PUMP

11. **Human approval on Output:**
   - Daemon uses `todo` cli query SELECT to check for approval, but finding the task not approved, exits with nothing to do. (this may repeat over an indefinite number of pumps, until approval is found)
   - (sometime later) Human edits `tasks/approvals.task.md`, changes `[_]` to `[x]`

PUMP

12. **Daemon runs approved commands:**
   - (if in Watch mode) Daemon detects `tasks/approvals.task.md` file change via chokidar watcher
   - Daemon uses `todo` cli query SELECT to check which tasks have specific approval, and finds at least one new command task approved since last run
   - Daemon executes command in safe environment
   - Daemon Appends tool_result to Executor's session YAML

PUMP

13. **Executor concludes execution:**
   - Daemon calls Copilot API with Executor's full context, since its last message is not from `assistant`
   - Copilot as Executor Agent reads execution tool_result from Executor's session YAML
   - Executor Agent determines the slack message sent successfully.
   - Executor Agent uses `update_task` tool (which calls `todo` cli query `UPDATE` statement on the original task id) to marks its task (the one that was assigned to it by Planner Agent) as complete

PUMP

14. **Planner determines all tasks completed successfully:**
   - Daemon notices that the task Planner requested is now completed, and updates Planner session.yaml, including the relevant reply (conclusion) from Executor Agent's session.yaml
   - Copilot as Planner Agent interprets the Executor Agent's output to be that the Slack message sent successfully, and there are no remaining requests to satisfy.
   - (If in Pump mode) Daemon exits with nothing else to do

## Key Design Principles

### 1. Transparency
Every action, decision, and state change is written to human-readable files.

### 2. Auditability
Full Git history of all agent decisions and executions.

### 3. Reversibility
Human can edit any file at any time to change system state or correct agents.

### 4. Debuggability
Each agent's thought process is visible in their chat log.

### 5. Controllability
High-risk actions require explicit human approval via file edits.

### 6. Statelessness
Daemon can restart anytime—all state is on disk.

### 7. Composability
Agents can be added/removed by creating/deleting template YAML files and sessions.

### 8. Isolation
Each agent operates independently with its own session state for safe experimentation.

## Security Model

### Command Allowlist
Same as `examples/2-secure-agent.js`:
- Commands checked against `storage/terminal-cmd-allowlist.yaml`
- Safe patterns (ls, ps, docker ps) auto-approved
- Dangerous patterns (rm -rf, sudo) require approval
- Unknown patterns default to requiring approval

### Approval Levels
- **Auto-approved:** Read-only operations, allowlist matches
- **Human approval required:** File writes, command execution, external messages
- **Always denied:** Explicitly blocked patterns

### Workspace Isolation
Each agent's workspace is a separate Git repository:
- Prevents agents from interfering with each other
- Allows experimental commands without affecting system
- Provides rollback capability per agent

## Technology Stack

- **Runtime:** Node.js ES6 modules
- **File watching:** chokidar (watches sessions/*.yaml and tasks/*.md)
- **Task management:** tmp6-todo CLI (task format for approvals and work tracking)
- **API client:** OpenAI SDK (GitHub Copilot API)
- **Security:** `lib/terminal-allowlist.js` (command allowlist checking)
- **File format:** YAML for agents/sessions, Markdown for tasks (human-readable)
- **YAML library:** js-yaml with custom serialization (literal block scalars, lineWidth: 120)
