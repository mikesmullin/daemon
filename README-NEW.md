# Copilot CLI - Multi-Agent Orchestrator

**File-based autonomous agent system powered by GitHub Copilot API**

> **🚀 NEW: Multi-Agent Architecture** - This project has evolved from a simple CLI tool into a file-based multi-agent orchestrator where LLM agents collaborate through the filesystem itself.

## What Is This?

A system where:
- 🤖 **LLM agents act as autonomous workers** (Planner, Retriever, Executor, Evaluator)
- 📁 **All communication happens through files** - No live UI, no APIs, just text files on disk
- ✅ **Human controls via file edits** - The filesystem is the UI
- 🔒 **Security through approval workflow** - High-risk actions require human approval
- 🔍 **Everything is auditable** - Full Git history of every decision
- ↩️ **Everything is reversible** - Version control for agent actions

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Run demo scenario (simulates Slack message → Redis check → response)
npm run demo

# 3. Start daemon (in another terminal)
npm start

# 4. Watch agents collaborate, approve actions in approvals/pending/
```

## How It Works

```
┌─────────────────────────────────────────────────────────────┐
│  Human (edits files to control and approve)                 │
└──────────────────────┬──────────────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────────────────┐
│  Daemon (watches files, routes messages, executes tools)    │
└──────────────────────┬──────────────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────────────────┐
│  Filesystem                                                  │
│  • agents/*.agent.md       - Agent chat logs                │
│  • tasks/*.task.md         - Task tracking                  │
│  • approvals/pending/*.md  - Actions awaiting review        │
│  • memory/*.md             - Knowledge base                 │
│  • inbox/*.jsonl           - External messages              │
└─────────────────────────────────────────────────────────────┘
```

## Demo Scenario

**Incoming Slack message** → **Multi-agent collaboration** → **Approved response**

1. 💬 **Slack**: "Can you check if Redis is running?"
2. 🧠 **Planner**: Decomposes into sub-tasks
3. 📚 **Retriever**: Finds system config (Docker)
4. ⚙️ **Executor**: Proposes `docker ps` command
5. ✋ **Human**: Approves command execution
6. ✅ **Executor**: Runs command, logs result
7. 🔍 **Evaluator**: Validates output format
8. 📝 **Planner**: Drafts Slack response
9. ✋ **Human**: Approves message
10. 📤 **System**: Sends to Slack

## The Agents

| Agent | Role | Key Tools |
|-------|------|-----------|
| **planner-001** | Breaks down high-level tasks | create_task, query_tasks, send_message |
| **retriever-001** | Fetches information from knowledge base | read_file, list_directory |
| **executor-001** | Executes system commands | execute_command, write_file |
| **evaluator-001** | Validates outputs and quality | query_tasks, update_task |

## Directory Structure

```
copilot-cli/
├── agents/                    # Agent conversation logs
│   ├── planner-001.agent.md
│   ├── retriever-001.agent.md
│   ├── executor-001.agent.md
│   └── evaluator-001.agent.md
├── tasks/                     # Task tracking (todo format)
│   └── *.task.md
├── approvals/                 # Human approval workflow
│   ├── pending/              # Awaiting your review
│   ├── approved/             # Executed actions
│   └── rejected/             # Rejected actions
├── inbox/                     # External message queues
│   ├── slack-messages.jsonl
│   └── slack-outbox.jsonl
├── memory/                    # Knowledge base
│   ├── system-config.md
│   └── team-prefs.md
├── lib/                       # Core implementation
│   ├── agent-parser.js       # Parse *.agent.md files
│   ├── tools.js              # Tool definitions
│   ├── approval.js           # Approval workflow
│   └── session.js            # GitHub authentication
├── daemon.js                  # Main orchestrator
├── demo-scenario.js           # Demo initialization
└── examples/                  # Simple usage examples
    ├── 1-ask.js              # Basic Copilot API
    └── 2-secure-agent.js     # Tool calling with security
```

## Documentation

- 📖 **[QUICKREF.md](./QUICKREF.md)** - Quick reference cheat sheet
- 🏗️ **[ARCHITECTURE.md](./ARCHITECTURE.md)** - Complete system design
- 📚 **[README-MULTIAGENT.md](./README-MULTIAGENT.md)** - Detailed user guide
- ⚙️ **[SETUP.md](./SETUP.md)** - Step-by-step setup

## Key Features

### Human-in-the-Loop Approval

When an agent wants to execute a risky action, it creates an approval file:

```markdown
# Approval Request: exec-20251004-001

## Proposed Action
**Command:**
docker ps --filter "name=redis"

**Risk Level:** LOW

## Review
**Decision:** <!-- APPROVED | REJECTED -->
```

**You edit the file** to approve or reject. The daemon watches for changes.

### File-Based Agent Communication

Each agent has a chat log file:

```markdown
# Agent: planner-001

## System Prompt
You are a task planning agent...

## Conversation

### 2025-10-04 10:00:00 | user
New Slack message: "Check Redis status"

### 2025-10-04 10:00:15 | assistant
I'll create tasks for this check...

### 2025-10-04 10:00:16 | tool_call
name: create_task
arguments:
  file: tasks/redis-check.task.md
  content: "- [ ] @executor-001 Run status check"
```

### Security Through Allowlist

Commands checked against `storage/terminal-cmd-allowlist.yaml`:

```yaml
# Safe (auto-approved)
'docker ps*': true
'ls *': true

# Dangerous (always require approval)
'rm -rf*': false
'sudo *': false
```

## Original Features (Still Available)

The simple CLI examples still work:

```bash
# Basic question-answering
node examples/1-ask.js

# Secure tool calling
node examples/2-secure-agent.js
```

## Use Cases

- 🤖 **DevOps Automation** - System monitoring with human oversight
- 📊 **Data Pipelines** - Multi-step processing workflows
- 🔍 **Research Assistant** - Information gathering and synthesis
- 💬 **Support Automation** - Customer queries with approval workflow
- 🔧 **Development Workflows** - Code review, testing, deployment

## Technology

- **Runtime**: Node.js 18+
- **API**: GitHub Copilot (OpenAI SDK)
- **File Watching**: chokidar
- **Task Format**: todo CLI (markdown-based)
- **Auth**: GitHub OAuth device flow
- **Security**: Command allowlist + approval workflow

## Installation

```bash
# Clone repository
git clone <repo>
cd copilot-cli

# Install dependencies
npm install

# Run demo
npm run demo

# Start daemon (in another terminal)
npm start
```

## Commands

```bash
npm start      # Start multi-agent daemon
npm run demo   # Initialize demo scenario
npm test       # Run simple examples
```

## Monitoring

```bash
# Watch agent conversations
tail -f agents/planner-001.agent.md

# Check pending approvals
ls -l approvals/pending/

# Query tasks (requires todo CLI)
todo query "SELECT * FROM tasks/*.task.md WHERE completed = false"
```

## Example: Adding a Message to an Agent

```bash
# Manually trigger planner
echo '### 2025-10-04 12:00:00 | user
Create a backup of the database' >> agents/planner-001.agent.md

# Daemon processes automatically
# Watch console output
```

## Why File-Based?

### Transparency
Every agent decision is written to human-readable files. No black box.

### Auditability
Full Git history. Know exactly when and why each decision was made.

### Reversibility
Agents made a mistake? `git revert`. Edit files to change state.

### Debuggability
Read agent thought processes in their chat logs. Understand reasoning.

### Controllability
High-risk actions require explicit human approval via file edits.

### Simplicity
No databases, no message queues, no microservices. Just files and Git.

## Philosophy

This system implements **Unix philosophy meets multi-agent orchestration**:

- Do one thing well (specialized agents)
- Text streams for I/O (Markdown files)
- Composability (agents + tools + tasks)
- Human-readable everything
- Version control for all state

## Contributing

We welcome:
- New agent types
- Additional tools
- External integrations
- Documentation improvements
- Security enhancements

## License

MIT

## Learn More

- [ARCHITECTURE.md](./ARCHITECTURE.md) - System design deep dive
- [SETUP.md](./SETUP.md) - Detailed setup guide
- [QUICKREF.md](./QUICKREF.md) - Quick reference
- [examples/](./examples/) - Code examples

---

**Ready to see multi-agent collaboration in action?**

```bash
npm run demo && npm start
```

🚀
