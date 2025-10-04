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
                       │ edits *.task.md, *.agent.md, *.approval.md
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
│                     Filesystem (The "Database")                  │
│                                                                  │
│  agents/                                                        │
│    planner-001.agent.md      ← Agent's full chat context       │
│    retriever-001.agent.md    ← System prompt + history         │
│    executor-001.agent.md                                        │
│    evaluator-001.agent.md                                       │
│                                                                  │
│  tasks/                                                         │
│    project-alpha.task.md     ← Task tracking (todo format)     │
│    research.task.md                                             │
│                                                                  │
│  workspaces/                                                    │
│    planner-001/              ← Isolated Git workspace           │
│    executor-001/             ← Per-agent working directory      │
│                                                                  │
│  approvals/                                                     │
│    pending/                                                     │
│      exec-20251004-001.approval.md  ← Awaiting human review    │
│    approved/                                                    │
│    rejected/                                                    │
│                                                                  │
│  inbox/                                                         │
│    slack-messages.jsonl      ← External input streams           │
│    email-inbox.jsonl                                            │
│                                                                  │
│  memory/                                                        │
│    system-config.md          ← Knowledge base                   │
│    team-prefs.md                                                │
└─────────────────────────────────────────────────────────────────┘
```

## Core Components

### 1. Agent Chat Logs (*.agent.md)

Each agent has **one append-only Markdown file** containing:
- System prompt defining agent's role and capabilities
- Full conversation history (all messages)
- Tool calls and execution results
- References to other agents and tasks

**Format:**
```markdown
# Agent: planner-001
type: planner
created: 2025-10-04T10:00:00Z

## System Prompt
You are a task planning agent. Your role is to decompose high-level 
objectives into structured, actionable sub-tasks...

## Conversation

### 2025-10-04 10:05:23 | user
A message arrived from Slack: "Can you check if Redis is running locally?"

### 2025-10-04 10:05:45 | assistant
I'll break this down into steps:
1. Determine container runtime (Docker/Podman)
2. Query container status
3. Format response for Slack

Creating sub-tasks now...

### 2025-10-04 10:05:46 | tool_call
name: create_task
arguments:
  file: tasks/redis-check.task.md
  content: |
    - [ ] A @retriever-001 "Check system for Docker/Podman"
    - [ ] B @executor-001 "Run container status command" 
      depends_on: task-abc123

### 2025-10-04 10:05:47 | tool_result
success: true
task_ids: [task-abc123, task-def456]
```

### 2. Task Files (*.task.md)

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

### 3. Approval Workflow (*.approval.md)

When an agent proposes a **high-risk action** (terminal command, file modification), 
it creates an approval request:

```markdown
# Approval Request: exec-20251004-001
agent: executor-001
task: task-003
created: 2025-10-04T10:10:00Z
status: pending

## Proposed Action

**Type:** terminal_command

**Command:**
`docker ps --filter "name=redis" --format "{{.Status}}"`

**Context:**
Checking if Redis container is running as requested by user in Slack.

**Risk Level:** LOW
- Read-only operation
- No side effects
- Command matches allowlist pattern

## Review

<!-- Human: Edit this section to approve or reject -->

**Decision:** <!-- APPROVED | REJECTED -->

**Notes:**
<!-- Add any notes here -->

