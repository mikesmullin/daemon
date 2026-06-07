# Creating Plugins for Daemon V3

This document defines the plugin interface contract for daemon-v3. Follow these conventions to ensure your plugin integrates seamlessly with the daemon's tool system, CLI, and agent infrastructure.

## Plugin Architecture Overview

Plugins follow an **MVC pattern** (Model-View-Controller) for separation of concerns:

```
plugins/
├── your-plugin/
│   ├── index.mjs              # Entry point: instantiates plugin, registers with globals
│   ├── package.json           # Dependencies (optional)
│   │
│   ├── controllers/           # Business logic and request handling
│   │   ├── main.mjs           # Primary controller (command handlers)
│   │   └── tools-definition.mjs  # Tool definitions array
│   │
│   ├── models/                # Data models and external integrations
│   │   ├── session.mjs        # Domain model (CRUD, validation)
│   │   └── providers/         # External service wrappers
│   │       └── some-api.mjs   # API client (e.g., AI provider)
│   │
│   └── views/                 # Output formatters (optional)
│       ├── json.mjs           # JSON output
│       ├── yaml.mjs           # YAML output
│       └── html.mjs           # HTML output (for web dashboards)
```

### MVC Responsibilities

| Layer | Purpose | Examples |
|-------|---------|----------|
| **Controllers** | Handle commands, orchestrate logic, call models | `agent.mjs`, `session-tools.mjs` |
| **Models** | Data structures, DB ops, provider wrappers | `session.mjs`, `template.mjs`, `providers/xai.mjs` |
| **Views** | Format output for different consumers | `json()`, `yaml()`, `html()` renderers |

### Simple vs Complex Plugins

For **simple plugins** (few tools, no external APIs), a flat structure is fine:

```
plugins/
├── simple-plugin/
│   ├── index.mjs          # All-in-one: class, tools, handlers
│   └── tools.mjs          # Tool definitions (optional split)
```

For **complex plugins** (many tools, external providers, multiple models), use full MVC:

```
plugins/
├── agent/                 # Example: full MVC structure
│   ├── controllers/
│   │   ├── agent.mjs      # Main plugin class
│   │   ├── session-tools.mjs
│   │   ├── group-tools.mjs
│   │   └── tools-definition.mjs
│   ├── models/
│   │   ├── session.mjs
│   │   ├── template.mjs
│   │   ├── group.mjs
│   │   └── providers/
│   │       ├── xai.mjs
│   │       ├── ollama.mjs
│   │       └── gemini.mjs
│   └── views/             # (optional)
```

## Minimal Plugin Example

```javascript
// plugins/example/index.mjs
import { globals } from '../../common/globals.mjs';
import { Utils } from '../../common/utils.mjs';

export class ExamplePlugin {
  constructor() {
    // 1. Register plugin in registry
    globals.pluginsRegistry.set('example', this);
    
    // 2. Register tool handlers
    this.registerTools();
  }

  registerTools() {
    // Map tool names to handler methods
    globals.dslRegistry.set('example__greet', this.greet.bind(this));
  }

  // Tool definitions (OpenAI function-calling format + metadata)
  get definition() {
    return [
      {
        type: "function",
        function: {
          name: "example__greet",
          description: "Greet someone by name",
          parameters: {
            type: "object",
            properties: {
              name: { type: "string", description: "Name to greet" }
            },
            required: ["name"]
          }
        },
        metadata: {
          help: "example greet <name>"
        }
      }
    ];
  }

  // Handler receives parsed args (array from CLI, object from agent)
  async greet(args) {
    const name = Array.isArray(args) ? args[0] : args.name;
    Utils.logInfo(`Hello, ${name}!`);
    return `Greeted ${name}`;
  }
}

// Auto-instantiate on import
export const examplePlugin = new ExamplePlugin();
```

---

## Core Registries

Plugins interact with these global registries defined in `common/globals.mjs`:

| Registry | Type | Purpose |
|----------|------|---------|
| `pluginsRegistry` | `Map<name, instance>` | Plugin instances by name |
| `dslRegistry` | `Map<toolName, handler>` | Tool name → handler function |
| `widgetRegistry` | `Map<widgetName, config>` | Dashboard widgets |
| `subcommandRegistry` | `Map<path, config>` | CLI subcommands |
| `humanOnlyTools` | `Set<toolName>` | Tools excluded from agent use |

