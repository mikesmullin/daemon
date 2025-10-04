# 📚 Multi-Agent System - Documentation Index

Welcome to the file-based multi-agent orchestrator! This index helps you navigate the documentation.

## 🚀 Start Here

If you're new to the system, follow this path:

1. **[GETTING-STARTED.md](./GETTING-STARTED.md)** ⭐ **START HERE**
   - Step-by-step checklist
   - Prerequisites verification
   - Demo walkthrough
   - Troubleshooting guide
   - **Time to read: 10 minutes**

2. **[QUICKREF.md](./QUICKREF.md)** - Quick Reference
   - One-page cheat sheet
   - Key commands
   - File locations
   - Agent roles
   - **Time to read: 5 minutes**

3. **[README-NEW.md](./README-NEW.md)** - Project Overview
   - What the system does
   - Key features
   - Quick start commands
   - Use cases
   - **Time to read: 10 minutes**

## 📖 Understanding the System

For deeper understanding:

4. **[ARCHITECTURE.md](./ARCHITECTURE.md)** - System Design
   - Complete architecture
   - Philosophy and principles
   - Component descriptions
   - Workflow patterns
   - Implementation phases
   - **Time to read: 30 minutes**

5. **[DIAGRAMS.md](./DIAGRAMS.md)** - Visual Guides
   - System architecture diagrams
   - Agent collaboration flow
   - Approval workflow
   - Data flow examples
   - Security layers
   - **Time to read: 20 minutes**

## 🔧 Using the System

For practical usage:

6. **[README-MULTIAGENT.md](./README-MULTIAGENT.md)** - User Guide
   - Detailed feature explanations
   - Tool descriptions
   - Task management
   - Security configuration
   - Examples and use cases
   - **Time to read: 40 minutes**

7. **[SETUP.md](./SETUP.md)** - Setup Guide
   - Installation instructions
   - Configuration options
   - Workflow walkthrough
   - Monitoring commands
   - Customization tips
   - **Time to read: 25 minutes**

## 📊 Project Information

8. **[IMPLEMENTATION-SUMMARY.md](./IMPLEMENTATION-SUMMARY.md)** - What Was Built
   - Complete deliverables list
   - Technical highlights
   - Innovation points
   - Statistics and metrics
   - Extension ideas
   - **Time to read: 15 minutes**

## 💻 Code Examples

Located in `examples/` directory:

- **`examples/1-ask.js`** - Basic Copilot API usage
  - System prompts
  - Message roles
  - Multi-turn conversations

- **`examples/2-secure-agent.js`** - Tool calling
  - Function execution
  - Security allowlist
  - Terminal commands

- **`demo-scenario.js`** - Full demo
  - Simulates Slack message
  - Initializes multi-agent workflow
  - Shows expected behavior

## 🗂️ File Structure Reference

### Core System

```
daemon.js                      # Main orchestrator (watch + route + execute)
demo-scenario.js               # Demo initialization script

lib/
├── agent-parser.js           # Parse *.agent.md files
├── approval.js               # Approval workflow system
├── tools.js                  # Tool definitions (13 tools)
├── session.js                # GitHub authentication
└── terminal-allowlist.js     # Command security
```

### Agents

```
agents/
├── planner-001.agent.md      # Task decomposition
├── retriever-001.agent.md    # Information retrieval
├── executor-001.agent.md     # Command execution
└── evaluator-001.agent.md    # Output validation
```

### Knowledge Base

```
memory/
├── system-config.md          # Environment configuration
└── team-prefs.md            # Communication preferences
```

### Runtime Directories

```
tasks/              # Task tracking files (*.task.md)
approvals/          # Approval workflow
  ├── pending/      # Awaiting human review
  ├── approved/     # Approved and executed
  └── rejected/     # Rejected by human
inbox/              # External message queues
  ├── slack-messages.jsonl
  └── slack-outbox.jsonl
```

## 📋 Documentation by Purpose

### "I want to get started quickly"
→ **[GETTING-STARTED.md](./GETTING-STARTED.md)** + **[QUICKREF.md](./QUICKREF.md)**

### "I want to understand how it works"
→ **[ARCHITECTURE.md](./ARCHITECTURE.md)** + **[DIAGRAMS.md](./DIAGRAMS.md)**

### "I want to use all the features"
→ **[README-MULTIAGENT.md](./README-MULTIAGENT.md)** + **[SETUP.md](./SETUP.md)**

### "I want to customize it"
→ **[SETUP.md](./SETUP.md)** + code in `lib/` + agent files

### "I want to know what was built"
→ **[IMPLEMENTATION-SUMMARY.md](./IMPLEMENTATION-SUMMARY.md)**

### "I just want to see it work"
→ Run `npm run demo` then `npm start`

## 🎯 Learning Paths

### Path 1: Quick Demo (30 minutes)
1. Read **GETTING-STARTED.md** checklist
2. Run demo: `npm run demo && npm start`
3. Approve actions in `approvals/pending/`
4. Watch agents collaborate
5. Read **QUICKREF.md** for commands

### Path 2: Understanding (2 hours)
1. Read **README-NEW.md** overview
2. Read **ARCHITECTURE.md** design
3. Study **DIAGRAMS.md** visuals
4. Run demo and observe
5. Read agent chat logs
6. Review code in `lib/`

