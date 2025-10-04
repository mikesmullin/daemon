# Multi-Agent System Setup Guide

## Prerequisites

- Node.js v18+ installed
- GitHub account with Copilot access
- WSL2 (if on Windows) or Linux/macOS

## Installation Steps

### 1. Install Dependencies

```bash
cd /mnt/z/tmp7-opencode
npm install
```

This installs:
- `chokidar@^3.6.0` - File watching for the daemon
- `openai@^6.1.0` - Copilot API client
- `js-yaml@^4.1.0` - YAML parsing for config
- `open@^10.1.0` - Browser opening for OAuth

### 2. Verify Directory Structure

The demo scenario creates these automatically, but verify:

```bash
ls -la agents/          # Should contain 4 .agent.md files
ls -la memory/          # Should contain knowledge base files
ls -la tasks/           # Empty initially
ls -la inbox/           # Empty initially
```

### 3. Install todo CLI (Optional)

For task management features:

```bash
cd tmp/tmp6-todo
npm install
npm link
```

Now `todo` command is available globally.

### 4. Configure Security Allowlist

Review `storage/terminal-cmd-allowlist.yaml`:

```yaml
# Add safe commands for your environment
'docker ps*': true
'git status': true
'ls *': true

# Block dangerous patterns
'rm -rf*': false
'sudo *': false
```

## Running the System

### Option 1: Full Demo Scenario

```bash
# Terminal 1: Initialize the scenario
npm run demo

# Terminal 2: Start the daemon
npm start
```

### Option 2: Manual Testing

```bash
# 1. Start daemon
node daemon.js

# 2. In another terminal, add a message to any agent
echo '### 2025-10-04 12:00:00 | user
What files are in the current directory?' >> agents/executor-001.agent.md

# 3. Watch the daemon process the message
```

### Option 3: Simple Examples

```bash
# Test basic Copilot API
node examples/1-ask.js

# Test tool calling with security
node examples/2-secure-agent.js
```

## Workflow Walkthrough

### 1. Daemon Starts

```bash
node daemon.js
```

Output:
```
🚀 Multi-Agent Orchestrator Daemon Starting...
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔐 Authenticating with GitHub Copilot...
✓ Authentication successful

👀 Starting file watchers...
✓ File watchers active

🔍 Scanning for pending work...
   Found 4 agent(s)
✓ Initial scan complete

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ Daemon is running. Press Ctrl+C to stop.
```

### 2. Demo Scenario Initialization

```bash
node demo-scenario.js
```

This:
- Creates a simulated Slack message in `inbox/slack-messages.jsonl`
- Appends a user message to `agents/planner-001.agent.md`
- Displays the expected workflow

### 3. Agent Processing

The daemon detects the new message and:

```
💬 Agent planner-001 has new message, processing...
🤖 Calling Copilot API (model: claude-sonnet-4.5)...
🔧 Agent requested 2 tool call(s)
  📌 Tool: create_task
  📋 Args: {...}
  ✅ Auto-approved - executing...
  ✓ Tool executed: SUCCESS
```

### 4. Approval Required

When executor wants to run a command:

```
💬 Agent executor-001 has new message, processing...
🤖 Calling Copilot API...
🔧 Agent requested 1 tool call(s)
  📌 Tool: execute_command
  📋 Args: {"command": "docker ps --filter \"name=redis\""}
  ⚠️  Requires approval - creating request...
  📝 Approval request created: approvals/pending/exec-20251004-001.approval.md
```

### 5. Human Reviews and Approves

Edit `approvals/pending/exec-20251004-001.approval.md`:

**Before:**
```markdown
**Decision:** <!-- APPROVED | REJECTED -->
```

**After:**
```markdown
**Decision:** APPROVED
**Reviewed by:** Your Name
**Reviewed at:** 2025-10-04T10:15:00Z
```

Save the file.

### 6. Daemon Executes Approved Action

```
📋 Approval decision received: APPROVED
   File: approvals/pending/exec-20251004-001.approval.md
   ✅ Executing approved action...
   ✓ Tool executed: SUCCESS
```

The approval file is moved to `approvals/approved/`.

### 7. Agents Continue Collaboration

