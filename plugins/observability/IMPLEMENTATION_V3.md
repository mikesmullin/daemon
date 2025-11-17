# Daemon v3.0 Architecture Implementation Progress

## ✅ Completed Components

### Core Architecture (v3.0)

**Channel Manager** (`src/lib/channel-manager.mjs`) - 275 lines
- Channel YAML persistence in `agents/channels/`
- Session-to-channel mapping
- WebSocket client management
- Event emission and broadcasting

**FSM Engine** (`src/lib/fsm-engine.mjs`) - 289 lines
- Deterministic session state machine
- States: created, pending, running, tool_exec, human_input, paused, success, failed, stopped
- State transition validation
- Main processing loop (10 ticks/sec)
- Non-blocking AI call tracking (stub)

### Modular Server Handlers (plugi

ns/observability/server/)

All handlers are < 150 lines each:

1. **channel-handlers.mjs** (70 lines) - Create, delete, list channels
2. **agent-handlers.mjs** (86 lines) - Invite, pause, resume, stop agents
3. **message-handlers.mjs** (112 lines) - Submit messages, append to session YAML
4. **pty-handlers.mjs** (101 lines) - Attach, detach, input to PTY sessions
5. **session-handlers.mjs** (40 lines) - Update session YAML
6. **template-handlers.mjs** (132 lines) - List, get, save, delete templates with caching
7. **slash-commands.mjs** (60 lines) - Process /join, /invite, /part commands

### Main Server (plugins/observability/serve.mjs) - 671 lines
- HTTP/WebSocket server
- Route messages to appropriate handlers
- Event buffer management
- Static file serving
- Integration with Channel Manager and FSM Engine

## 🚧 TODO: Frontend Redesign

### Required Changes

1. **New HTML Structure** (`app/index.html`)
   - Left sidebar: Channels list (collapsible)
   - Center: Thread view with filter bar
   - Right sidebar: Agents list
   - Bottom: Message input with @mentions

2. **New Web Components** (all in `app/components/`)
   - `channel-list.mjs` - Channel sidebar with unread badges
   - `thread-view.mjs` - Main event timeline
   - `agent-list.mjs` - Right sidebar agents
   - `lucene-filter.mjs` - Filter bar with query input
   - `message-input.mjs` - Textarea with @mention autocomplete
   - `presence-indicator.mjs` - "X agents working..." banner

3. **Event Bubble Widgets** (all in `app/components/bubbles/`)
   - `user-bubble.mjs` - User messages (right-aligned)
   - `agent-bubble.mjs` - Agent responses (left-aligned)
   - `tool-call-bubble.mjs` - Base tool call widget
   - `ask-human-widget.mjs` - Question + textarea + REPLY button
   - `execute-shell-widget.mjs` - Command + output display
   - `create-ptty-widget.mjs` - PTY creation params
   - `send-command-widget.mjs` - PTY command display
   - `speak-human-widget.mjs` - Audio player widget
   - `thinking-widget.mjs` - Thought bubble
   - `editable-bubble.mjs` - YAML editor overlay

4. **PTY Integration**
   - `pty-viewer.mjs` - xterm.js integration
   - Full-screen PTY view (replaces thread when clicked)
   - Live output streaming
   - Keyboard input support

5. **Lucene Filter**
   - Client-side query parser (use `lucene-query-parser` npm package)
   - Supports: field:value, AND, OR, NOT, wildcards
   - Filter events in real-time
   - Persist to localStorage per-channel

6. **@Mention Autocomplete**
   - Dropdown menu with template suggestions
   - Arrow key + Enter navigation
   - Show session IDs when duplicates exist
   - Format: `@alice#12`
   - Voice dictation button (Web Speech API)

7. **Settings Page**
   - Agent template list
   - YAML editor with syntax validation
   - Create/Save/Delete operations
   - Breadcrumb: "Home > Settings > Agent Templates"

## WebSocket Protocol (Server ↔ Client)

### Client → Server

