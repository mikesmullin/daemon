# Approval Tasks

All approval requests are tracked here using the todo task format.

## TODO

- [x] A @human #approval `Approve command: podman ps -a --format "{{.Names}} {{.Status}}" | g`
  id: approval-1759642407758-6545c924
  type: approval_request
  approval_type: terminal_command
  agent: executor-001-9b78e6d8
  created: 2025-10-05T05:33:27.758Z
  risk: LOW
  status: approved
  approved_by: human_operator
  approved_at: 2025-10-05T05:33:45.000Z
  description: |
    Approval Request: terminal_command
    Risk Level: LOW
    
    Details:
      Command: podman ps -a --format "{{.Names}} {{.Status}}" | grep redis
    
    To approve: Update this task:
      1. Change [_] to [x]
      2. Add: approved_by: <your-name>
      3. Add: approved_at: <timestamp>
    
    To reject: Update this task:
      1. Change [_] to [-]
      2. Add: rejected_by: <your-name>
      3. Add: rejection_reason: <reason>


- [x] A @human #approval `Approve command: podman ps --format "{{.Names}} {{.Status}}"`
  id: approval-1759642374890-3909a14c
  type: approval_request
  approval_type: terminal_command
  agent: executor-001-9b78e6d8
  created: 2025-10-05T05:32:54.890Z
  risk: LOW
  status: approved
  approved_by: human_operator
  approved_at: 2025-10-05T05:33:15.000Z
  description: |
    Approval Request: terminal_command
    Risk Level: LOW
    
    Details:
      Command: podman ps --format "{{.Names}} {{.Status}}"
    
    To approve: Update this task:
      1. Change [_] to [x]
      2. Add: approved_by: <your-name>
      3. Add: approved_at: <timestamp>
    
    To reject: Update this task:
      1. Change [_] to [-]
      2. Add: rejected_by: <your-name>
      3. Add: rejection_reason: <reason>

- A @executor-001 #redis #status_check "Check Redis container status locally" id: 9b78e6d8
  prompt: |
    Check if the Redis container is running locally. Provide the following metrics:
    
    - Container status (running or stopped)
    - Uptime (if running)
    - Memory usage and limit
    - Log error scan (summarize if any errors exist)
    
    Format the results concisely for Slack, following Sarah's preferences for
    brevity and metrics.
