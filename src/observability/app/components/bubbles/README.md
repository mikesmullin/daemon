# Event Bubble Components

Base bubble components for rendering different event types in the thread view.

## Components

### BaseBubble (`base-bubble.mjs`)

Base class that provides shared functionality for all bubble types:

- **Header**: Status indicator, avatar, label
- **Content**: Event-specific content
- **Timestamp**: Formatted timestamp (HH:MM:SS.mmm) shown on hover
- **Actions**: Filter (-) and edit (✎) buttons shown on hover
- **Alignment**: Left or right alignment
- **Styling**: Shared styles with support for status indicators

**Features:**
- Status indicators (working, success, fail, online)
- Pulsing animation for "working" status
- Hover effects for timestamp and action buttons
- Custom event dispatching for filter and edit actions
- HTML escaping for security

### UserBubble (`user-bubble.mjs`)

Right-aligned bubble for user messages with blue gradient background.

**Features:**
- Blue gradient background
- Person icon (👤) avatar
- Right alignment
- Filter button on user label
- Session-based filtering

**Usage:**
```javascript
import './components/bubbles/user-bubble.mjs';

const bubble = document.createElement('user-bubble');
bubble.event = {
  user: "John",
  content: "Can you help me?",
  timestamp: "2024-11-16T10:30:45.123Z",
  session_id: "12"
};
document.body.appendChild(bubble);
```

### AgentBubble (`agent-bubble.mjs`)

Left-aligned bubble for agent responses with dark background.

**Features:**
- Dark background with border
- Circle avatar with first letter of agent name
- Left alignment
- Agent name and session ID display
- Markdown support (basic):
  - Code blocks (```)
  - Inline code (`)
  - Bold (**)
  - Italic (*)
  - Line breaks
- Filter button on session ID

**Usage:**
```javascript
import './components/bubbles/agent-bubble.mjs';

const bubble = document.createElement('agent-bubble');
bubble.event = {
  agent: "alice",
  session_id: "12",
  content: "Here's the analysis...",
  timestamp: "2024-11-16T10:30:47.456Z",
  status: "success"
};
document.body.appendChild(bubble);
```

## Event Structure

All bubbles expect an `event` object with the following structure:

```javascript
{
  // Common fields
  timestamp: "ISO 8601 timestamp",
  session_id: "session identifier",
  
  // User messages
  user: "username",
  content: "message content",
  
  // Agent messages
  agent: "agent name",
  response: "response content",
  format: "markdown", // optional
  status: "working|success|fail|online",
  
  // Status
  success: true|false // alternative to status field
}
```

## Events

Components dispatch custom events for interaction:

### `add-filter`
Dispatched when user clicks a filter button (−).

```javascript
document.addEventListener('add-filter', (e) => {
  const { field, value } = e.detail;
  // Add "NOT field:value" to Lucene filter
});
```

### `edit-event`
Dispatched when user clicks the edit button (✎).

```javascript
document.addEventListener('edit-event', (e) => {
  const { event } = e.detail;
  // Open YAML editor with event data
});
```

## Styling

All components use Shadow DOM for style encapsulation. Key style features:

- **Colors:**
  - User bubbles: Blue gradient (#1e50b4 → #3278dc)
  - Agent bubbles: Dark gray (#282828)
  - Status working: Yellow (#f59e0b)
  - Status success: Green (#10b981)
  - Status fail: Red (#ef4444)

- **Layout:**
  - Max width: 80% of container
  - Border radius: 8px
  - Padding: 12px 16px
  - Margin bottom: 12px

- **Animations:**
  - Status pulse: 1.5s ease-in-out infinite
  - Hover transitions: 0.2s ease
  - Opacity transitions for timestamp/actions

## Testing

Open `test-bubbles.html` in a browser to see the components in action:

```bash
cd plugins/observability/app
# Open test-bubbles.html in browser
# Or serve with a local server:
python3 -m http.server 8000
# Then visit: http://localhost:8000/test-bubbles.html
```

## Next Steps

Task 3.3 will add specialized tool call bubble widgets:
- `tool-call-base.mjs` - Base for all tool calls
- `ask-human-widget.mjs`
- `execute-shell-widget.mjs`
- `create-agent-widget.mjs`
- `view-file-widget.mjs`
- `edit-file-widget.mjs`
- `apply-patch-widget.mjs`
- And more...

## Design Notes

From PRD_3.md wireframes:
- User bubbles are right-aligned with highlight color
- Agent bubbles are left-aligned with neutral color
- All bubbles show timestamp on hover
- Action buttons (filter, edit) appear on hover
- Filter buttons use "−" symbol (magnifier with minus)
- Edit buttons use "✎" symbol (pencil)