**Reviewed by:**
**Reviewed at:**
```

The daemon watches the `approvals/pending/` directory. When a file is modified 
with `Decision: APPROVED`, it moves to `approvals/approved/` and executes the command.

### 4. CLI Daemon

**Responsibilities:**
1. **File watching** - Monitor all agent, task, and approval files
2. **Message routing** - When agent A references agent B, append to B's chat
3. **Copilot API gateway** - Process agent messages through Copilot API
4. **Tool execution** - Execute approved commands, file operations
5. **Workspace management** - Maintain isolated Git workspaces per agent
6. **Event logging** - Maintain system-wide event log

**Key behaviors:**
- Watches `agents/*.agent.md` for new messages
- When new `### user` message appears → call Copilot API → append `### assistant` response
- When `### tool_call` appears → execute or create approval request
- When approval approved → execute → append `### tool_result`
- When task created/updated → notify assigned agent

### 5. Tool System

Tools available to agents (translated from opencode Go implementation):

#### File Operations
- `read_file` - Read file contents
- `write_file` - Write/overwrite file (requires approval)
- `list_directory` - List files and folders
- `search_files` - Semantic search across files
- `create_directory` - Create directory structure

#### Task Management
- `query_tasks` - SQL-like query over task files (uses todo CLI)
- `update_task` - Modify task status/fields
- `create_task` - Add new task to file

#### Terminal
- `execute_command` - Run shell command (approval required, allowlist-checked)

#### Agent Communication
- `send_message` - Append message to another agent's chat log

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

## Workflow Example: Slack → Redis Check → Response

1. **External event:** Message arrives in Slack
   - Daemon appends to `inbox/slack-messages.jsonl`
   - Daemon appends to `agents/planner-001.agent.md`:
     ```
     ### 2025-10-04 10:00:00 | user
     New Slack message from @boss: "Can you check if Redis is running?"
     ```

2. **Planner processes:**
   - Daemon calls Copilot API with planner's full context
   - Planner responds with task breakdown
   - Daemon appends response to planner's chat
   - Planner uses `create_task` tool → creates `tasks/redis-check.task.md`

3. **Retriever investigates:**
   - Daemon sees task assigned to retriever-001
   - Appends to `agents/retriever-001.agent.md`:
     ```
     ### 2025-10-04 10:05:00 | user
     Task assigned: Determine if Docker or Podman is being used.
     ```
   - Retriever reads `memory/system-config.md`
   - Responds with: "System uses Docker Desktop on Windows WSL2"

4. **Executor prepares command:**
   - Task assigned to executor-001
   - Executor proposes: `docker ps --filter "name=redis"`
   - Creates `approvals/pending/exec-20251004-001.approval.md`

5. **Human approval:**
   - Operator edits approval file: `Decision: APPROVED`
   - Daemon detects change, moves to `approved/`

6. **Executor runs command:**
   - Daemon executes command in executor's workspace
   - Appends result to executor's chat log
   - Updates task status: `completed: true`

7. **Evaluator validates:**
   - Reads execution result
   - Confirms output format is valid
   - Marks validation task complete

8. **Planner drafts response:**
   - Receives completion notification
   - Drafts Slack reply: "Redis container is running (Up 2 hours)"
   - Creates approval request for slack_send

9. **Human approves outbound message:**
   - Reviews response quality
   - Approves: `Decision: APPROVED`

10. **Message sent:**
    - Daemon posts to Slack
    - Logs to `inbox/slack-messages.jsonl`
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
Agents can be added/removed by creating/deleting `.agent.md` files.

### 8. Isolation
Each agent has isolated workspace (Git repo) for safe experimentation.

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

## Implementation Phases

### Phase 1: Core Infrastructure
- [x] Copilot API integration (already have in examples/)
- [ ] Agent file format and parser
- [ ] File watcher daemon
- [ ] Basic tool system (read_file, execute_command)

### Phase 2: Task Integration
- [ ] Integrate todo CLI for task management
- [ ] Task-to-agent routing
- [ ] Task dependency resolution

### Phase 3: Approval Workflow
- [ ] Approval file format and watcher
- [ ] Risk assessment system
- [ ] Command allowlist integration

### Phase 4: Multi-Agent
- [ ] Agent-to-agent messaging
- [ ] Planner agent implementation
- [ ] Retriever agent implementation
- [ ] Executor agent implementation
- [ ] Evaluator agent implementation

### Phase 5: External Integration
- [ ] Slack integration (read from JSONL)
- [ ] Slack posting (with approval)
- [ ] Email monitoring
- [ ] Generic webhook receiver

## Technology Stack

- **Runtime:** Node.js (already using for Copilot API)
- **File watching:** chokidar
- **Task management:** tmp6-todo CLI (already built)
- **API client:** OpenAI SDK (already integrated)
- **Security:** terminal-allowlist.js (already built)
- **File format:** Markdown (human-readable)
- **Version control:** Git (per-agent workspaces)

## Next Steps

1. Implement agent file parser
2. Build daemon file watcher
3. Create tool execution framework
4. Build first demo: single planner agent
5. Extend to multi-agent with retriever
6. Add approval workflow
7. Integrate Slack monitoring
8. Run full end-to-end scenario
