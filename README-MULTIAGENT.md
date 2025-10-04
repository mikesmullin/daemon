# Multi-Agent Orchestrator

**File-based autonomous agent system powered by GitHub Copilot API**

## Overview

This is a multi-agent orchestration system where **LLM agents act as autonomous workers**, coordinating through **files on disk** instead of APIs or live UIs. The filesystem itself becomes the "database" and "message bus" - making every interaction transparent, auditable, and reversible.

### Philosophy

- 🗄️ **All state lives on disk** - Human-readable text files
- 📝 **The filesystem is the UI** - Edit files to control agents
- 🔍 **Everything is auditable** - Full Git history of decisions
- ↩️ **Everything is reversible** - Version control for agent actions
- 🐛 **Everything is debuggable** - Read agent thought processes
- 🔒 **Security by design** - Approval workflow for risky actions

### How It Works

```
Human edits files → Daemon watches → Copilot processes → Tools execute → Results logged
         ↑                                                                      ↓
         └──────────────────── Approval workflow ←──────────────────────────────┘
```

## Architecture

See [ARCHITECTURE.md](./ARCHITECTURE.md) for detailed design.

### Key Components

1. **Agent Chat Logs** (`agents/*.agent.md`)
   - One file per agent containing full conversation history
   - System prompt + messages + tool calls + results
   - Append-only, auditable

2. **Task Files** (`tasks/*.task.md`)
   - Hierarchical task tracking using `todo` CLI format
   - Agents assign work through task creation
   - Dependency resolution, priority, stakeholder tracking

3. **Approval System** (`approvals/pending/*.md`)
   - High-risk actions require human review
   - Edit approval file to approve/reject
   - Automatic archiving to `approved/` or `rejected/`

4. **CLI Daemon** (`daemon.js`)
   - Watches files for changes
   - Routes messages between agents
   - Calls Copilot API for responses
   - Executes tools and logs results

## Agent Types

### Planner Agent (`planner-001`)
Decomposes high-level goals into structured sub-tasks. Creates task files and assigns work to other agents.

**Tools:** query_tasks, create_task, update_task, send_message

### Retriever Agent (`retriever-001`)
Fetches contextual information from knowledge base (`memory/` directory). Provides facts and configuration details.

**Tools:** read_file, list_directory, send_message

### Executor Agent (`executor-001`)
Performs system-level operations: runs commands, creates files, executes actions.

**Tools:** execute_command, read_file, write_file, list_directory

### Evaluator Agent (`evaluator-001`)
Validates outputs, checks quality, ensures responses meet standards before external communication.

**Tools:** read_file, query_tasks, update_task, send_message

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

This installs:
- `chokidar` - File system watching
- `openai` - Copilot API client
- `js-yaml` - Config file parsing

### 2. Authenticate with GitHub

The daemon uses your GitHub account to access Copilot API:

```bash
# First time: Will open browser for GitHub OAuth
node daemon.js
```

Tokens are saved to `.tokens.yaml` for future use.

### 3. Run Demo Scenario

```bash
# Initialize demo: Simulates Slack message
node demo-scenario.js

# Start daemon: Processes agent messages
node daemon.js
```

### 4. Observe Multi-Agent Collaboration

Watch the console output as:
1. Planner decomposes the request
2. Retriever fetches system info
3. Executor proposes commands
4. You approve/reject in `approvals/pending/`
5. Evaluator validates results
6. Planner drafts response

## Directory Structure

```
tmp7-opencode/
├── agents/                    # Agent chat logs
│   ├── planner-001.agent.md
│   ├── retriever-001.agent.md
│   ├── executor-001.agent.md
│   └── evaluator-001.agent.md
├── tasks/                     # Task tracking files
│   └── *.task.md
├── approvals/                 # Approval workflow
│   ├── pending/              # Awaiting human review
│   ├── approved/             # Approved and executed
│   └── rejected/             # Rejected by human
├── inbox/                     # External message queues
│   ├── slack-messages.jsonl
│   └── slack-outbox.jsonl
├── memory/                    # Knowledge base
│   ├── system-config.md
│   └── team-prefs.md
├── lib/                       # Core libraries
│   ├── agent-parser.js       # Parse *.agent.md files
│   ├── tools.js              # Tool definitions
│   ├── approval.js           # Approval workflow
│   ├── session.js            # GitHub authentication
│   └── terminal-allowlist.js # Command security
├── daemon.js                  # Main orchestrator
├── demo-scenario.js           # Demo initialization
└── ARCHITECTURE.md            # Detailed design doc
```

## Agent File Format

Each agent has a `.agent.md` file:

```markdown
# Agent: planner-001
type: planner
created: 2025-10-04T10:00:00Z

## System Prompt
You are a task planning agent...

## Conversation

### 2025-10-04 10:05:23 | user
New message from Slack: "Check Redis status"

### 2025-10-04 10:05:45 | assistant
I'll decompose this into tasks...

### 2025-10-04 10:05:46 | tool_call
name: create_task
arguments:
  file: tasks/redis-check.task.md
  content: "- [ ] A @retriever-001 `Find container runtime`"

### 2025-10-04 10:05:47 | tool_result
success: true
task_ids: [task-abc123]
```

## Tool System

Agents can call tools to interact with the system:

### File Operations
- `read_file` - Read file contents
- `write_file` - Create/modify files (requires approval)
- `list_directory` - List files and folders
- `create_directory` - Create directories

