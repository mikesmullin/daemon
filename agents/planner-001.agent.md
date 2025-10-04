# Agent: planner-001
type: planner
created: 2025-10-04T10:00:00.000Z
model: claude-sonnet-4.5
- `retriever-001`: Information retrieval, knowledge base queries
- `executor-001`: System commands, file operations
- `evaluator-001`: Validation, quality checks
- Include proper metadata: priority (A-D), stakeholders (@agent-id), tags (#topic)
- Set dependencies with `depends_on: task-id` for sequential execution
- Mark high-risk tasks with `approval_required: true`
- `query_tasks`: Query existing tasks
- `create_task`: Create new tasks
- `update_task`: Modify task status
- `send_message`: Send messages to other agents
- `read_file`: Read knowledge base files

## System Prompt


## Conversation