---

## Tool Definition Format

Each tool follows the OpenAI function-calling schema with an extended `metadata` block:

```javascript
{
  type: "function",
  function: {
    name: "plugin__action__subaction",    // Double-underscore naming
    description: "What this tool does", // Shown in `d tools`
    parameters: {
      type: "object",
      properties: {
        param1: { type: "string", description: "..." },
        param2: { type: "number", description: "..." }
      },
      required: ["param1"]
    }
  },
  metadata: {
    // Human-readable invocation pattern (REQUIRED)
    // Use space notation: "plugin action subaction <param1> [param2]"
    help: "plugin action subaction <param1> [param2]",
    
    // Optional: Custom alias matcher function
    alias: (args) => { /* see Aliases section */ },
    
    // Optional: Mark tool as human-only (excluded from agent toolbox)
    humanOnly: true,
    
    // Optional: Tool must execute on host (not in container)
    requiresHostExecution: true
  }
}
```

### Naming Convention

Tool names use **double underscore notation** for hierarchy:
- `plugin__action` — Simple tool
- `plugin__resource__action` — Resource-scoped tool
- `plugin__resource__subresource__action` — Nested resource

Examples:
- `fs__file__view`, `fs__directory__list`
- `agent__session__new`, `agent__session__chat`
- `youtube__channel__playlists__list`

### Help Text Convention

The `metadata.help` field uses **space notation** with parameter placeholders:

| Syntax | Meaning |
|--------|---------|
| `<param>` | Required parameter |
| `[param]` | Optional parameter |
| `<param...>` | Variadic (rest) parameter |

Examples:
```javascript
help: "fs file view <filePath>"
help: "agent session chat <id> <msg>"
help: "ticket create <title> <description> [priority]"
help: "shell execute <command...>"
```

---

## Handler Function Signature

Tool handlers receive arguments in two formats depending on the caller:

```javascript
async myHandler(args, options = {}) {
  // From CLI: args is an array of strings
  // From Agent: args is an object with named properties
  
  let param1, param2;
  
  if (Array.isArray(args)) {
    // CLI invocation: d tool plugin.action foo bar
    [param1, param2] = args;
  } else {
    // Agent invocation: { param1: "foo", param2: "bar" }
    ({ param1, param2 } = args);
  }
  
  // options.signal - AbortSignal for cancellation
  if (options.signal?.aborted) {
    throw new Error('Aborted');
  }
  
  // Use Utils for output (not console.log)
  Utils.logInfo(`Result: ${param1}`);
  
  // Return value sent back to agent (or displayed in CLI)
  return { success: true, data: result };
}
```

### Output Guidelines

- Use `Utils.logInfo()` for normal output
- Use `Utils.logWarn()` for warnings  
- Use `Utils.logError()` for errors
- Use `Utils.logDebug()` for debug info (hidden unless debug mode)
- Return structured data for agent consumption

---

## Aliases

Aliases provide shorthand CLI invocations that map to full tool calls.

### Defining an Alias

Add an `alias` function to `metadata` that receives the full argument array and returns either:
- `{ name: 'full__tool__name', args: { ...parsedArgs } }` — Match found
- `false` — No match

```javascript
metadata: {
  help: "agent @<template> [prompt]",
  alias: (args) => {
    // args = ["agent", "@ada", "hello", "world"]
    if (args.length < 2) return false;
    if (args[0] !== 'agent') return false;
    if (!args[1].startsWith('@')) return false;
    
    const template = args[1].substring(1);  // Remove @
    const prompt = args.slice(2).join(' ') || undefined;
    
    return { 
      name: 'agent__session__new', 
      args: { template, prompt } 
    };
  }
}
```

### Alias Examples

| Input | Alias Maps To | Args |
|-------|---------------|------|
| `sessions` | `agent__sessions__list` | `{}` |
| `agent @ada hello` | `agent__session__new` | `{ template: "ada", prompt: "hello" }` |
| `/dashboard` | `human__dashboard` | `{}` |

