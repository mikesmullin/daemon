# 🚀 Multi-Agent System - Getting Started Checklist

Use this checklist to get your multi-agent system up and running.

## Prerequisites ✓

- [ ] Node.js v18+ installed
  ```bash
  node --version  # Should be v18 or higher
  ```

- [ ] GitHub account with Copilot access
  - [ ] Active Copilot subscription
  - [ ] GitHub account credentials ready

- [ ] WSL2 (Windows) or Linux/macOS
  ```bash
  uname -a  # Verify your environment
  ```

## Installation Steps

### 1. Dependencies ✓

- [ ] Install Node packages
  ```bash
  cd /mnt/z/tmp7-opencode
  npm install
  ```

- [ ] Verify chokidar installed
  ```bash
  npm list chokidar  # Should show chokidar@^3.6.0
  ```

### 2. Directory Structure ✓

These should already exist from the implementation:

- [ ] `agents/` directory with 4 agent files
  ```bash
  ls agents/*.agent.md
  # Should show:
  # planner-001.agent.md
  # retriever-001.agent.md
  # executor-001.agent.md
  # evaluator-001.agent.md
  ```

- [ ] `memory/` directory with knowledge base
  ```bash
  ls memory/*.md
  # Should show:
  # system-config.md
  # team-prefs.md
  ```

- [ ] Empty directories for runtime
  ```bash
  ls -d tasks approvals inbox
  # All should exist
  ```

### 3. Configuration ✓

- [ ] Review command allowlist
  ```bash
  cat storage/terminal-cmd-allowlist.yaml
  ```

- [ ] Customize if needed (optional)
  - [ ] Add safe commands for auto-approval
  - [ ] Add dangerous patterns to block

### 4. Authentication 🔐

- [ ] Run authentication flow
  ```bash
  npm start
  ```

- [ ] Browser should open automatically
- [ ] Authorize GitHub app
- [ ] Verify tokens saved
  ```bash
  ls -la .tokens.yaml
  # Should exist and contain tokens
  ```

- [ ] Stop daemon (Ctrl+C) after auth succeeds

## Running the Demo 🎬

### Step 1: Initialize Scenario

- [ ] Run demo initialization
  ```bash
  npm run demo
  ```

- [ ] Verify output shows:
  - [ ] ✓ Slack message written to inbox
  - [ ] ✓ Message appended to planner agent
  - [ ] Expected workflow explanation

### Step 2: Start Daemon

- [ ] Open a second terminal
  ```bash
  # Terminal 2
  cd /mnt/z/tmp7-opencode
  npm start
  ```

- [ ] Verify daemon output shows:
  - [ ] 🚀 Daemon Starting
  - [ ] ✓ Authentication successful
  - [ ] ✓ File watchers active
  - [ ] ✓ Initial scan complete
  - [ ] ✅ Daemon is running

### Step 3: Watch Agent Processing

- [ ] Daemon should detect planner's new message
  ```
  💬 Agent planner-001 has new message, processing...
  🤖 Calling Copilot API...
  ```

- [ ] Agent may request tools
  ```
  🔧 Agent requested 2 tool call(s)
  ```

- [ ] Some tools auto-execute (read-only)
  ```
  ✅ Auto-approved - executing...
  ✓ Tool executed: SUCCESS
  ```

### Step 4: Approve Actions

- [ ] Check for approval requests
  ```bash
  # Terminal 1 or 3
  ls -la approvals/pending/
  ```

- [ ] If approval files exist:
  - [ ] Open file in text editor
    ```bash
    nano approvals/pending/exec-*.approval.md
    ```
  
  - [ ] Find Review section
  - [ ] Change `Decision: <!-- APPROVED | REJECTED -->`
  - [ ] To: `Decision: APPROVED`
  - [ ] Add your name: `Reviewed by: Your Name`
  - [ ] Add timestamp: `Reviewed at: 2025-10-04T12:00:00Z`
  - [ ] Save and close

- [ ] Watch daemon detect approval
  ```
  📋 Approval decision received: APPROVED
  ✅ Executing approved action...
  ```

### Step 5: Monitor Agents

- [ ] Open agent logs in another terminal
  ```bash
  # Terminal 3
  tail -f agents/planner-001.agent.md
  ```

- [ ] Watch conversation unfold
  - [ ] User messages
  - [ ] Assistant responses
  - [ ] Tool calls
  - [ ] Tool results

- [ ] Check other agents
  ```bash
  tail -f agents/executor-001.agent.md
  tail -f agents/retriever-001.agent.md
  ```

### Step 6: Task Tracking (Optional)

If you have `todo` CLI installed:

- [ ] Query tasks
  ```bash
  todo query "SELECT * FROM tasks/*.task.md"
  ```

