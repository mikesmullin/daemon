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
  type: approval_request
  approval_type: terminal_command
  agent: executor-001
  created: 2025-10-05T00:07:46.331Z
  risk: MEDIUM
  status: pending
  description: |
    Approval Request: terminal_command
    Risk Level: MEDIUM
    Risk Factors:
      - System-modifying command: docker
    
    Details:
      Command: docker ps
    
    To approve: Update this task:
      1. Change [_] to [x]
      2. Add: approved_by: <your-name>
      3. Add: approved_at: <timestamp>
    
    To reject: Update this task:
      1. Change [_] to [-]
      2. Add: rejected_by: <your-name>
      3. Add: rejection_reason: <reason>
```

**Approval Workflow:**
1. Agent requests dangerous operation (e.g., terminal command)
2. System creates approval task in `tasks/approvals.task.md`
3. Human reviews and edits the task file:
   - **Approve:** Change `[_]` to `[x]`, add `approved_by: yourname`
   - **Reject:** Change `[_]` to `[-]`, add `rejection_reason: ...`
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

### 3. Approval Workflow

When an agent proposes a terminal command,
it creates an approval request:

The daemon watches the `tasks\approvals.task.md` file  When a file is modified 
to indicate task approval, it executes the command.

### 4. CLI Daemon (daemon-yaml.js)

**Responsibilities:**
1. **File watching** - Monitor all session YAML files and tasks/approvals.task.md
2. **Message routing** - When agent A references agent B via send_message, append to B's session
3. **Copilot API gateway** - Process agent messages through Copilot API with proper tool_choice
4. **Tool execution** - Execute approved commands, file operations, task management
5. **Session management** - Create sessions from templates, maintain conversation state
6. **Event logging** - Maintain system-wide event log
7. **Workspace management** - Maintain isolated Git workspaces per agent


**Key behaviors:**
- Watches `sessions/*.session.yaml` for new user messages
- When new user message appears → call Copilot API with tool_choice='required'
- When API returns tool_calls → execute tools or create approval request
- After tool execution → append tool result message → call API with tool_choice='auto'
- When approval task status changes → execute or reject accordingly
- Pump mode (--pump flag): Execute one iteration then exit for testing

**Tool Choice Strategy:**
- Last message is `user` → tool_choice='required' (force agent to use tools)
- Last message is `tool` result → tool_choice='auto' (allow agent to continue or finish)

### 5. Tool System

Tools available to agents:

#### File Operations
- `read_file` - Read file contents (with line ending normalization)
- `write_file` - Write/overwrite file (requires approval)
- `list_directory` - List files and folders
- `search_files` - Semantic search across files
- `create_directory` - Create directory structure

#### Task Management
- `query_tasks` - SQL-like query over task files (via todo CLI)
- `update_task` - Modify task status/fields (via todo CLI)
- `create_task` - Add new task to task file (via todo CLI, requires approval)

#### Terminal
- `execute_command` - Run shell command (approval required, allowlist-checked)

#### Agent Communication
- `send_message` - Append message to another agent's session file

#### External Integration
- `slack_send` - Post message to Slack (requires approval)
- `slack_read` - Read from inbox/slack-messages.jsonl

## Agent Types

### Planner Agent
- **Role:** Decompose high-level goals into structured sub-tasks
- **Input:** User requests, system events
- **Output:** Task files with hierarchical breakdowns
- **Tools:** query_tasks, create_task, update_task, send_message

### Retriever Agent
- **Role:** Fetch contextual information from knowledge base
- **Input:** Information requests from other agents
- **Output:** Relevant facts, configuration details
- **Tools:** read_file, search_files, list_directory

### Executor Agent
- **Role:** Perform system-level operations
- **Input:** Approved action requests
- **Output:** Command execution results
- **Tools:** execute_command, read_file, write_file

### Evaluator Agent
- **Role:** Validate outputs and ensure quality
- **Input:** Execution results, agent responses
- **Output:** Validation reports, approval recommendations
- **Tools:** read_file, send_message, update_task

## DEMO: Workflow Example: Slack → Check → Response

1. **External event:** Message arrives in Slack
   - Daemon appends to `inbox/slack-messages.jsonl`
   - Daemon creates or updates planner session with user message

2. **Planner processes:**
   - Daemon calls Copilot API with planner's full context (tool_choice='required')
   - Planner responds with task breakdown using create_task tool
   - Daemon appends assistant response to planner's session YAML
   - Planner's tool_calls create tasks in tasks/approvals.task.md

3. **Retriever investigates:**
   - Daemon sees task assigned to retriever-001
   - Creates/updates retriever session YAML with task details
   - Retriever reads `memory/system-config.md` using read_file tool
   - Responds with a message about how we use `podman` instead of `docker`

4. **Executor prepares command:**
   - Task assigned to executor-001
   - Daemon creates/updates executor session with task
   - Executor proposes to run a command like `podman ps` via execute_command tool
   - Tool creates approval request in tasks/approvals.task.md

5. **Human approval:**
   - Operator edits tasks/approvals.task.md, changes [_] to [x], adds approved_by
   - Daemon detects file change via chokidar watcher

6. **Executor runs command:**
   - Daemon executes command in safe environment
   - Appends tool result to executor's session YAML
   - Updates task status as completed via update_task

7. **Evaluator validates:**
   - Daemon notifies evaluator by updating its session
   - Evaluator reads execution result from executor's session
   - Confirms output format is valid
   - Marks validation task complete

8. **Planner drafts response:**
   - Receives completion notification via updated session
   - Drafts Slack reply: "Redis container is running (Up 2 hours)"
   - Creates approval request for slack_send in tasks/approvals.task.md

9. **Human approves outbound message:**
   - Reviews response quality in tasks/approvals.task.md
   - Approves: changes [_] to [x], adds approved_by

10. **Message sent:**
    - Daemon posts to Slack
    - Logs to `inbox/slack-messages.jsonl`
    - Updates all related tasks as completed
    - Closes task tree

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
