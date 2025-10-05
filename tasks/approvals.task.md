# Approval Tasks

All approval requests are tracked here using the todo task format.

## TODO
- [x] A @human #approval `Approve command: podman ps --filter "name=redis" --format "{{.Statu` id: approval-1759639914972-093d24d6
  completed: true
  priority: A
  stakeholders: "human"
  tags: "approval"
  type: approval_request
  approval_type: terminal_command
  agent: executor-001-38b9fd4f
  created: 2025-10-05T04:51:54.972Z
  risk: LOW
  status: pending
  approved_by: human-operator
  approved_at: 2025-10-05T04:52:00.000Z
  description: |
    Approval Request: terminal_command
    Risk Level: LOW
    
    Details:
      Command: podman ps --filter "name=redis" --format "{{.Status}}"
    
    To approve: Update this task:
      1. Change [_] to [x]
      2. Add: approved_by: <your-name>
      3. Add: approved_at: <timestamp>
    
    To reject: Update this task:
      1. Change [_] to [-]
      2. Add: rejected_by: <your-name>
      3. Add: rejection_reason: <reason>
    
- A @executor-001 #redis #infra "Check if Redis container is running locally" id: 38b9fd4f
  priority: A
  stakeholders: "executor-001"
  tags: "redis,infra"
  prompt: |
    Check if the Redis container is running locally on the system. Include the
    following details in your output:
    1. Container status (e.g., running, stopped, not found)
    2. Uptime if running
    3. Memory usage (e.g., 45MB / 512MB)
    4. Check logs for errors or anomalies
    
    Respond concisely with a bullet-point summary of metrics as Sarah prefers
    brevity and concise updates.
    
- A @executor-001 #container #redis #urgent "Request approval to inspect Redis container status" id: 5dc5fef7
  priority: A
  stakeholders: "executor-001"
  tags: "container,redis,urgent"
  prompt: |
    Using the podman container engine, identify whether a Redis container is
    running.
    Details required:
    1. Container status (running, stopped, not found)
    2. If running, output uptime
    3. If running, find memory statistics (formatted like 45MB / 512MB)
    4. Review logs for Redis-specific anomalies or errors
