# Task Management Plugin PRD

## Overview
This plugin extends the daemon project by providing a lightweight ticket-management system (minimalist Jira-like) for tracking tasks and issues. It uses a SQLite flat-file database via the `bun:sqlite` module and is implemented as a new plugin at `plugins/task-mgmt/index.mjs`, modeled after the vectordb plugin example. The system enables AI agents to collaborate on projects via tickets and optionally exposes an HTTP service for visual views.

## Key Features
- CRUD operations for tickets (create, read, update, delete).
- Ticket assignment to users/agents/teams.
- Status tracking (e.g., Open, In Progress, Review, Done).
- Priority levels and due dates.
- Comment threads on tickets.
- Auditable change history/revision log for ticket fields.
- Search and basic reporting.
- Integration with daemon's agent ecosystem.
- Optional HTTP service:
  - Kanban board view.
  - Jira-style plan/roadmap view.
  - Detailed ticket views with comments and history.

## Requirements
### Functional
- **Database Schema** (Minimalist Jira):

  The database uses three main tables to support ticket management, comments, and audit history. All changes (ticket updates, comments) automatically log to the history table with `changed_by` as a plaintext name string (honor system: agents provide non-empty name, trusted for audit). Schema initialization creates tables with indexes.

  **Tickets Table CREATE:**
  ```sql
  CREATE TABLE tickets (
    id INTEGER PRIMARY KEY AUTOINCREMENT, -- Unique ticket ID
    title TEXT NOT NULL, -- Ticket title (max 255 chars recommended)
    description TEXT, -- Detailed description (markdown supported)
    assignee TEXT, -- Assigned agent/user (plaintext name or ID)
    status TEXT NOT NULL DEFAULT 'Open' CHECK (status IN ('Open', 'In Progress', 'Review', 'Done')), -- Workflow status
    urgency INTEGER NOT NULL DEFAULT 3 CHECK (urgency BETWEEN 1 AND 5), -- Eisenhower: 1=very urgent, 5=not urgent
    importance INTEGER NOT NULL DEFAULT 3 CHECK (importance BETWEEN 1 AND 5), -- Eisenhower: 1=very important, 5=not important
    due_date TEXT, -- ISO 8601 date string (optional)
    labels TEXT, -- JSON array of strings for tags/categories (auto-lowercased on insert/update)
    created_at TEXT NOT NULL DEFAULT (datetime('now')), -- Creation timestamp
    updated_at TEXT NOT NULL DEFAULT (datetime('now')) -- Last update timestamp (updated on changes)
  );
  CREATE INDEX idx_tickets_status ON tickets(status);
  CREATE INDEX idx_tickets_assignee ON tickets(assignee);
  CREATE INDEX idx_tickets_urgency ON tickets(urgency, importance);
  ```

  **Comments Table CREATE:**
  ```sql
  CREATE TABLE comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT, -- Unique comment ID
    ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE, -- Linked ticket
    author TEXT NOT NULL, -- Plaintext name of commenter (honor system, non-empty)
    content TEXT NOT NULL, -- Comment body (markdown supported)
    timestamp TEXT NOT NULL DEFAULT (datetime('now')) -- Comment timestamp
  );
  CREATE INDEX idx_comments_ticket ON comments(ticket_id);
  ```

  **History Table CREATE (Audit Log):**
  ```sql
  CREATE TABLE history (
    id INTEGER PRIMARY KEY AUTOINCREMENT, -- Unique log entry ID
    ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE, -- Affected ticket
    field_changed TEXT NOT NULL, -- Changed field (e.g., 'status', 'assignee', 'urgency')
    old_value TEXT, -- Previous value (for simple fields) or diff for complex (e.g., labels array diff)
    new_value TEXT, -- New value (for simple fields) or diff for complex
    changed_by TEXT NOT NULL, -- Plaintext name of changer (honor system, non-empty)
    timestamp TEXT NOT NULL DEFAULT (datetime('now')) -- Change timestamp
  );
  CREATE INDEX idx_history_ticket ON history(ticket_id);
  CREATE INDEX idx_history_timestamp ON history(timestamp);
  ```
  