---

## Widgets

Widgets render visual components on the dashboard (`/dashboard` or `d dash`).

### Registering a Widget

```javascript
registerWidgets() {
  globals.widgetRegistry.set('myplugin__status', {
    plugin: 'myplugin',
    render: async () => {
      // Return ASCII/Unicode box-drawing string
      return `┌─ Status ─────────┐
│ Items: 42        │
│ Active: 7        │
└──────────────────┘`;
    }
  });
}
```

### Dashboard Configuration

Users configure which widgets appear in `config.yml`:

```yaml
dashboard:
  widgets:
    - agent__sessions
    - myplugin__status
    - ticket__summary
```

---

## Human-Only Tools

Some tools are only meaningful for human CLI use (not agents). Mark them:

```javascript
registerTools() {
  globals.dslRegistry.set('human__dashboard', this.renderDashboard.bind(this));
  globals.humanOnlyTools.add('human__dashboard');
}

// Or via metadata:
metadata: {
  humanOnly: true,
  help: "/dashboard"
}
```

Human-only tools:
- Are excluded from the agent's tool list
- Can still be invoked via CLI
- Typically render UI or require interactive input

---

## Host Execution

Some tools must run on the host machine (not inside agent containers):

```javascript
metadata: {
  requiresHostExecution: true,
  help: "human file open <path>"
}
```

Use cases:
- Opening files in host editor
- Playing audio through speakers
- Accessing host network resources
- Launching browsers

---

## Event Bus

Plugins can subscribe to daemon lifecycle events:

```javascript
constructor() {
  globals.eventBus.on('started', this.onStart.bind(this));
  globals.eventBus.on('stopped', this.onShutdown.bind(this));
  globals.eventBus.on('tick', this.onTick.bind(this));
  globals.eventBus.on('commandProcessed', this.onCommand.bind(this));
}

onShutdown() {
  // Cleanup resources
}

onTick() {
  // Called every tick interval (default 1s)
}
```

---

## Plugin Loading

Plugins are loaded via `scripts/install-plugins.mjs`. Add your plugin:

```javascript
// scripts/install-plugins.mjs
await import('../plugins/your-plugin/index.mjs');
```

Or dynamically in the daemon startup sequence.

---

## CLI Resolution

The daemon resolves CLI commands using this priority:

1. **Exact match** in `dslRegistry` (`d tool fs__file__view`)
2. **Space-to-double-underscore resolution** (`d fs file view` → `fs__file__view`)
3. **Alias matching** (scans `metadata.alias` functions)
4. **Built-in commands** (`pause`, `continue`, `exit`, etc.)

---

## Complete Plugin Checklist

- [ ] Create `plugins/yourplugin/index.mjs`
- [ ] Export a class that registers itself in `pluginsRegistry`
- [ ] Define `get definition()` returning tool array
- [ ] Register handlers in `dslRegistry`
- [ ] Add `metadata.help` with space notation to all tools
- [ ] Handle both array and object args in handlers
- [ ] Use `Utils.log*()` for output
- [ ] Add to `scripts/install-plugins.mjs`
- [ ] (Optional) Register widgets in `widgetRegistry`
- [ ] (Optional) Add aliases for common invocations
- [ ] (Optional) Mark human-only tools in `humanOnlyTools`
- [ ] (Optional) Subscribe to event bus for lifecycle hooks

---

## Reference: Existing Plugins

| Plugin | Description | Key Tools |
|--------|-------------|-----------|
| `agent` | Session/container management | `agent__session__*`, `agent__group__*` |
| `human` | Human interaction | `human__ask`, `human__dashboard` |
| `fs` | File system operations | `fs__file__*`, `fs__directory__*` |
| `shell` | Command execution | `shell__execute`, `shell__pty__*` |
| `ticket` | Task tracking | `ticket__create`, `ticket__update` |
| `vectordb` | Vector memory | `vectordb__recall`, `vectordb__memorize` |
| `youtube` | YouTube API | `youtube__video.*`, `youtube__channel__*` |
| `gemini` | Image generation | `gemini__image__generate` |
| `voice` | Text-to-speech | `human__speak_to` |
| `web` | Web fetching | `web__fetch` |
