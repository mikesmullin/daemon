export const toolsDefinition = [
  {
    type: 'function',
    function: {
      name: 'vectordb__recall',
      description: 'Perform semantic search in vector database to retrieve relevant memories. Searches by embedding similarity to find facts matching the query content.',
      parameters: {
        type: 'object',
        properties: {
          file: {
            type: 'string',
            description: 'Database filename (path relative to plugins/vectordb/data/). E.g., "myagent.db" or "shared/knowledge.db"'
          },
          batch: {
            type: 'array',
            description: 'Array of search queries to execute',
            items: {
              type: 'object',
              properties: {
                content: {
                  type: 'string',
                  description: 'Text query to search for (will be converted to embedding)'
                },
                meta: {
                  type: 'object',
                  description: 'Optional metadata filters (SQL WHERE clause conditions). Example: {"category": "technology", "year": 2023}'
                },
                limit: {
                  type: 'number',
                  description: 'Maximum number of results to return (default: 10)',
                  default: 10
                }
              },
              required: ['content']
            }
          }
        },
        required: ['file', 'batch']
      }
    },
    metadata: { 
      help: 'vectordb recall <file> <query>',
      requiresHostExecution: true
    }
  },
  {
    type: 'function',
    function: {
      name: 'vectordb__memorize',
      description: 'Store facts in vector database as long-term memories. This is an upsert operation: if an exact embedding match exists, metadata will be merged; otherwise a new record is inserted.',
      parameters: {
        type: 'object',
        properties: {
          file: {
            type: 'string',
            description: 'Database filename (path relative to plugins/vectordb/data/). E.g., "myagent.db" or "shared/knowledge.db"'
          },
          batch: {
            type: 'array',
            description: 'Array of facts to store',
            items: {
              type: 'object',
              properties: {
                content: {
                  type: 'string',
                  description: 'Text content to store (will be converted to embedding)'
                },
                meta: {
                  type: 'object',
                  description: 'Optional metadata key-values to store with this fact'
                }
              },
              required: ['content']
            }
          }
        },
        required: ['file', 'batch']
      }
    },
    metadata: { 
      help: 'vectordb memorize <file> <content>',
      requiresHostExecution: true
    }
  },
  {
    type: 'function',
    function: {
      name: 'vectordb__forget',
      description: 'Delete memories from vector database by finding nearest matches to the query content. Can optionally filter by metadata before deletion.',
      parameters: {
        type: 'object',
        properties: {
          file: {
            type: 'string',
            description: 'Database filename (path relative to plugins/vectordb/data/). E.g., "myagent.db" or "shared/knowledge.db"'
          },
          batch: {
            type: 'array',
            description: 'Array of deletion queries',
            items: {
              type: 'object',
              properties: {
                content: {
                  type: 'string',
                  description: 'Text to match against (will find nearest embedding match)'
                },
                meta: {
                  type: 'object',
                  description: 'Optional metadata filters to narrow deletion scope'
                }
              },
              required: ['content']
            }
          }
        },
        required: ['file', 'batch']
      }
    },
    metadata: { 
      help: 'vectordb forget <file> <content>',
      requiresHostExecution: true
    }
  }
];
