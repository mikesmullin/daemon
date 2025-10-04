# Multi-Agent System Visual Overview

## System Architecture

```
┌──────────────────────────────────────────────────────────────────────────┐
│                         HUMAN OPERATOR                                   │
│                                                                          │
│  Actions:                                                                │
│  • Edit agent files to send messages                                    │
│  • Review and approve/reject in approvals/pending/                      │
│  • Modify system prompts in agents/*.agent.md                           │
│  • Add knowledge to memory/*.md                                         │
│                                                                          │
└─────────────────────────────┬────────────────────────────────────────────┘
                              │
                              │ edits files
                              ↓
┌──────────────────────────────────────────────────────────────────────────┐
│                        FILESYSTEM (The "Database")                       │
│                                                                          │
│  agents/                  tasks/                 approvals/              │
│  ├─ planner-001.agent.md  ├─ project.task.md    ├─ pending/             │
│  ├─ retriever-001.agent.md├─ research.task.md   │  └─ exec-*.approval.md│
│  ├─ executor-001.agent.md └─ backup.task.md     ├─ approved/            │
│  └─ evaluator-001.agent.md                      └─ rejected/            │
│                                                                          │
│  memory/                  inbox/                 workspaces/             │
│  ├─ system-config.md      ├─ slack-messages.jsonl  ├─ planner-001/      │
│  └─ team-prefs.md         └─ slack-outbox.jsonl    └─ executor-001/     │
│                                                                          │
└─────────────────────────────┬────────────────────────────────────────────┘
                              │
                              │ watches via chokidar
                              ↓
┌──────────────────────────────────────────────────────────────────────────┐
│                         CLI DAEMON (Orchestrator)                        │
│                                                                          │
│  ┌────────────────┐  ┌─────────────────┐  ┌──────────────────┐         │
│  │ File Watcher   │  │ Message Router  │  │  Tool Executor   │         │
│  │                │  │                 │  │                  │         │
│  │ • agents/*.md  │─▶│ • Parse msgs    │─▶│ • Execute tools  │         │
│  │ • approvals/*  │  │ • Route to API  │  │ • Check allowlist│         │
│  │ • tasks/*.md   │  │ • Append results│  │ • Create approvals│        │
│  └────────────────┘  └─────────────────┘  └──────────────────┘         │
│                                                                          │
│                         ↕ OpenAI SDK                                    │
│  ┌──────────────────────────────────────────────────────────┐           │
│  │          GitHub Copilot API Gateway                      │           │
│  │  • Authentication (OAuth device flow)                    │           │
│  │  • Token management and renewal                          │           │
│  │  • Model selection (claude-sonnet-4.5, gpt-4o, etc.)    │           │
│  │  • Tool definitions registration                         │           │
│  └──────────────────────────────────────────────────────────┘           │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

## Agent Collaboration Flow

```
    ┌──────────────┐
    │ External     │
    │ Event        │
    │ (Slack msg)  │
    └──────┬───────┘
           │
           ↓
    ┌──────────────────┐
    │ inbox/           │
    │ slack-messages   │
    │ .jsonl           │
    └──────┬───────────┘
           │
           ↓ Daemon routes
    ┌──────────────────────────────────────────────────────────┐
    │                    PLANNER AGENT                         │
    │                                                          │
    │  System Prompt: "Break down objectives into tasks..."   │
    │                                                          │
    │  Actions:                                                │
    │  • Analyze request                                       │
    │  • Create task hierarchy                                 │
    │  • Assign to specialized agents                          │
    │  • Track dependencies                                    │
    └──────┬──────────────────────────────────┬────────────────┘
           │                                  │
           │ sends message                    │ creates tasks
           ↓                                  ↓
    ┌──────────────────┐            ┌─────────────────┐
    │ RETRIEVER AGENT  │            │ tasks/          │
    │                  │            │ *.task.md       │
    │ • Read memory/   │            └─────────────────┘
    │ • Search docs    │
    │ • Return context │
    └──────┬───────────┘
           │
           │ sends findings
           ↓
    ┌──────────────────────────────────────────────────────────┐
    │                    EXECUTOR AGENT                        │
    │                                                          │
    │  System Prompt: "Execute commands safely..."             │
    │                                                          │
    │  Actions:                                                │
    │  • Prepare command                                       │
    │  • Check allowlist                                       │
    │  • Request approval if needed                            │
    │  • Execute when approved                                 │
    └──────┬──────────────────────────────────┬────────────────┘
           │                                  │
           │ creates if risky                 │ logs result
           ↓                                  ↓
    ┌──────────────────┐            ┌─────────────────┐
    │ approvals/       │            │ agent chat log  │
    │ pending/         │            │ (tool_result)   │
    │ *.approval.md    │            └────────┬────────┘
    └──────┬───────────┘                     │
           │                                 │
           │ human approves                  │ sends for review
           ↓                                 ↓
    ┌─────────────────────────────────────────────────────────┐
    │                   EVALUATOR AGENT                       │
    │                                                         │
    │  System Prompt: "Validate outputs..."                  │
    │                                                         │
    │  Actions:                                               │
    │  • Check correctness                                    │
    │  • Verify format                                        │
    │  • Assess quality                                       │
    │  • Mark validation complete                             │
    └─────────────┬───────────────────────────────────────────┘
                  │
                  │ validation complete
                  ↓
           ┌──────────────┐
           │ PLANNER      │
           │ • Draft      │
           │   response   │
           │ • Request    │
           │   approval   │
           └──────┬───────┘
                  │
                  ↓
           ┌──────────────┐
           │ HUMAN        │
           │ approves     │
           │ message      │
           └──────┬───────┘
                  │
                  ↓
           ┌──────────────┐
           │ inbox/       │
           │ slack-outbox │
           │ .jsonl       │
           └──────────────┘
