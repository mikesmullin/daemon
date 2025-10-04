# Multi-Agent System - Quick Reference

## 🎯 What Is This?

A **file-based multi-agent orchestrator** where:
- LLM agents collaborate through files on disk
- Human operators control the system by editing files
- Every decision is auditable and reversible
- The filesystem is the UI

## 🚀 Quick Start

```bash
# 1. Install
npm install

# 2. Run demo
npm run demo    # Initialize scenario

# 3. Start daemon (in another terminal)
npm start       # Processes agents

# 4. Approve actions
# Edit files in approvals/pending/
# Change: Decision: <!-- APPROVED | REJECTED -->
# To:     Decision: APPROVED
```

## 📁 Key Files

| Path | Purpose |
|------|---------|
| `agents/*.agent.md` | Agent conversation logs |
| `tasks/*.task.md` | Task tracking (todo format) |
| `approvals/pending/*.md` | Actions awaiting your review |
| `memory/*.md` | Knowledge base |
| `inbox/*.jsonl` | External message queues |

## 🤖 Agents

| Agent | Role | Key Tools |
|-------|------|-----------|
| **planner-001** | Decomposes tasks | create_task, query_tasks |
| **retriever-001** | Fetches information | read_file, list_directory |
| **executor-001** | Runs commands | execute_command, write_file |
| **evaluator-001** | Validates outputs | query_tasks, update_task |

## 🔧 Tools Available

### File Operations
- `read_file` - Read file contents
- `write_file` - Create/modify files (approval required)
- `list_directory` - List files/folders
- `create_directory` - Make directories

### Task Management
- `query_tasks` - SQL-like task queries
- `create_task` - Add new task
- `update_task` - Modify task status

### System
- `execute_command` - Run shell commands (approval may be required)

### Communication
- `send_message` - Message another agent
- `slack_send` - Post to Slack (approval required)
- `slack_read` - Read Slack inbox

## 📋 Approval Workflow

1. **Agent proposes action** → Creates file in `approvals/pending/`
2. **You review** → Edit the approval file
3. **You decide** → Set `Decision: APPROVED` or `Decision: REJECTED`
4. **Daemon executes** → Runs approved action, archives file

## 🔒 Security

Commands checked against allowlist (`storage/terminal-cmd-allowlist.yaml`):

```yaml
# Auto-approved (safe)
'ls *': true
'docker ps*': true
'node --version': true

# Requires approval (risky)
'rm -rf*': false
'sudo *': false
```

## 📖 Commands

```bash
# Run daemon
npm start

# Run demo scenario
npm run demo

# Test basic examples
node examples/1-ask.js
node examples/2-secure-agent.js

# Watch agent logs
tail -f agents/planner-001.agent.md

# Query tasks (requires todo CLI)
todo query "SELECT * FROM tasks/*.task.md WHERE completed = false"
```

## 🎬 Demo Scenario

**Scenario:** Slack message → Redis check → Response

1. Slack: "Can you check if Redis is running?"
2. Planner: Creates sub-tasks
3. Retriever: Finds Docker info
4. Executor: Proposes `docker ps` command
5. **You: Approve command** ← Human in the loop
6. Executor: Runs command, logs result
7. Evaluator: Validates output
8. Planner: Drafts Slack response
9. **You: Approve message** ← Human in the loop
10. System: Sends to Slack

## 🛠️ Customization

### Add Agent
```bash
# Copy existing agent
cp agents/planner-001.agent.md agents/my-agent.agent.md

# Edit system prompt
nano agents/my-agent.agent.md
```

### Add Tool
Edit `lib/tools.js`:
```javascript
my_tool: {
  definition: { /* ... */ },
  requiresApproval: false,
  execute: async (args) => { /* ... */ }
}
```

### Add Knowledge
```bash
# Add to knowledge base
echo "# My Knowledge" > memory/my-docs.md
```

## 🐛 Troubleshooting

| Issue | Solution |
|-------|----------|
| Daemon not processing | Check last message role is `user` |
| Tool not executing | Check approval file format |
| Auth expired | `rm .tokens.yaml && npm start` |
| File not detected | Ensure `.agent.md` extension |

## 📚 Documentation

- **ARCHITECTURE.md** - Full system design
- **README-MULTIAGENT.md** - Detailed user guide
- **SETUP.md** - Step-by-step setup guide
- **examples/** - Simple code examples

## 🎯 Core Concepts

### 1. File-Based Everything
State, messages, approvals - all in human-readable files

### 2. Append-Only Logs
Agent chat logs are append-only for full audit trail

### 3. Human-In-The-Loop
High-risk actions require explicit approval via file edits

### 4. Agent Specialization
Each agent type has specific role and tool access

### 5. Task-Driven Workflow
Tasks coordinate multi-agent collaboration

### 6. Git-Based History
Every change tracked in version control

## 💡 Best Practices

1. **Review approvals carefully** - You're the safety net
2. **Monitor agent logs** - Understand agent reasoning
3. **Use Git commits** - Checkpoint important states
4. **Start with demo** - Learn the workflow
5. **Customize gradually** - Add features incrementally

## 🔗 Related Files

```
daemon.js              # Main orchestrator
lib/agent-parser.js    # Parse agent files
lib/tools.js           # Tool definitions
lib/approval.js        # Approval system
lib/session.js         # GitHub auth
demo-scenario.js       # Demo initialization
```

## ⚡ Pro Tips

- **Watch console output** - Daemon logs everything
- **Edit approval files fast** - Agents wait for you
- **Use multiple terminals** - One for daemon, one for monitoring
- **Check task dependencies** - Understand execution order
- **Read agent chat logs** - See their thought process
- **Experiment safely** - Everything is reversible

## 🎓 Learning Path

1. ✅ Run demo scenario
2. ✅ Observe multi-agent collaboration
3. ✅ Approve a few actions manually
4. ✅ Read agent chat logs
5. ✅ Modify an agent's system prompt
6. ✅ Add custom knowledge to memory/
7. ✅ Create a custom tool
8. ✅ Build a new agent type

---

**Ready?** Run `npm run demo` then `npm start` to see it in action! 🚀