- **Agent-Exposed Tools:**

  The plugin will register the following functions as tools in the daemon's tool system, allowing agents to interact with tickets programmatically. All mutating operations (create, update, delete, addComment) automatically audit changes in the history table atomically—no separate log tool needed; `changedBy`/`author` are plaintext names (honor system, required non-empty). Functions return {success: boolean, id?: number, message?: string} where message provides error details (e.g., for invalid input like urgency outside 1-5).

  | Function | Description | Parameters | Returns |
  |----------|-------------|------------|---------|
  | `createTicket` | Creates a new ticket (auto-logs creation in history) | `{title: string, description?: string, assignee?: string, urgency?: number (1-5), importance?: number (1-5), dueDate?: string, labels?: string[], changedBy: string (plaintext name)}` | `{success: boolean, id?: number}` |
  | `getTicket` | Retrieves a ticket by ID | `{id: number}` | `{id: number, title: string, description: string, assignee: string, status: string, urgency: number, importance: number, due_date: string, labels: string[], created_at: string, updated_at: string} or null` |
  | `updateTicket` | Updates a ticket's fields (auto-logs changes in history atomically) | `{id: number, updates: {title?: string, description?: string, assignee?: string, status?: string, urgency?: number, importance?: number, dueDate?: string, labels?: string[]}, changedBy: string (plaintext name)}` | `{success: boolean}` |
  | `deleteTicket` | Deletes a ticket by ID (auto-logs deletion) | `{id: number, changedBy: string (plaintext name)}` | `boolean` (success) |
  | `addComment` | Adds a comment to a ticket (auto-logs in history) | `{ticketId: number, content: string, author: string (plaintext name)}` | `{success: boolean, id?: number}` |
  | `getComments` | Retrieves all comments for a ticket | `{ticketId: number, limit?: number, offset?: number}` | `array of {id: number, content: string, author: string, timestamp: string}` |
  | `listTickets` | Lists tickets with exact-match filters (defaults to all if no filters); supports sorting by fields | `{status?: string, assignee?: string, urgency?: number, importance?: number, labels?: string[], sort?: string (e.g., 'updated_at desc', 'urgency asc,importance desc'), limit?: number, offset?: number}` | `array of ticket summaries (sorted as requested): {id: number, title: string, status: string, assignee: string, urgency: number, importance: number, updated_at: string}` |
  | `getTicketHistory` | Retrieves change history for a ticket | `{ticketId: number, limit?: number}` | `array of {field_changed: string, old_value: string, new_value: string, changed_by: string, timestamp: string}` 
- Optional HTTP service, manually launched via `bun serve.mjs`:
  - Endpoints: Root (/) serves SPA index.html (client-side routing to /kanban, /plan, /ticket/:id); /api/tickets, /api/comments etc. for JSON data.
  - SPA renders Kanban (drag-drop), Plan (Gantt/timeline), and ticket details (comments/history) using client-side JS.
  - Fully controlled by human operator; runs on localhost:3001 (configurable) until Ctrl+C; no auto-toggle, but config for port/db path.

### Non-Functional
- Lightweight and performant, leveraging Bun for JS execution.
- Data persistence in SQLite file (e.g., data/taskmgmt.db in plugin dir).
- Secure: Basic auth or integration with daemon's auth if multi-user.
- Easy plugin installation: Follow daemon's plugin loading mechanism (as in vectordb example).
- Cross-platform compatibility.

## Architecture
- **Implementation**: JavaScript (ES modules) using Bun runtime. Main entry: plugins/task-mgmt/index.mjs.
- **Database**: bun:sqlite for all operations. Init DB and schema on plugin load.
- **Agent Interface**: Export functions that agents can call via daemon's tool system.
- **HTTP Service**: Optional module (http.mjs) for serving the SPA and JSON API endpoints. Not auto-started; instead, launched manually via dedicated CLI script `serve.mjs` (e.g., `bun plugins/task-mgmt/serve.mjs`), which initializes the server on the configured port (default 3001) and runs persistently until interrupted (Ctrl+C). Supports Bun's built-in server or lightweight Hono framework.
- **Integration**: Export an object like the vectordb plugin format for tool registration in index.mjs, hooking into the daemon's plugin system for exposure.
- **Dependencies**: bun:sqlite (peer or bundled).

## File Structure

The plugin will follow the daemon's plugin conventions, with the following directory hierarchy under `plugins/task-mgmt/`:

- `index.mjs`: Main plugin entry point. Exports tool functions, initializes DB and HTTP server (if enabled), and registers with daemon's plugin system.
- `db.mjs`: Database module. Handles all SQLite operations (init schema, CRUD, queries). Exports DB instance or functions.
- `tools.mjs`: Defines the agent tool functions (createTicket, etc.), wrapping DB operations and logging changes.
- `http.mjs`: Core HTTP module defining routes (SPA serving and /api endpoints) using Bun's server or Hono. Handles static file serving from `public/`.
- `serve.mjs`: Standalone CLI entry point to launch the HTTP service persistently (imports http.mjs, sets up server, handles SIGINT for graceful shutdown).
- `public/`: Directory for static web assets (exposed via HTTP).
  - `kanban.html`: Kanban board with drag-drop JS.
  - `plan.html`: Roadmap/Gantt view.
  - `ticket.html`: Detailed ticket view template.
  - `style.css` and `script.js`: Shared styles and utilities.
