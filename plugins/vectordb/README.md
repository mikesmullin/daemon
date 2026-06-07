# VectorDB Plugin

Long-term memory storage for Daemon agents using LanceDB vector database.

## Overview

This plugin provides semantic memory capabilities through vector embeddings, allowing agents to:

- **Store facts** with automatic embedding generation
- **Search semantically** using natural language queries
- **Filter by metadata** for precise retrieval
- **Update memories** with metadata merging
- **Delete memories** by semantic similarity

## Features

- 🧠 **Semantic Search**: Find relevant memories using natural language
- 💾 **Persistent Storage**: LanceDB stores vectors on disk
- 🏷️ **Metadata Support**: Attach and filter by structured metadata
- 🔄 **Upsert Logic**: Automatic merge of metadata for duplicate content
- ⚡ **Fast Indexing**: HNSW index with cosine similarity
- 📦 **Batch Operations**: Process multiple items in a single call
- 🎯 **Efficient Model**: Xenova/all-MiniLM-L6-v2 (384 dims, runs locally)

## Installation

```bash
cd plugins/vectordb
bun install
```

## Available Tools

### `recall` - Search Memories

Perform semantic search to retrieve relevant memories.

```javascript
{
  "file": "myagent.db",
  "batch": [
    {
      "content": "What is the user's name?",
      "limit": 5
    },
    {
      "content": "Technical facts about Python",
      "meta": { "category": "technology" },
      "limit": 10
    }
  ]
}
```

**Parameters:**
- `file` (string, required): Database filename relative to `plugins/vectordb/data/`
- `batch` (array, required): Array of query objects
  - `content` (string, required): Search query text
  - `meta` (object, optional): Metadata filters (SQL WHERE conditions)
  - `limit` (number, optional): Max results (default: 10, max: 100)

**Returns:**
```javascript
{
  "success": true,
  "file": "myagent.db",
  "results": [
    {
      "success": true,
      "query": "What is the user's name?",
      "count": 2,
      "memories": [
        {
          "content": "User's name is Alice",
          "similarity": 0.89,
          "distance": 0.11,
          "meta": { "category": "personal" }
        }
      ]
    }
  ]
}
```

### `memorize` - Store Memories

Store facts as long-term memories. Automatically merges metadata for duplicate content.

```javascript
{
  "file": "myagent.db",
  "batch": [
    {
      "content": "User prefers dark mode",
      "meta": { "category": "preference", "timestamp": 1699564800 }
    },
    {
      "content": "Python is a programming language",
      "meta": { "category": "technology", "verified": true }
    }
  ]
}
```

**Parameters:**
- `file` (string, required): Database filename
- `batch` (array, required): Array of memory objects
  - `content` (string, required): Text to store
  - `meta` (object, optional): Metadata to attach

**Returns:**
```javascript
{
  "success": true,
  "file": "myagent.db",
  "count": 2,
  "results": [
    {
      "success": true,
      "action": "inserted",
      "content": "User prefers dark mode",
      "meta": { "category": "preference", "timestamp": 1699564800 }
    }
  ]
}
```

**Upsert Behavior:**
- If exact match found (distance < 0.001): Updates metadata via recursive merge
- Otherwise: Inserts new record with new ID

### `forget` - Delete Memories

Delete memories by finding nearest semantic matches.

```javascript
{
  "file": "myagent.db",
  "batch": [
    {
      "content": "User's old email address"
    },
    {
      "content": "Outdated preferences",
      "meta": { "category": "preference" }
    }
  ]
}
```

**Parameters:**
- `file` (string, required): Database filename
- `batch` (array, required): Array of deletion queries
  - `content` (string, required): Text to match
  - `meta` (object, optional): Metadata filters

**Returns:**
```javascript
{
  "success": true,
  "file": "myagent.db",
  "count": 2,
  "results": [
    {
      "success": true,
      "deleted": {
        "content": "user@old-email.com",
        "meta": {},
        "distance": 0.05
      }
    }
  ]
}
```

## Usage Examples

### CLI Usage

```bash
# Store a memory
d tool memorize '{
  "file": "solo.db",
  "batch": [{
    "content": "The user is working on a Daemon CLI project",
    "meta": {"category": "context", "project": "daemon"}
  }]
}'

# Search memories
d tool recall '{
  "file": "solo.db",
  "batch": [{
    "content": "What project is the user working on?",
    "limit": 3
  }]
}'

# Delete a memory
d tool forget '{
  "file": "solo.db",
  "batch": [{
    "content": "old project information"
  }]
}'
```

### Agent Template Usage

Add to `agents/templates/myagent.yaml`:

```yaml
metadata:
  name: myagent
  model: claude-sonnet-4

tools:
  - recall
  - memorize
  - forget
```

Then use in agent conversations:

```
Agent: I'll remember that for next time.
[calls memorize with user preferences]

Agent: Let me recall what you told me about...
[calls recall to search past conversations]
```

## Database Structure

Each database file contains a single `memories` table with dynamic schema:

