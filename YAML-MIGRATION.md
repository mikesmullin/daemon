# YAML Migration Summary

## What Changed

### 1. Agent Storage Architecture
**Before:** Markdown files in `agents/*.agent.md`
**After:** YAML-based two-tier architecture:
- `templates/*.agent.yaml` - Agent templates (blueprints/classes)
- `sessions/*.session.yaml` - Chat instances (active conversations)

### 2. Approval System
**Before:** Markdown files in `approvals/pending/*.approval.md`
**After:** Task-based approvals in `tasks/*.task.md` using todo CLI format

### 3. Main Daemon
**Before:** `daemon.js` using Markdown agent files
**After:** `daemon-yaml.js` using YAML sessions (now default via `npm start`)

## Directory Structure

```
copilot-cli/
├── templates/          # Agent templates (NEW)
│   ├── planner-001.agent.yaml
│   ├── executor-001.agent.yaml
│   ├── retriever-001.agent.yaml
│   └── evaluator-001.agent.yaml
│
├── sessions/           # Active chat sessions (NEW)
│   ├── planner-001-{timestamp}.session.yaml
│   └── executor-001-{timestamp}.session.yaml
│
├── tasks/              # Task tracking (TODO format from tmp6-todo)
│   ├── approvals.task.md      # Approval requests as tasks
│   ├── planner-001.task.md    # Per-agent task lists
│   └── executor-001.task.md
│
├── agents/             # DEPRECATED - will be removed
│   └── *.agent.md      # Old Markdown format
│
├── approvals/          # DEPRECATED - will be removed  
│   ├── pending/
│   ├── approved/
│   └── rejected/
│
├── memory/             # Knowledge base (unchanged)
│   ├── system-config.md
│   └── team-prefs.md
│
└── inbox/              # External messages (unchanged)
    └── slack-messages.jsonl
```

## Migration Path

1. ✅ Created `lib/agent-parser-yaml.js` - New YAML parser
2. ✅ Created `daemon-yaml.js` - New YAML-based daemon
3. ✅ Created `migrate-to-yaml.js` - Migration script
4. ✅ Updated tests - Added YAML unit tests
5. ✅ All tests passing (70/70)

## TODO: Remaining Changes

1. Update approval system to use task format
2. Clean up agents/*.md files (one-time)
3. Remove approvals/* directory structure
4. Update `npm run clean` to remove sessions/*.yaml
5. Update documentation

## Benefits

- **Cleaner**: YAML is easier to parse and edit than Markdown
- **Structured**: Separate templates from instances
- **Scalable**: Multiple concurrent sessions per agent
- **State Management**: Session status (active, sleeping, completed)
- **Tool-friendly**: Standard YAML libraries work everywhere
- **Task Integration**: Approvals use same format as task tracking