- `schema.sql`: SQL script for initial DB schema creation (loaded by db.mjs).
- `data/`: Directory for persistent data files (not publicly exposed).
  - `taskmgmt.db`: SQLite database file (generated on first run, relative to plugin dir).

This structure keeps concerns separated: DB logic, tools, web serving, and static assets.

## Web Interface (Browser SPA)

The optional HTTP service will serve a single-page application (SPA) built with vanilla HTML5, CSS, and JavaScript, leveraging Tailwind CSS for styling and Alpine.js for lightweight interactivity. No heavy frameworks like React/Vue will be used to keep it lightweight and dependency-free (beyond CDN links). The SPA will fetch data via AJAX from the server endpoints and provide an intuitive, responsive interface for managing tickets.

### Technology Stack
- **HTML5**: Semantic structure for views (kanban, plan, ticket detail).
- **CSS**: Tailwind CSS (via CDN) for utility-first styling, ensuring rapid development and consistency.
- **JavaScript**: Vanilla JS for DOM manipulation and API calls (fetch API). Alpine.js (via CDN) for reactive components like drag-and-drop, modals, and real-time updates.
- **Theme**: Beautiful dark theme by default, with light mode toggle. Use Tailwind's dark mode classes (e.g., `dark:bg-gray-900`) and custom CSS variables for accents (e.g., primary blue/purple for buttons, green for done status).

### Key Components and Views
- **Kanban Board (/kanban)**: 
  - Columns for statuses (Open, In Progress, Review, Done) as sortable lists.
  - Each ticket card shows title, assignee, Eisenhower priority (computed quadrant: 1 "Do First" (red), 2 "Schedule" (orange), 3 "Delegate" (yellow), 4 "Eliminate" (gray); sortable by numeric value), due date, and labels. Urgency and importance shown separately only in detail view.
  - Real-time updates: Poll or WebSocket (if extended) for changes from agents.
  - Search/filter bar for quick querying (local; inside browser client, not a server api search feature; because there won't be that many tickets in these databases)

- **Roadmap/Plan View (/plan)**:
  - Timeline or Gantt-like chart showing tickets by due date/Eisenhower priority (sortable computed field as in Kanban).
  - Group by assignee or labels; sortable table alternative for simplicity (support sorting by urgency/importance independently in detail views only).
  - Visual indicators for overdue items (red highlights in dark theme).

- **Ticket Detail (/ticket/:id)**:
  - Full ticket info: title, description (markdown rendered), status, assignee, urgency, importance (separate fields, sortable), history log.
  - Comment section (markdown support).
  - Related tickets/labels sidebar.

### Implementation Notes
- **API Integration**: Frontend fetches from server endpoints like /api/tickets, /api/ticket/:id/comments (JSON responses). Server (http.mjs) proxies to DB tools.
- **Markdown Rendering**: Use marked.js library for rendering markdown in descriptions and comments. Install via package manager (npm) or one-time curl to cache a local snapshot on disk, avoiding CDN reliance.
- **Static Serving**: All assets in public/ served statically; index.html as SPA entry with route handling via JS (hash-based or simple if).
- **Dark Theme Details**:
  - Background: Dark gray (#1a1a1a) with subtle gradients.
  - Text: Light gray/white for readability.
  - Cards: Semi-transparent dark overlays with shadows.
  - Accents: Cyan/blue for interactive elements, green/orange for status (extend to Eisenhower quadrants: red for 1, orange for 2, yellow for 3, gray for 4).
  - Responsive: Mobile-friendly with Tailwind's mobile-first classes.
- **Dependencies**: CDN links only for Tailwind and Alpine—no build step. Tailwind: <script src="https://cdn.tailwindcss.com"></script>, Alpine: <script defer src="https://cdn.jsdelivr.net/npm/alpinejs@3.x.x/dist/cdn.min.js"></script>. Marked.js local.
- **Security**: there is no auth, authorization, or encryption. this is a high trust application that only runs locally and listens on localhost:3001. additionally the app is read-only and immutable from the browser view. its just for the human to follow along. if any change is needed, it will be directed from human to agent, and performed by the agents who can mutate the ticket state via their agentic tools.

This SPA provides a modern, beautiful interface without bloat, perfect for quick task oversight alongside agent automation.

## Recommended order of approach
- Review and understand daemon project structure (once README and src/daemon.mjs are accessible).
- Prototype the SQLite schema and core functions.
- Implement agent-exposed APIs.
- Develop HTTP views (start with basic HTML).
- Test integration with daemon `d tool`