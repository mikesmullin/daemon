# Tool Calls

- **EDITORS_NOTE**: include return types and example OK/ERR replies.

Modern agentic AI/LLM APIs (such as OpenAI API) support `tool_call` function invocations.

Daemon-v4 supports the following tool calls.

## tool_call fn inventory

### `Browser.open` (previously: `open_browser`)

roles: `Hub`

Open URL in system browser. Desktop only, requires user environment.

#### Parameters
```typescript
url: string
```

---

### `FS.append` (previously: `fs__file__append`)

roles: `Hub`, `Worker`

Append content to file. Creates file if missing.

#### Parameters
```typescript
path: string
content: string
```

---

### `FS.await` (previously: `fs__file__await`)

roles: `Hub`, `Worker`

Wait for file creation/modification. Blocks until file is created or modified.

#### Parameters
```typescript
path: string
timeout?: number
```

Very valuable function. Watches the filesystem for file creation or modification events on a specified path, blocking until the event occurs or timeout is reached. Replaces the deprecated ask_human/approval functions by allowing agents to wait for human operator responses via file modifications. Two files are used: one for agent questions to humans, another for permission requests. Enables simple, effective inter-process communication between agents and human operators.

---

### `FS.edit` (previously: `edit_file`)

roles: `Hub`, `Worker`

Modify file content (full replace). Validates file exists first.

#### Parameters
```typescript
path: string
content: string
```

Potentially the most important and most commonly used function; it provides the LLM with fuzzy edit capability. Allows agents to edit files on disk. File must exist first. Includes an integrity feature: maintains a last-view timestamp per file. If the file's modification time is newer than the last view timestamp, the function returns an error, requiring the agent to read the file first. This ensures edit integrity by preventing agents from composing patches based on stale file content.

---

### `FS.grep` (previously: `grep_search`)

roles: `Hub`, `Worker`

Search file contents by pattern. Supports regex mode and case sensitivity.

#### Parameters
```typescript
pattern: string
path: string
options?: object
```

---

### `FS.ls` (previously: `fs__dir__list`)

roles: `Hub`, `Worker`

List directory contents. Returns file/folder structure.

#### Parameters
```typescript
path: string
recursive?: boolean
```

---

### `FS.mkdir` (previously: `fs__dir__create`)

roles: `Hub`, `Worker`

Create directory tree. Recursive directory creation.

#### Parameters
```typescript
path: string
mode?: string
```

---

### `FS.read` (previously: `fs__file__read`)

roles: `Hub`, `Worker`

Read file contents. Full or partial reads supported.

#### Parameters
```typescript
path: string
encoding?: string
```

---

### `FS.rmdir` (previously: `fs__dir__delete`)

roles: `Hub`, `Worker`

Remove directory (recursive). Force flag for non-empty dirs.

#### Parameters
```typescript
path: string
force?: boolean
```

---

### `FS.touch` (previously: `create_file`)

roles: `Hub`, `Worker`

Create new file with content. Creates parent directories automatically.

#### Parameters
```typescript
path: string
content: string
```

Responsible for creating new files on disk. If the file doesn't exist, it is created automatically. If the parent directory doesn't exist, it is created automatically. If the file already exists, the function returns an error.

---

### `FS.unlink` (previously: `fs__file__delete`)

roles: `Hub`, `Worker`

Remove single file. Errors if file doesn't exist.

#### Parameters
```typescript
path: string
```

---

### `FS.write` (previously: `fs__file__write`)

roles: `Hub`, `Worker`

Write/overwrite file. Truncates existing content.

#### Parameters
```typescript
path: string
content: string
encoding?: string
```

---

### `Session.append` (previously: `command_agent`)

roles: `Hub`

Send command to running agent. Synchronous execution.

#### Parameters
```typescript
agent_id: string
command: string
```

Able to issue a command to an LLM by appending a user prompt to the context window and submitting it to the remote API for the AI. Its relationship to the Session class is that it effectively appends to the bottom of the message list in the session. Used by orchestrator agents to issue prompts to sub-agents.

---

### `Session.available` (previously: `available_agents`)

roles: `Hub`

List all available agent templates. Returns array of agent names.

#### Parameters
None

Still useful. Helps the agent decide what subagents it can instantiate and run. Essential for agent orchestration and composition.

---

### `Session.create` (previously: `create_agent`)

roles: `Hub`

Instantiate new agent. Creates session and workspace.