```

## Agent File Structure (*.agent.md)

```
┌────────────────────────────────────────────────────────┐
│ # Agent: planner-001                                   │
│ type: planner                                          │
│ created: 2025-10-04T10:00:00Z                         │
│                                                        │
│ ## System Prompt                                       │
│ You are a task planning agent...                      │
│ [Defines agent behavior and capabilities]             │
│                                                        │
│ ## Conversation                                        │
│                                                        │
│ ### 2025-10-04 10:05:23 | user                        │
│ New Slack message: "Check Redis"                      │
│                                                        │
│ ### 2025-10-04 10:05:45 | assistant                   │
│ I'll decompose this into tasks...                     │
│                                                        │
│ ### 2025-10-04 10:05:46 | tool_call                   │
│ name: create_task                                      │
│ arguments:                                             │
│   file: tasks/redis.task.md                           │
│   content: "- [ ] @executor-001 ..."                  │
│                                                        │
│ ### 2025-10-04 10:05:47 | tool_result                 │
│ success: true                                          │
│ task_ids: [task-abc123]                               │
│                                                        │
│ [Append-only log continues...]                        │
└────────────────────────────────────────────────────────┘
```

## Approval Workflow

```
Agent proposes risky action
        │
        ↓
┌───────────────────────────┐
│ Create approval file      │
│ in approvals/pending/     │
└───────────┬───────────────┘
            │
            ↓
┌─────────────────────────────────────────────────┐
│ # Approval Request: exec-20251004-001           │
│ agent: executor-001                              │
│ created: 2025-10-04T10:10:00Z                   │
│ status: pending                                  │
│                                                  │
│ ## Proposed Action                               │
│ **Type:** terminal_command                       │
│ **Command:**                                     │
│ ```bash                                          │
│ docker ps --filter "name=redis"                  │
│ ```                                              │
│ **Risk Level:** LOW                              │
│                                                  │
│ ## Review                                        │
│ **Decision:** <!-- APPROVED | REJECTED -->       │
│ **Notes:**                                       │
│ **Reviewed by:**                                 │
│ **Reviewed at:**                                 │
└──────────────────────┬──────────────────────────┘
                       │
                       │ Human edits file
                       ↓
            ┌──────────────────────┐
            │ Decision: APPROVED   │
            │ Reviewed by: Alice   │
            │ Reviewed at: ...     │
            └──────────┬───────────┘
                       │
                       │ Daemon detects change
                       ↓
            ┌──────────────────────┐
            │ Execute tool         │
            │ Log result           │
            │ Move to approved/    │
            └──────────────────────┘
```

## Tool Execution Flow

```
Agent calls tool
        │
        ↓