- [ ] Check incomplete tasks
  ```bash
  todo query "SELECT title, stakeholders FROM tasks/*.task.md WHERE completed = false"
  ```

## Verification Checklist ✓

### System is Working If:

- [ ] Daemon starts without errors
- [ ] Agent files are being processed
- [ ] Tool calls are executed
- [ ] Approval files are created for risky actions
- [ ] Approved actions execute successfully
- [ ] Results are logged to agent files
- [ ] No error messages in daemon output

### Common Success Indicators:

```bash
# Daemon console should show:
✓ Authentication successful
✓ File watchers active
💬 Agent planner-001 has new message
🤖 Calling Copilot API
🔧 Agent requested tool call(s)
✅ Auto-approved - executing
✓ Tool executed: SUCCESS

# Agent files should grow:
ls -lh agents/*.agent.md
# File sizes should increase as conversation proceeds

# Approval files created:
ls approvals/pending/
# May contain exec-*.approval.md files

# After approval:
ls approvals/approved/
# Approved files moved here
```

## Troubleshooting Steps

### If Daemon Won't Start

- [ ] Check Node version: `node --version`
- [ ] Reinstall dependencies: `rm -rf node_modules && npm install`
- [ ] Delete old tokens: `rm .tokens.yaml`
- [ ] Try auth again: `npm start`

### If Agents Not Processing

- [ ] Verify last message role is `user` (not `assistant`)
  ```bash
  tail -20 agents/planner-001.agent.md
  ```

- [ ] Check file saved properly (timestamp updated)
  ```bash
  ls -la agents/planner-001.agent.md
  ```

- [ ] Restart daemon (Ctrl+C, then `npm start`)

### If Tools Not Executing

- [ ] Check approval file format
  ```bash
  cat approvals/pending/exec-*.approval.md
  ```

- [ ] Ensure `Decision: APPROVED` (exact spelling)
- [ ] Check file permissions
  ```bash
  ls -la approvals/pending/
  ```

### If Authentication Fails

- [ ] Clear tokens: `rm .tokens.yaml`
- [ ] Clear browser cache for github.com
- [ ] Try incognito/private window
- [ ] Verify Copilot subscription active

## Next Steps After Demo Works

### 1. Customize Agents

- [ ] Edit system prompts in `agents/*.agent.md`
- [ ] Adjust agent behaviors for your use case
- [ ] Add domain-specific knowledge to prompts

### 2. Expand Knowledge Base

- [ ] Add files to `memory/`
  ```bash
  echo "# My Documentation" > memory/my-docs.md
  ```

- [ ] Document your systems
- [ ] Add team preferences
- [ ] Include configuration details

### 3. Create Custom Tools

- [ ] Edit `lib/tools.js`
- [ ] Add tool definitions
- [ ] Implement execute functions
- [ ] Set approval requirements

### 4. Build New Agents

- [ ] Copy existing agent
  ```bash
  cp agents/planner-001.agent.md agents/my-agent.agent.md
  ```

- [ ] Customize for new role
- [ ] Define specialized capabilities
- [ ] Add to workflow

### 5. External Integration

- [ ] Set up Slack webhook (optional)
- [ ] Add email monitoring (optional)
- [ ] Create webhook receiver (optional)
- [ ] Connect other systems (optional)

## Documentation Reference

As you explore, refer to:

- **QUICKREF.md** - Quick command reference
- **ARCHITECTURE.md** - System design deep dive
- **README-MULTIAGENT.md** - Full user guide
- **SETUP.md** - Detailed setup instructions
- **DIAGRAMS.md** - Visual diagrams
- **examples/** - Code examples

## Success Metrics

You're ready to use the system when:

- ✅ Daemon runs continuously without errors
- ✅ Agents process messages and call tools
- ✅ Approval workflow functions correctly
- ✅ You can approve actions via file edits
- ✅ Agent collaboration produces results
- ✅ You understand the file-based workflow

## Community & Support

- Check existing documentation first
- Read agent logs for debugging
- Review approval files for context
- Use Git history to track changes
- Experiment safely (everything's reversible!)

---

## Quick Command Reference

```bash
# Start system
npm run demo    # Initialize scenario
npm start       # Start daemon

# Monitor
tail -f agents/planner-001.agent.md      # Watch agent
ls -la approvals/pending/                # Check approvals

# Approve
nano approvals/pending/exec-*.approval.md  # Edit
# Change: Decision: APPROVED

# Query (if todo installed)
todo query "SELECT * FROM tasks/*.task.md"

# Stop
# Ctrl+C in daemon terminal
```

---

**Ready? Let's start!** ✓

```bash
npm run demo
# Then in another terminal:
npm start
```

🚀 Your multi-agent system is ready to go!
