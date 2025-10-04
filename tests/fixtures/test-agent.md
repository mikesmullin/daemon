# Agent: test-agent-001
type: test
created: 2025-10-04T10:00:00Z
model: claude-sonnet-4.5

## System Prompt

You are a test agent for unit testing purposes.

## Conversation

### 2025-10-04 10:00:00 | user
Test message 1

### 2025-10-04 10:00:01 | assistant
Test response 1

### 2025-10-04 10:00:02 | tool_call
name: read_file
arguments:
  path: "test.txt"

### 2025-10-04 10:00:03 | tool_result
tool_call_id: call_123
success: true

result:
```json
{
  "success": true,
  "content": "test content"
}
```
