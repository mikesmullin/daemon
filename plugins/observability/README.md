# Observability Plugin

Real-time monitoring dashboard for multi-agent AI orchestration.

## Overview

The Observability Plugin provides a live web-based dashboard for monitoring AI agent activity, tool usage, and system metrics. It enables human-in-the-loop oversight for autonomous agent teams working in parallel.

## Features

- **Live Event Stream**: Chronological timeline of all agent events (responses, tool calls, hooks)
- **Agent Status Cards**: Real-time monitoring of individual agents with token usage, costs, and activity metrics
- **Orchestrator Panel**: System-level actions and lifecycle events
- **Connection Status**: Visual indicators for real-time data flow
- **Search & Filtering**: Full-text search and filtering by agent, event type, or time range
- **Auto-Follow Mode**: Automatic scrolling to newest events
- **Dark Theme UI**: Mission-control style interface optimized for monitoring

## Architecture

### Components

1. **UDP Server** (`serve.mjs`): Listens for event datagrams from daemon processes
2. **WebSocket Relay**: Broadcasts events to connected browser clients in real-time
3. **Web Dashboard** (`public/index.html`): Three-column layout with Web Components
4. **Event Emitters**: Instrumented throughout daemon codebase to emit events via UDP

### Data Flow

```
Daemon Process (--observe 3002)
    ↓ (UDP datagrams)
Observability Server (port 3002)
    ↓ (WebSocket)
Browser Dashboard
```

## Usage

### Starting the Dashboard

```bash
# Start observability server on default port 3002
d observe

# Start on custom port
d observe 3003
```

Then open `http://localhost:3002` in your browser.

### Running Daemons with Observability

Add the `--observe` flag to any daemon command:

```bash
# Watch mode with observability
d watch --observe

# Watch specific session with observability
d watch --session 5 --observe

# Agent mode with observability  
d agent @solo "analyze codebase" --observe

# Custom port (for separate teams)
d watch --observe 3003
```

### Event Types

The dashboard displays the following event types:

- **USER_REQUEST** 👤: User prompts submitted to agents
- **RESPONSE** 💬: Agent responses and messages
- **TOOL_CALL** 🔧: Tool invocations with parameters
- **TOOL_RESPONSE** ✓: Tool execution results
- **THINKING** 💭: Internal reasoning (if supported by provider)
- **HOOKS** ⚓: Lifecycle events (USERPROMPTSUBMIT, STOP, SESSIONSTART, SESSIONEND, etc.)

### Metrics

The dashboard tracks:

- **Per-Agent**: Token usage, cost, model, status, active tasks, messages, errors
- **Global**: Active agents, running tasks, total log entries, cumulative cost

Metrics are emitted every 60 seconds via UDP and displayed in real-time.

## Configuration

### Port Selection

- **Default**: 3002
- **Custom**: Pass port number to `d observe <port>` or `--observe <port>`
- **Multiple Teams**: Use different ports to monitor separate agent teams independently

### Connection Status

- **Connected** (green): UDP packets received within last 30 seconds
- **Connecting** (yellow): Initializing or no traffic yet
- **Disconnected** (red): No UDP activity for >30 seconds

## Web Components

The dashboard is built with modular Web Components:

- `<status-bar>`: Global status and counters
- `<agent-card>`: Individual agent monitoring
- `<event-stream>`: Main event timeline
- `<event-item>`: Individual event rendering
- `<orchestrator-panel>`: System actions sidebar
- `<search-bar>`: Search and filtering
- `<auto-follow-toggle>`: Auto-scroll control

These components can be reused in other dashboards or tools.

## Technical Details

### UDP Protocol

Events are emitted as JSON datagrams over UDP to `localhost:<port>`:

```json
{
  "type": "RESPONSE",
  "timestamp": "2025-11-09T21:30:00Z",
  "daemon_pid": 12345,
  "session_id": "5",
  "agent": "fast-backend-qa-agent",
  "content": "Analysis complete...",
  "model": "HAIKU-4.5",
  "cost": 0.001,
  "context_tokens": 250
}
```

### Event Loss

UDP is intentionally lossy for performance. The system prioritizes:
- **Speed**: No connection overhead
- **Scalability**: Multiple daemons can emit independently
- **Resilience**: Emission failures don't crash agents

Events may be lost on:
- Network congestion (unlikely on localhost)
- Dashboard restarts (no persistence)
- Server buffer overflow (high event volume)

This is acceptable for real-time monitoring where recent activity matters most.

### No Persistence

Events are stored in-memory only. Restarting the observability server clears all history. This design choice:
- Reduces complexity (no database)
- Prevents unbounded growth
- Focuses on live monitoring vs. historical analysis

For long-term logging, use traditional log aggregation tools.

## Browser Compatibility

- **Tested**: Chrome, Firefox, Edge, Safari
- **Requirements**: ES6+ modules, WebSocket, Shadow DOM
- **Responsive**: Optimized for desktop/tablet (≥1280px width)

## Keyboard Shortcuts

- `Cmd+K` / `Ctrl+K`: Open prompt modal (placeholder for future orchestration feature)

## Troubleshooting

### No Events Appearing

1. Ensure daemon is running with `--observe` flag
2. Check port matches between daemon and dashboard
3. Verify connection status indicator (should be green)
4. Check browser console for WebSocket errors

### Dashboard Shows "Disconnected"

- No UDP packets received for >30 seconds
- Daemon may have stopped or not using `--observe`
- Port mismatch between daemon and server

### Events Delayed

- Network issues (rare on localhost)
- High CPU load on daemon or server
- Browser tab throttled (inactive/backgrounded)

## Future Enhancements

- Persistent event storage (optional SQLite backend)
- Time-series charts for metrics
- Agent interaction controls (pause, resume, inject prompts)
- Export logs to JSON/CSV
- Multi-dashboard aggregation (federated monitoring)
- Mobile-responsive layout