- Executor logs results to its chat
- Task is marked complete
- Evaluator receives notification
- Planner drafts response
- Cycle continues...

## Monitoring the System

### Watch Agent Conversations

```bash
# Follow planner's thoughts
tail -f agents/planner-001.agent.md

# See executor's actions
tail -f agents/executor-001.agent.md
```

### Check Task Progress

```bash
# List all tasks
todo query "SELECT * FROM tasks/*.task.md"

# Find incomplete tasks
todo query "SELECT title, stakeholders FROM tasks/*.task.md WHERE completed = false"
```

### Review Approvals

```bash
# Pending approvals
ls -lt approvals/pending/

# Recently approved
ls -lt approvals/approved/ | head -5
```

### Monitor External Messages

```bash
# Incoming Slack messages
cat inbox/slack-messages.jsonl

# Outgoing Slack messages
cat inbox/slack-outbox.jsonl
```

## Customizing Agents

### Modify System Prompt

Edit any `agents/*.agent.md` file:

```markdown
# Agent: executor-001
type: executor
created: 2025-10-04T10:00:00Z

## System Prompt
You are an execution agent...

[Modify this section to change agent behavior]

## Conversation
[Do not edit - managed by daemon]
```

Restart daemon to apply changes.

### Add Custom Tools

Edit `lib/tools.js`:

```javascript
export const tools = {
  // Add your tool here
  custom_tool: {
    definition: {
      type: 'function',
      function: {
        name: 'custom_tool',
        description: 'Does X',
        parameters: {
          type: 'object',
          properties: {
            arg1: { type: 'string', description: 'Argument 1' }
          },
          required: ['arg1']
        }
      }
    },
    requiresApproval: false,
    execute: async (args) => {
      // Implementation
      return { success: true, data: '...' };
    }
  }
};
```

Restart daemon to register new tool.

## Common Issues

### Issue: Daemon not detecting changes

**Solution:**
- Ensure file was saved (check timestamp)
- Verify file watcher is running (check console)
- Try: `touch agents/planner-001.agent.md`

### Issue: Tool execution fails

**Solution:**
- Check approval file has correct format
- Verify tool name matches definition
- Check daemon logs for error details

### Issue: Authentication expired

**Solution:**
```bash
rm .tokens.yaml
node daemon.js
# Follow browser OAuth flow again
```

### Issue: Agents not collaborating

**Solution:**
- Check task file has correct agent assignment
- Verify agent IDs match filename (e.g., `planner-001`)
- Check daemon processed task creation

## Advanced Usage

### Parallel Agent Processing

Create multiple planners for different domains:

```bash
cp agents/planner-001.agent.md agents/planner-backend.agent.md
cp agents/planner-001.agent.md agents/planner-frontend.agent.md
```

Modify system prompts for specialization.

### External Integration

Add a webhook receiver:

```javascript
// webhook-listener.js
import express from 'express';
import { appendMessage } from './lib/agent-parser.js';

const app = express();
app.use(express.json());

app.post('/webhook/slack', (req, res) => {
  const message = req.body;
  appendMessage('agents/planner-001.agent.md', {
    role: 'user',
    content: `Slack message: "${message.text}"`
  });
  res.json({ ok: true });
});

app.listen(3000);
```

### Git-Based Workflows

Initialize Git in workspace directories:

```bash
cd workspaces/executor-001
git init
git add .
git commit -m "Initial state"

# After agent executes commands
git diff  # See what changed
git reset --hard  # Rollback if needed
```

## Next Steps

1. **Run the demo** - See the full workflow in action
2. **Customize agents** - Adjust system prompts for your use case
3. **Add integrations** - Connect to Slack, email, etc.
4. **Create specialized agents** - Build agents for specific domains
5. **Expand tools** - Add tools for your specific needs

## Resources

- [ARCHITECTURE.md](./ARCHITECTURE.md) - Full system design
- [README-MULTIAGENT.md](./README-MULTIAGENT.md) - User guide
- `examples/` - Simple usage examples
- `lib/` - Core implementation to study

## Support

For issues or questions:
1. Check daemon console output for errors
2. Review agent chat logs in `agents/*.agent.md`
3. Verify approval files are properly formatted
4. Check file permissions and paths