```javascript
{
  id: number,        // Unique sequential ID
  content: string,   // The actual text/fact
  vector: float[],   // 384-dim embedding (Xenova/all-MiniLM-L6-v2)
  // Metadata fields are stored as separate columns
  category: string,  // Example metadata field
  type: string,      // Example metadata field
  verified: boolean, // Example metadata field
  timestamp: number, // Example metadata field
  // ... any other metadata fields you add
}
```

**Note**: Metadata is stored as individual columns, not as a nested object. This allows for efficient SQL-like filtering with WHERE clauses.

## Technical Details

### Embeddings
- **Model**: Xenova/all-MiniLM-L6-v2
- **Dimensions**: 384
- **Normalization**: Yes (for cosine similarity)
- **Pooling**: Mean pooling
- **Runtime**: ONNX (runs in Bun/Node.js, no Python needed)

### Vector Search
- **Index**: HNSW (Hierarchical Navigable Small World)
- **Distance**: Cosine similarity (L2 on normalized vectors)
- **Performance**: Sub-millisecond search on 10K+ vectors

### Storage
- **Format**: LanceDB (columnar, Apache Arrow-based)
- **Location**: `plugins/vectordb/data/<filename>/`
- **Persistence**: Automatic (writes to disk immediately)
- **Isolation**: Each `file` parameter creates separate database

## Metadata Filtering

Metadata is stored as separate columns and supports efficient SQL-like WHERE clauses:

```javascript
// Exact match
{ "category": "technology" }
// Generates: WHERE category = 'technology'

// Multiple conditions (AND)
{ "category": "technology", "verified": true }
// Generates: WHERE category = 'technology' AND verified = true

// Numeric comparison
{ "year": 2024, "score": 95 }
// Generates: WHERE year = 2024 AND score = 95

// Nested metadata (automatically flattened with underscore notation)
{ "user": { "role": "admin" } }
// Stored as: user_role = 'admin'
```

**How it works**:
- Metadata fields are flattened and stored as individual table columns
- Nested objects are flattened using underscore notation (e.g., `user.role` → `user_role`)
- WHERE clauses are executed server-side by LanceDB for efficient filtering
- Supports string, number, boolean, and null values

## Performance Tips

1. **Batch Operations**: Process multiple items in one call
2. **Limit Results**: Use lower `limit` values for faster queries
3. **Index Fields**: Use metadata for frequently filtered fields
4. **Separate DBs**: Use different files for different contexts/agents
5. **Embedding Cache**: Model loads once and stays in memory

## File Organization

```
plugins/vectordb/
├── index.mjs           # Main plugin code
├── package.json        # Dependencies
├── .gitignore          # Excludes data/
├── README.md           # This file
└── data/               # Database storage (gitignored)
    ├── solo.db/        # Example: solo agent memories
    ├── ada.db/         # Example: ada agent memories
    └── shared/         # Example: shared knowledge base
        └── tech.db/
```

## Integration with Daemon

The plugin automatically registers when Daemon loads plugins. Add tools to agent templates:

```yaml
# agents/templates/solo.yaml
metadata:
  name: solo
  model: claude-sonnet-4

tools:
  - recall
  - memorize
  - forget
  - read_file
  - write_file
  - shell
```

## Best Practices

### Memory Hygiene
- Use descriptive metadata categories
- Regularly clean outdated memories with `forget`
- Use separate databases per agent or context
- Store timestamps for time-based filtering

### Metadata Schema
```javascript
{
  category: "personal" | "technical" | "preference" | "context",
  timestamp: 1699564800,  // Unix timestamp
  source: "user" | "inferred" | "system",
  confidence: 0.0 - 1.0,  // Optional confidence score
  tags: ["important", "temporary"],
  // Custom fields as needed
}
```

### Search Strategy
1. **Broad Search**: Start with no metadata filters
2. **Refine**: Add metadata filters if too many results
3. **Fallback**: Increase `limit` if no relevant results
4. **Multi-Query**: Use batch to search multiple perspectives

### Update Pattern
```javascript
// Don't delete and re-add, just memorize again
// The upsert logic will merge metadata automatically
await memorize({
  file: "agent.db",
  batch: [{
    content: "User prefers dark mode",  // Same content
    meta: { updated_at: Date.now() }    // New/updated metadata
  }]
});
```

## Troubleshooting

### "Failed to recall memories"
- Check file path is relative to `plugins/vectordb/data/`
- Ensure database was created (run `memorize` first)

### Slow first query
- First run downloads embedding model (~90MB)
- Subsequent queries use cached model (fast)

### Out of memory
- Reduce batch sizes
- Lower `limit` parameter
- Use separate databases to split workload

### Metadata not filtering
- Check meta object syntax matches stored structure
- Use exact field names (case-sensitive)
- Numeric values don't need quotes, strings do

## Dependencies

- **@lancedb/lancedb**: ^0.10.0 - Vector database
- **@xenova/transformers**: ^2.17.0 - ONNX embedding model

## License

MIT - Part of the Daemon CLI project