#### Parameters
```typescript
name: string
template: string
config?: object
```

Responsible for starting a new session by copying an existing agent template. Used by orchestrator agents to launch sub-agents. Essential for agent composition and multi-agent workflows.

---

### `Session.delete` (previously: `delete_agent`)

roles: `Hub`

Remove agent (soft delete). Stops container, preserves session file.

#### Parameters
```typescript
agent_id: string
```

Part of the Session class. Used by orchestrator agents to abort a running subagent session.

---

### `Session.running` (previously: `running_agents`)

roles: `Hub`

List all active agent containers. Returns agent IDs and status.

#### Parameters
None

---

### `Session.slice` (previously: `check_agent_response`)

roles: `Hub`

Poll agent response status. Legacy polling mechanism.

#### Parameters
```typescript
agent_id: string
summarize?: string
```

Session CRUD operations on session YAML files. Should be expanded with more granular functions: functions to selectively pull last/first/n-number messages from session, function to retrieve Haiku-summarized versions of message slices (helpful for session compaction and orchestrator agents that only need outcome summaries). Currently limited polling; needs richer session query API. If summarize is provided, it's an LLM prompt that will be sent to a small/fast model (the LLM will work on the slice of text, using your instructions from summarize, and only its answer will be returned instead of the sliced text).

---

### `Shell.exec` (previously: `execute_shell`)

roles: `Hub`, `Worker`

Run shell command with output capture. Returns stdout, stderr, exit code.

#### Parameters
```typescript
command: string
cwd?: string
timeout?: number
```

The most consistently valuable function in the toolset. Allows agents to execute Bash commands with built-in security features. Uses an allow list to verify command safety. Supports two modes: Attended mode (human operator present) prompts the operator to allow/deny unlisted commands; Unattended mode (no human operator) automatically rejects unlisted commands with an error message guiding the agent to try safer variations.


# Roles

Each tool call defines which roles are allowed to execute them; this is a security feature.
Many tool calls are sensitive and therefore should only be executed inside the container (`worker`) environment.
A few tool calls are fundamentally responsible for command and control and can only be executed on the `hub`; This may include high-risk commands, And the purpose of defining it per agent per tool is to limit exposure to these tool calls to just a few special agent templates.

You may notice that there's a pattern of how the Roles are distributed among tool calls;
Most tool call fns (ie. FS and Shell) are able to be executed on hub or worker,
while Session is limited to Hub only.

However, the enforcement and definition of this tool-call-to-role relationship is not defined on the tool;
It is defined within each agent template, below the listing of each tool (template > tools > workers) is a listing of which roles the tool is permitted to execute on  (for that agent teplate).
Therefore, enforcement happens at the point which tool calls are are provided as a list to the agent in the API call;
We simply omit any tools the agent should not be permitted to use from its context window so it's not able to be aware that they're there to call,
And similarly, when the agent does make a tool call request, we filter that list as well so that it cannot map map to the actual tool called definition (ie. For example, if it were to make a guess, about an unlisted tool call namae; that would be denied)

Likewise, when it's time to dispatch and execute the tool call, 
we must first determine whether it can be run on the hub directly or whether it must be run on a worker;
And that mapping comes from the agent template, We check if the requested tool call can be run on the hub, and if it can, then we run it there...
Otherwise, The hub routes the command request to be executed on the worker named in the agent template for that tool;
Note also that multiple workers could be listed per tool, and therefore if there are multiple candidates, The hub must iterate In the order that the workers are specified in the list of inside the template, to find the first available worker who can accept and execute the tool call;
in the beginning that will almost always be the first worker unless the worker is unavailable or disconnected from the cluster.
In the future (at scale), however, We can imagine if there are many tool call requests, we may want to load balance them across the available workers (round-robin).

## Example

Here's one possible example of how tools could be listed in the agent template:
(you do not you do not have to use this verbatim, but yours will likely resemble something like it)

NOTE: The role is not needing to be specified explicitly, as we only really care to enforce the worker named is the worker dispatched. The human operator knows which worker is in which role, and that is good enough control for them to limit also by role (by not naming any worker which isn't the role they want).

```yaml
agent:
  name: orchestrator
tools:
- name: Shell.exec
  workers: # hub or workers
  - hub1
  - worker1 
  - worker2
- name: FS.edit
  workers: # worker only
  - worker1
- name: Browser.open
  workers: # hub only
  - hub1
```