┌───────────────────────┐
│ Tool System           │
│ (lib/tools.js)        │
└───────┬───────────────┘
        │
        ├─ requiresApproval? ───Yes──▶ Create approval request
        │                               Wait for human
        │                               Execute when approved
        │
        └─ No ─────────────────────▶ Execute immediately
                                      Log result
                                      Return to agent
```

## Security Layers

```
┌──────────────────────────────────────────────────┐
│                  SECURITY STACK                  │
├──────────────────────────────────────────────────┤
│ Layer 1: Command Allowlist                      │
│ • Regex patterns for safe commands              │
│ • Explicit deny list for dangerous operations   │
│ • Pattern: storage/terminal-cmd-allowlist.yaml  │
├──────────────────────────────────────────────────┤
│ Layer 2: Risk Assessment                        │
│ • Analyzes tool calls for risk level            │
│ • LOW: Read-only, safe operations               │
│ • MEDIUM: Writes, network calls                 │
│ • HIGH: Destructive, privileged operations      │
├──────────────────────────────────────────────────┤
│ Layer 3: Human Approval                         │
│ • Medium+ risk requires approval file           │
│ • Human reviews context and command             │
│ • Explicit APPROVED/REJECTED decision           │
├──────────────────────────────────────────────────┤
│ Layer 4: Workspace Isolation                    │
│ • Each agent has isolated directory             │
│ • Git-based for rollback capability             │
│ • Prevents cross-contamination                  │
├──────────────────────────────────────────────────┤
│ Layer 5: Audit Trail                            │
│ • All actions logged in agent chat files        │
│ • Git tracks every file change                  │
│ • Approval files archived with decisions        │
└──────────────────────────────────────────────────┘
```

## Data Flow Example: Slack Message

```
1. External System
   ┌─────────────────┐
   │ Slack API       │
   │ sends message   │
   └────────┬────────┘
            │
2. Inbox   ↓
   ┌─────────────────────┐
   │ inbox/              │
   │ slack-messages.jsonl│
   │ {"text": "..."}     │
   └────────┬────────────┘
            │
3. Daemon  ↓
   ┌─────────────────────┐
   │ Routes to           │
   │ planner-001         │
   └────────┬────────────┘
            │
4. Planner ↓
   ┌──────────────────────┐
   │ Analyzes request     │
   │ Creates tasks        │
   │ Assigns to agents    │
   └────────┬─────────────┘
            │
5. Tasks   ↓
   ┌──────────────────────┐
   │ tasks/check.task.md  │
   │ - [ ] @retriever-001 │
   │ - [ ] @executor-001  │
   └────────┬─────────────┘
            │
6. Agents  ↓
   ┌──────────────────────┐
   │ Retriever: Get info  │
   │ Executor: Run cmd    │
   │ Evaluator: Validate  │
   └────────┬─────────────┘
            │
7. Approval│
   ┌──────────────────────┐
   │ Human reviews        │
   │ Approves execution   │
   └────────┬─────────────┘
            │
8. Execute ↓
   ┌──────────────────────┐
   │ Command runs         │
   │ Result logged        │
   └────────┬─────────────┘
            │
9. Response↓
   ┌──────────────────────┐
   │ Planner drafts msg   │
   │ Human approves       │
   └────────┬─────────────┘
            │
10. Outbox ↓
   ┌──────────────────────┐
   │ inbox/               │
   │ slack-outbox.jsonl   │
   │ {"message": "..."}   │
   └──────────────────────┘
```

## File Change Detection Flow

```
┌────────────────────────────────────────────────────┐
│              chokidar File Watcher                 │
│  Monitors: agents/*.agent.md, approvals/pending/   │
└──────────────────┬─────────────────────────────────┘
                   │
                   │ File change detected
                   ↓
         ┌─────────────────────┐
         │ Debounce            │
         │ (awaitWriteFinish)  │
         └─────────┬───────────┘
                   │
                   ↓
         ┌─────────────────────┐
         │ Parse file          │
         │ (agent-parser.js)   │
         └─────────┬───────────┘
                   │
                   ├─ Agent file? ───▶ isWaitingForResponse?
                   │                   Yes → Call Copilot API
                   │                         Process response
                   │                         Execute tools
                   │
                   └─ Approval file? ─▶ checkApprovalDecision?
                                        Yes → Execute action
                                              Archive file
```