### Path 3: Mastery (4 hours)
1. Complete Path 2
2. Read **README-MULTIAGENT.md** in full
3. Read **SETUP.md** customization guide
4. Modify agent system prompts
5. Add custom tool
6. Create new agent
7. Build integration (Slack/email)

### Path 4: Extension Development (ongoing)
1. Complete Path 3
2. Study existing tools in `lib/tools.js`
3. Review approval system in `lib/approval.js`
4. Understand file parser in `lib/agent-parser.js`
5. Build custom agents for your domain
6. Create specialized tools
7. Integrate external systems

## 🔍 Finding Specific Information

### Architecture Questions
- **"How do agents communicate?"** → ARCHITECTURE.md → Agent Communication
- **"What's the approval workflow?"** → DIAGRAMS.md → Approval Workflow
- **"How does file watching work?"** → ARCHITECTURE.md → CLI Daemon

### Usage Questions
- **"How do I approve an action?"** → GETTING-STARTED.md → Step 4
- **"What tools are available?"** → QUICKREF.md → Tools Available
- **"How do I query tasks?"** → README-MULTIAGENT.md → Task Format

### Customization Questions
- **"How do I add an agent?"** → SETUP.md → Customizing Agents
- **"How do I create a tool?"** → README-MULTIAGENT.md → Extending
- **"How do I change security?"** → SETUP.md → Configure Security

### Troubleshooting Questions
- **"Daemon won't start"** → GETTING-STARTED.md → Troubleshooting
- **"Agents not processing"** → SETUP.md → Common Issues
- **"Tools not executing"** → README-MULTIAGENT.md → Troubleshooting

## 📏 Documentation Stats

| Document | Size | Reading Time | Purpose |
|----------|------|--------------|---------|
| GETTING-STARTED.md | 10 KB | 15 min | Onboarding checklist |
| QUICKREF.md | 6 KB | 5 min | Quick reference |
| README-NEW.md | 10 KB | 10 min | Project overview |
| ARCHITECTURE.md | 16 KB | 30 min | System design |
| DIAGRAMS.md | 24 KB | 20 min | Visual guides |
| README-MULTIAGENT.md | 12 KB | 40 min | User guide |
| SETUP.md | 9 KB | 25 min | Setup guide |
| IMPLEMENTATION-SUMMARY.md | 11 KB | 15 min | What was built |

**Total: ~98 KB of documentation, ~2.5 hours reading time**

## 🎓 Recommended Reading Order

### For First-Time Users:
1. GETTING-STARTED.md (set up and run)
2. QUICKREF.md (learn commands)
3. README-NEW.md (understand features)

### For Developers:
1. README-NEW.md (overview)
2. ARCHITECTURE.md (design)
3. DIAGRAMS.md (visuals)
4. Code in `lib/` (implementation)

### For Operators:
1. GETTING-STARTED.md (setup)
2. SETUP.md (configuration)
3. README-MULTIAGENT.md (usage)
4. QUICKREF.md (reference)

### For Architects:
1. ARCHITECTURE.md (full design)
2. IMPLEMENTATION-SUMMARY.md (what was built)
3. DIAGRAMS.md (system views)
4. Code review (all files)

## 🆘 Quick Help

### "I'm stuck!"
1. Check **GETTING-STARTED.md** troubleshooting section
2. Read daemon console output for errors
3. Check agent chat logs: `tail -f agents/*.agent.md`
4. Verify file formats match examples
5. Try restarting daemon

### "I want to customize!"
1. Start with **SETUP.md** customization section
2. Review agent files in `agents/`
3. Study tools in `lib/tools.js`
4. Experiment (everything is reversible!)

### "I need examples!"
1. Run the demo: `npm run demo && npm start`
2. Check `examples/` directory
3. Read agent chat logs after demo runs
4. Look at approval files created

## 🔗 External Resources

- **tmp/tmp6-todo/** - Task format reference
- **tmp/opencode/** - Original Go implementation
- **OpenAI SDK docs** - API usage
- **chokidar docs** - File watching

## 🎯 Success Checklist

You understand the system when you can:

- [ ] Explain how agents communicate (via files)
- [ ] Describe the approval workflow (edit markdown)
- [ ] List the 4 agent types and their roles
- [ ] Start the daemon and run the demo
- [ ] Approve an action by editing a file
- [ ] Add a new message to an agent
- [ ] Create a simple custom tool
- [ ] Understand the security model

## 📞 Where to Go for Help

1. **Documentation** - Check this index, find relevant doc
2. **Examples** - Run demo, study `examples/`
3. **Code** - Read `lib/` implementation
4. **Logs** - Check daemon output, agent files
5. **Git** - Review commit history for context

---

## 🚀 Quick Start Commands

```bash
# First time setup
npm install
npm run demo      # Initialize scenario
npm start         # Start daemon (another terminal)

# Monitor
tail -f agents/planner-001.agent.md
ls -la approvals/pending/

# Approve
nano approvals/pending/exec-*.approval.md
# Edit: Decision: APPROVED
```

---

**Start your journey here:** [GETTING-STARTED.md](./GETTING-STARTED.md)

**Need quick reference?** [QUICKREF.md](./QUICKREF.md)

**Want to understand deeply?** [ARCHITECTURE.md](./ARCHITECTURE.md)

**Ready to build?** Run `npm run demo && npm start` 🚀
