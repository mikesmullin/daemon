# Lucene Filter Implementation

## Overview

The Lucene Filter component provides a powerful, client-side event filtering system using Lucene-like query syntax. This implementation is designed for the Daemon v3.0 observability plugin and allows users to filter events in real-time using familiar query patterns.

## Features

✅ **Lucene-like Syntax Support**
- Field-specific queries: `field:value`
- Boolean operators: `AND`, `OR`, `NOT`
- Parentheses for grouping: `(query1 OR query2) AND query3`
- Wildcards: `*` (multiple chars), `?` (single char)
- Quoted strings: `field:"value with spaces"`

✅ **Per-Channel Persistence**
- Filter state is saved to localStorage per channel
- Each channel maintains its own independent filter
- Filter persists across page reloads

✅ **Real-Time Filtering**
- Client-side filtering with 300ms debounce
- No server round-trips required
- Instant visual feedback

✅ **Error Handling**
- Invalid syntax detection
- Visual error indicators
- Helpful error messages

✅ **Exclude Buttons**
- "−" buttons on event bubbles append exclusion filters
- Quick way to filter out unwanted events
- Supports excluding: session, agent, tool, type, and custom fields

## Supported Fields

The filter supports querying the following event fields:

| Field | Aliases | Description | Example |
|-------|---------|-------------|---------|
| `session` | `session_id` | Session identifier | `session:12` |
| `agent` | `agent_name` | Agent name | `agent:alice` |
| `tool` | `tool_name` | Tool function name | `tool:execute_shell` |
| `type` | `event_type` | Event type | `type:TOOL_CALL` |
| `content` | `message` | Event content/message | `content:error` |
| `status` | - | Event status | `status:success` |
| `pty` | `ptty`, `pty_session` | PTY session ID | `pty:pty-1234` |

You can also use `*` to search across all fields:

```
test              # Search all fields for "test"
*:error          # Same as above (explicit wildcard field)
```

## Query Syntax

### Basic Queries

```lucene
session:12                  # Events from session 12
agent:alice                 # Events from agent alice
tool:execute_shell          # Tool calls to execute_shell
type:TOOL_CALL             # All tool call events
```

### Boolean Operators

```lucene
session:12 AND agent:alice           # Both conditions must match
agent:alice OR agent:bob             # Either condition matches
NOT agent:charlie                    # Exclude events from charlie
session:12 AND NOT tool:view_file    # Session 12, but not view_file calls
```

### Grouping with Parentheses

```lucene
(agent:alice OR agent:bob) AND type:TOOL_CALL
session:12 AND (tool:ask_human OR tool:execute_shell)
NOT (agent:charlie OR session:23)
```

### Wildcards

```lucene
agent:*                    # Any agent (all events with agent field)
tool:execute*             # Tools starting with "execute"
session:1?                # Sessions 10-19
type:TOOL_*               # TOOL_CALL, TOOL_RESPONSE, etc.
```

### Quoted Strings

```lucene
content:"error occurred"           # Exact phrase match
agent:"alice smith"                # Agent name with spaces
```

## Usage in Code

### In Web Components

The filter component emits events that the main app handles:

```javascript
// In lucene-filter.mjs
this.dispatchEvent(new CustomEvent('filter-change', { 
  detail: { filter: 'session:12' } 
}));

// In app.js
updateFilter(filter) {
  if (this.currentChannel) {
    this.luceneFilters[this.currentChannel] = filter;
    this.saveToLocalStorage();
  }
}
```

### Excluding Fields from Bubbles

Event bubble components can emit exclude events:

```javascript
// Example: In a bubble component
const excludeBtn = document.createElement('button');
excludeBtn.textContent = '−';
excludeBtn.addEventListener('click', () => {
  window.dispatchEvent(new CustomEvent('filter-exclude', {
    detail: { 
      field: 'session', 
      value: '12' 
    }
  }));
});
```

The filter component listens for these events and appends the exclusion:

```javascript
// In lucene-filter.mjs
window.addEventListener('filter-exclude', (e) => {
  this.appendExclusion(e.detail);
});

appendExclusion(detail) {
  const { field, value } = detail;
  const currentFilter = this.filter;
  const exclusion = `NOT ${field}:${value}`;
  const newFilter = currentFilter 
    ? `${currentFilter} AND ${exclusion}`
    : exclusion;
  this.updateFilter(newFilter);
}
```

### Accessing Per-Channel Filters

```javascript
// app.js
get luceneFilter() {
  return this.currentChannel 
    ? (this.luceneFilters[this.currentChannel] || '') 
    : '';
}

// When switching channels
selectChannel(channelName) {
  this.currentChannel = channelName;
  
  // The filter automatically updates via the getter
  this.$nextTick(() => {
    const filterComponent = this.$el?.querySelector('lucene-filter');
    if (filterComponent) {
      filterComponent.setAttribute('filter', this.luceneFilter);
    }
  });
}
```

## Implementation Details

### Parser Architecture

The filter uses a **recursive descent parser** with operator precedence:

1. **Tokenization**: Split query string into tokens (fields, operators, parentheses)
2. **Shunting Yard**: Convert infix notation to postfix using operator precedence
3. **Tree Building**: Convert postfix expression to a binary tree
4. **Evaluation**: Walk the tree to match events

### Operator Precedence