```javascript
// Channels
{ type: 'channel:create', name: 'dev', description: '...' }
{ type: 'channel:delete', name: 'dev' }
{ type: 'channel:list' }

// Agents
{ type: 'agent:invite', channel: 'dev', template: 'solo', prompt: '...' }
{ type: 'agent:pause', session_id: 12 }
{ type: 'agent:resume', session_id: 12 }
{ type: 'agent:stop', session_id: 12 }

// Messages
{ type: 'message:submit', channel: 'dev', agent: 'alice#12', content: '...' }

// PTY
{ type: 'pty:attach', session_id: 'pty-1234' }
{ type: 'pty:detach', session_id: 'pty-1234' }
{ type: 'pty:input', session_id: 'pty-1234', data: 'ls\n' }

// Sessions
{ type: 'session:update', session_id: 12, yaml: '...' }

// Templates
{ type: 'template:list' }
{ type: 'template:get', name: 'solo' }
{ type: 'template:save', name: 'solo', yaml: '...' }
{ type: 'template:delete', name: 'custom' }
{ type: 'template:autocomplete', query: '@al' }

// Slash commands
{ type: 'slash:command', command: 'join', channel: '...', args: [...] }
```

### Server → Client

```javascript
// Initial state
{ type: 'init', data: { channels: [...], sessions: [...], events: [...] } }

// Events
{ type: 'event', channel: 'dev', data: { type: 'USER_REQUEST', ... } }
{ type: 'state:changed', session_id: 12, old_state: '...', new_state: '...' }

// Responses
{ type: 'channel:created', channel: {...} }
{ type: 'agent:invited', session_id: 12, channel: 'dev', agent: 'solo' }
{ type: 'template:autocomplete:response', suggestions: [...] }
{ type: 'pty:output', session_id: 'pty-1234', data: '...' }
```

## Architecture Highlights

### Single-Process Design
- One main loop orchestrates all channels and sessions
- No UDP needed (direct event emission)
- WebSocket for real-time client updates
- FSM ensures deterministic state transitions

### File Structure
```
plugins/observability/
├── serve.mjs                      # Main server (671 lines)
├── server/                        # Handler modules (40-132 lines each)
│   ├── agent-handlers.mjs
│   ├── channel-handlers.mjs
│   ├── message-handlers.mjs
│   ├── pty-handlers.mjs
│   ├── session-handlers.mjs
│   ├── slash-commands.mjs
│   └── template-handlers.mjs
└── app/                           # Frontend (TODO)
    ├── index.html
    ├── components/
    │   ├── channel-list.mjs
    │   ├── thread-view.mjs
    │   ├── agent-list.mjs
    │   ├── lucene-filter.mjs
    │   ├── message-input.mjs
    │   ├── presence-indicator.mjs
    │   └── bubbles/
    │       ├── user-bubble.mjs
    │       ├── agent-bubble.mjs
    │       ├── ask-human-widget.mjs
    │       ├── execute-shell-widget.mjs
    │       └── ...
    └── audio/
        └── notification.ogg

src/lib/
├── channel-manager.mjs            # Core channel orchestration (275 lines)
└── fsm-engine.mjs                 # Session state machine (289 lines)

agents/
├── channels/                      # Channel YAML files
│   └── <name>.yaml
├── sessions/                      # Session YAML files
│   └── <id>.yaml
└── templates/                     # Agent templates
    └── <name>.yaml
```

## Next Steps

1. Create frontend HTML structure with new layout
2. Build core web components (channel-list, thread-view, agent-list)
3. Implement event bubble widgets for each tool type
4. Add Lucene filter with client-side parser
5. Integrate xterm.js for PTY viewing
6. Add @mention autocomplete with template API
7. Create settings page for template editing
8. Add sound effects and polish UI

## Testing Strategy

1. Start server: `bun plugins/observability/serve.mjs`
2. Open browser to `http://localhost:3002`
3. Test slash commands: `/join test`, `/invite @solo "hello"`
4. Test message submission with @mentions
5. Test agent pause/resume/stop
6. Test PTY viewing and interaction
7. Test template autocomplete and editing
8. Test Lucene filtering with various queries

## Migration from v2.0

- ❌ Removed: UDP server (no longer needed)
- ❌ Removed: proc files for state tracking (now in FSM)
- ❌ Removed: Legacy observability metrics system
- ✅ Added: Channel Manager for multi-channel support
- ✅ Added: FSM Engine for deterministic state
- ✅ Added: Modular handler architecture
- ✅ Added: Slash command processing
- ✅ Added: Template management API