### Task Management
- `query_tasks` - SQL-like query over tasks
- `create_task` - Add new task to file
- `update_task` - Modify task status/fields

### Terminal
- `execute_command` - Run shell commands (approval may be required)
  - Checked against security allowlist
  - Dangerous patterns require human approval

### Agent Communication
- `send_message` - Append message to another agent's chat log

### External Integration
- `slack_send` - Post to Slack (requires approval)
- `slack_read` - Read from inbox

## Approval Workflow

When an agent proposes a high-risk action, the daemon creates an approval file:

**File:** `approvals/pending/exec-20251004-001.approval.md`

```markdown
# Approval Request: exec-20251004-001
agent: executor-001
created: 2025-10-04T10:10:00Z

## Proposed Action

**Type:** terminal_command

**Command:**
```bash
docker ps --filter "name=redis"
```

**Risk Level:** LOW
- Read-only operation

## Review

**Decision:** <!-- APPROVED | REJECTED -->
**Notes:**
**Reviewed by:**
**Reviewed at:**
```

**To approve:** Edit the file and change to:
```markdown
**Decision:** APPROVED
**Reviewed by:** Your Name
**Reviewed at:** 2025-10-04T10:12:00Z
```

The daemon watches for changes, executes approved actions, and archives the file.

## Security

### Command Allowlist

Commands are checked against `storage/terminal-cmd-allowlist.yaml`:

```yaml
# Safe commands (auto-approved)
'node --version': true
'docker ps*': true
'ls *': true

# Dangerous commands (always require approval)
'rm -rf*': false
'sudo*': false
```

### Risk Levels

- **LOW**: Read-only operations, auto-approved
- **MEDIUM**: File writes, network operations - may require approval
- **HIGH**: Destructive operations, always require approval

### Workspace Isolation

Each agent can have an isolated Git workspace for safe experimentation without affecting the main system.

## Demo Scenario

The included demo simulates:

**Scenario:** Slack message → Multi-agent Redis check → Approved response

1. Message arrives: "Can you check if Redis is running?"
2. Planner decomposes into sub-tasks
3. Retriever finds system uses Docker
4. Executor proposes `docker ps` command
5. Human approves command execution
6. Evaluator validates output format
7. Planner drafts Slack response (using team style guide)
8. Human approves message
9. Message sent to Slack

### Run the Demo

```bash
# Initialize scenario
node demo-scenario.js

# In another terminal, start daemon
node daemon.js

# Watch console output and approve actions in approvals/pending/
```

## Extending the System

### Add a New Agent

Create `agents/new-agent.agent.md`:

```markdown
# Agent: analyzer-001
type: analyzer
created: 2025-10-04T12:00:00Z

## System Prompt
You analyze code quality and suggest improvements...

## Conversation
```

The daemon automatically detects new agents.

### Add a New Tool

Edit `lib/tools.js`:

```javascript
export const tools = {
  // ... existing tools
  
  my_custom_tool: {
    definition: {
      type: 'function',
      function: {
        name: 'my_custom_tool',
        description: 'Does something useful',
        parameters: { /* ... */ }
      }
    },
    requiresApproval: false,
    execute: async (args) => {
      // Implementation
      return { success: true, result: '...' };
    }
  }
};
```

### Integrate External System

Add message parsing in daemon or create dedicated monitor agent:

```javascript
// Monitor email inbox
const emailWatcher = chokidar.watch('inbox/email.jsonl');
emailWatcher.on('change', async () => {
  const messages = parseEmailInbox();
  for (const msg of messages) {
    await routeToAgent('planner-001', msg);
  }
});
```

## Task Format

Tasks use the `todo` CLI format (see `tmp/tmp6-todo/`):

```markdown
## TODO

- [x] A @planner-001 #redis "Plan Redis check workflow"
  id: task-001
  created: 2025-10-04T10:00:00Z
  completed: 2025-10-04T10:05:00Z
  
  - [ ] B @retriever-001 "Detect container runtime"
    id: task-002
    parent: task-001
    
  - [ ] C @executor-001 "Check Redis status"
    id: task-003
    depends_on: task-002
    approval_required: true
```

Query tasks:
```bash
todo query "SELECT * FROM tasks.md WHERE completed = false"
```

## Examples

See `examples/` for simple demonstrations:

- `1-ask.js` - Basic Copilot API usage
- `2-secure-agent.js` - Tool calling with security

## Troubleshooting

### Daemon not processing agents

Check:
1. Agent file ends with `.agent.md`
2. Last message has `role: user`
3. File is in `agents/` directory
4. No syntax errors in file

### Tools not executing

Check:
1. Approval file in `approvals/pending/`
2. Decision field properly set: `**Decision:** APPROVED`
3. File permissions allow writing
4. Tool name matches definition

### Authentication issues

```bash
# Clear tokens and re-authenticate
rm .tokens.yaml
node daemon.js
```

## Related Projects

- **tmp/opencode** - Go-based implementation with similar architecture
- **tmp/sst-opencode** - SST/TypeScript variant
- **tmp/tmp6-todo** - Task management CLI used for task files

## License

MIT

## Contributing

This is an experimental multi-agent system. Contributions welcome!

Focus areas:
- Additional agent types
- New tool integrations
- Security improvements
- Performance optimization
- Documentation and examples