```
NOT  (highest - 3)
AND  (medium  - 2)
OR   (lowest  - 1)
```

### Query Tree Example

For query: `session:12 AND NOT tool:view_file`

```
        AND
       /   \
    term    NOT
    ↓        ↓
session:12  term
            ↓
         tool:view_file
```

### Matching Algorithm

```javascript
matchesQuery(event, query) {
  switch (query.type) {
    case 'term':
      return matchesTerm(event, query.field, query.value);
    case 'NOT':
      return !matchesQuery(event, query.operand);
    case 'AND':
      return matchesQuery(event, query.left) 
          && matchesQuery(event, query.right);
    case 'OR':
      return matchesQuery(event, query.left) 
          || matchesQuery(event, query.right);
  }
}
```

### Wildcard Matching

Wildcards are converted to regex patterns:

```javascript
const pattern = value
  .replace(/\*/g, '.*')      // * → match any chars
  .replace(/\?/g, '.');      // ? → match single char
const regex = new RegExp(`^${pattern}$`, 'i');
return regex.test(fieldValue);
```

## Testing

### Manual Testing

Open the test page:

```
http://localhost:3002/test-lucene-filter.html
```

Features:
- Pre-loaded sample events (12 events with various types)
- Quick-test buttons for common queries
- "−" buttons on each event to test exclusions
- Real-time event count display
- Visual feedback for filtered results

### Test Cases

```javascript
// Basic field matching
session:12                          // 4 events
agent:alice                         // 4 events
tool:execute_shell                  // 3 events
type:TOOL_CALL                      // 6 events

// Boolean combinations
session:12 AND tool:ask_human       // 0 events
agent:alice OR agent:bob            // 8 events
NOT agent:charlie                   // 10 events

// Complex queries
session:* AND NOT tool:view_file    // 8 events
(agent:alice OR agent:bob) AND type:TOOL_CALL  // 5 events
type:TOOL_CALL AND NOT tool:ask_human          // 4 events
```

## Performance Considerations

### Client-Side Filtering

- **Pros**: Instant filtering, no server load, works offline
- **Cons**: All events must be loaded in memory

### Optimization Strategies

1. **Debouncing**: 300ms delay before applying filter
2. **Event Limiting**: Keep only last 1000 events in memory
3. **Lazy Evaluation**: Filter only when events change or filter changes
4. **Memoization**: Cache parsed queries (future enhancement)

### Memory Usage

With 1000 events × ~500 bytes per event = ~500KB memory usage
This is acceptable for browser-based applications.

## Future Enhancements

### Potential Improvements

1. **Query Suggestions**: Autocomplete for field names and values
2. **Saved Filters**: Save frequently used filters as presets
3. **Query History**: Recent queries dropdown
4. **Advanced Operators**: 
   - Range queries: `session:[10 TO 20]`
   - Fuzzy matching: `agent:alice~2`
   - Proximity: `content:"error occurred"~5`
5. **Field Discovery**: Auto-detect available fields from events
6. **Export/Import**: Share filters between users
7. **Query Validation**: Real-time syntax highlighting
8. **Performance**: Query plan optimization for complex queries

### Parser Enhancements

Currently, the parser is simplified. A full Lucene implementation would support:

- Escaped characters: `agent:alice\:smith`
- Field boosts: `content:error^2`
- Required/prohibited shorthand: `+required -prohibited`
- Date ranges: `timestamp:[NOW-1DAY TO NOW]`
- Numeric ranges: `session_id:[1 TO 100]`

## Troubleshooting

### Common Issues

**Problem**: Filter not working  
**Solution**: Check browser console for parsing errors. Ensure field names match exactly (case-insensitive).

**Problem**: Filter persists when switching channels  
**Solution**: This is expected! Each channel has its own filter. Clear the filter if needed.

**Problem**: Exclude button adds duplicate exclusions  
**Solution**: Clear the filter first, or manually edit to remove duplicates.

**Problem**: Quoted strings not matching  
**Solution**: Ensure quotes are properly balanced and escaped.

### Debug Mode

Enable debug logging:

```javascript
// In browser console
localStorage.setItem('debug_lucene', 'true');
```

This will log:
- Parsed query trees
- Token arrays
- Match results per event

## API Reference

### LuceneFilter Component

**Attributes**:
- `filter` (string): Current filter query

**Events**:
- `filter-change`: Emitted when filter changes (detail: `{ filter: string }`)
- `filter-clear`: Emitted when clear button clicked

**Methods**:
- `setError(message)`: Display error message
- `clearError()`: Clear error message
- `appendExclusion(detail)`: Add exclusion filter (detail: `{ field, value }`)

### App Methods

**Filter Management**:
- `updateFilter(filter)`: Update current channel's filter
- `clearFilter()`: Clear current channel's filter
- `applyLuceneFilter(events, filterStr)`: Apply filter to events array

**Query Parsing**:
- `parseLuceneQuery(queryStr)`: Parse query string to tree
- `tokenizeLuceneQuery(queryStr)`: Tokenize query string
- `parseTokens(tokens)`: Parse tokens to postfix
- `buildQueryTree(postfix)`: Build query tree from postfix
- `matchesQuery(event, query)`: Test if event matches query
- `matchesTerm(event, field, value)`: Test if field matches value

## License

Part of the Daemon CLI project.
