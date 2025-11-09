// VectorDB Plugin
//
// Long-term memory storage using LanceDB vector database
//
// Tools:
// - recall(file, batch[]) // Semantic search for memories
// - memorize(file, batch[]) // Store new memories (upsert)
// - forget(file, batch[]) // Delete memories by similarity

import * as lancedb from '@lancedb/lancedb';
import { pipeline } from '@xenova/transformers';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';

// Helper to get __dirname in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Lazy-loaded embedding model (shared across all operations)
let embedder = null;
let embedderInitialized = false;

/**
 * Initialize embedding model (lazy loading)
 */
async function initializeEmbedder() {
  if (embedderInitialized) {
    return embedder;
  }

  embedder = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
  embedderInitialized = true;
  return embedder;
}

/**
 * Get database connection and table
 * @param {string} file - Database filename (relative to plugins/vectordb/data/)
 * @returns {Promise<{db: lancedb.Connection, table: lancedb.Table}>}
 */
async function getDbTable(file) {
  // Resolve path relative to data directory
  const dbPath = join(__dirname, 'data', file);
  
  // Connect to database
  const db = await lancedb.connect(dbPath);
  
  // Check if table exists
  const tableNames = await db.tableNames();
  const tableName = 'memories';
  
  let table;
  if (tableNames.includes(tableName)) {
    table = await db.openTable(tableName);
  } else {
    // Create table - LanceDB will be initialized on first add()
    // We'll create it with the first batch of data
    table = null;
  }
  
  return { db, table };
}

/**
 * Convert metadata object to flat structure for LanceDB columns
 * Handles nested objects by flattening with dot notation
 */
function flattenMetadata(meta) {
  if (!meta || typeof meta !== 'object') return {};
  
  const flattened = {};
  
  function flatten(obj, prefix = '') {
    for (const [key, value] of Object.entries(obj)) {
      const newKey = prefix ? `${prefix}_${key}` : key;
      
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        flatten(value, newKey);
      } else {
        // Store primitive values and arrays as-is
        flattened[newKey] = value;
      }
    }
  }
  
  flatten(meta);
  return flattened;
}

/**
 * Build WHERE clause from metadata filters
 */
function buildWhereClause(meta) {
  if (!meta || typeof meta !== 'object' || Object.keys(meta).length === 0) {
    return null;
  }
  
  const conditions = [];
  const flatMeta = flattenMetadata(meta);
  
  for (const [key, value] of Object.entries(flatMeta)) {
    if (value === null || value === undefined) {
      conditions.push(`${key} IS NULL`);
    } else if (typeof value === 'string') {
      conditions.push(`${key} = '${value.replace(/'/g, "''")}'`);
    } else if (typeof value === 'number') {
      conditions.push(`${key} = ${value}`);
    } else if (typeof value === 'boolean') {
      conditions.push(`${key} = ${value}`);
    }
  }
  
  return conditions.length > 0 ? conditions.join(' AND ') : null;
}

/**
 * Generate embedding for text
 * @param {string} text - Text to embed
 * @returns {Promise<number[]>} Embedding vector
 */
async function generateEmbedding(text) {
  const model = await initializeEmbedder();
  const output = await model(text, { pooling: 'mean', normalize: true });
  return Array.from(output.data);
}

/**
 * Merge two metadata objects recursively
 */
function mergeMetadata(existing, updates) {
  if (!existing) return updates;
  if (!updates) return existing;
  
  const merged = { ...existing };
  
  for (const [key, value] of Object.entries(updates)) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      merged[key] = mergeMetadata(merged[key], value);
    } else {
      merged[key] = value;
    }
  }
  
  return merged;
}

// Export plugin registration function
export default function registerVectorDBPlugin(_G) {
  const { log } = _G.utils || { log: console.log };

  // Register: recall
  _G.tools.recall = {
    definition: {
      type: 'function',
      function: {
        name: 'recall',
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
      }
    },
    execute: async (args) => {
      const { file, batch } = args;

      if (!file || typeof file !== 'string') {
        throw new Error('file is required and must be a string');
      }

      if (!Array.isArray(batch) || batch.length === 0) {
        throw new Error('batch is required and must be a non-empty array');
      }

      if (typeof log === 'function') {
        log('debug', `🧠 Recalling memories from: ${file} (${batch.length} queries)`);
      }

      try {
        const { db, table } = await getDbTable(file);
        const results = [];

        // If table doesn't exist yet, return empty results
        if (!table) {
          for (const query of batch) {
            results.push({
              success: true,
              query: query.content,
              count: 0,
              memories: []
            });
          }
          return {
            success: true,
            file,
            results
          };
        }

        for (const query of batch) {
          const { content, meta, limit = 10 } = query;

          if (!content || typeof content !== 'string') {
            results.push({
              success: false,
              error: 'content is required and must be a string',
              query: content
            });
            continue;
          }

          // Generate embedding for query
          const embedding = await generateEmbedding(content);

          // Build query
          let search = table
            .vectorSearch(embedding)
            .distanceType('cosine')
            .limit(Math.max(1, Math.min(limit, 100)));

          // Apply metadata filters if provided using WHERE clause
          const whereClause = buildWhereClause(meta);
          if (whereClause) {
            search = search.where(whereClause);
          }

          const matches = await search.toArray();

          // Extract metadata from results (excluding system columns)
          const memories = matches.map(m => {
            const memory = {
              content: m.content,
              similarity: 1 - m._distance,
              distance: m._distance,
              meta: {}
            };
            
            // Extract metadata columns
            for (const [key, value] of Object.entries(m)) {
              if (!['id', 'content', 'vector', '_distance'].includes(key)) {
                memory.meta[key] = value;
              }
            }
            
            return memory;
          });

          results.push({
            success: true,
            query: content,
            count: memories.length,
            memories
          });
        }

        return {
          success: true,
          file,
          results
        };
      } catch (error) {
        throw new Error(`Failed to recall memories: ${error.message}`);
      }
    }
  };

  // Register: memorize
  _G.tools.memorize = {
    definition: {
      type: 'function',
      function: {
        name: 'memorize',
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
      }
    },
    execute: async (args) => {
      const { file, batch } = args;

      if (!file || typeof file !== 'string') {
        throw new Error('file is required and must be a string');
      }

      if (!Array.isArray(batch) || batch.length === 0) {
        throw new Error('batch is required and must be a non-empty array');
      }

      if (typeof log === 'function') {
        log('debug', `💾 Memorizing facts to: ${file} (${batch.length} items)`);
      }

      try {
        const { db, table: existingTable } = await getDbTable(file);
        const results = [];
        let nextId = existingTable ? await getNextId(existingTable) : 1;
        let table = existingTable;
        
        // Get existing schema columns if table exists
        const schemaColumns = table ? await getTableMetadataColumns(table) : [];

        for (const item of batch) {
          const { content, meta = {} } = item;

          if (!content || typeof content !== 'string') {
            results.push({
              success: false,
              error: 'content is required and must be a string',
              content
            });
            continue;
          }

          // Generate embedding
          const embedding = await generateEmbedding(content);

          // Flatten metadata for column storage
          const flatMeta = flattenMetadata(meta);
          
          // Check for schema mismatch (new fields that don't exist in schema)
          if (table && schemaColumns.length > 0) {
            const newFields = Object.keys(flatMeta).filter(key => !schemaColumns.includes(key));
            if (newFields.length > 0) {
              results.push({
                success: false,
                error: `Schema mismatch: Cannot add new metadata fields to existing table. New fields: ${newFields.join(', ')}. Existing schema fields: ${schemaColumns.join(', ')}. Either use existing fields or create a new database file.`,
                content,
                valid_fields: schemaColumns,
                attempted_fields: Object.keys(flatMeta)
              });
              continue;
            }
          }

          // If table doesn't exist yet, create it with first record
          if (!table) {
            try {
              table = await db.createTable('memories', [{
                id: nextId++,
                content,
                vector: embedding,
                ...flatMeta
              }]);
              
              // Update schema columns for subsequent records in this batch
              schemaColumns.push(...Object.keys(flatMeta));

              results.push({
                success: true,
                action: 'inserted',
                content,
                meta
              });
              continue;
            } catch (error) {
              results.push({
                success: false,
                error: `Failed to create table: ${error.message}`,
                content
              });
              continue;
            }
          }

          // Prepare record with schema consistency
          let record = {
            id: nextId,
            content,
            vector: embedding,
            ...flatMeta
          };
          
          // Ensure all existing schema columns are present (fill missing with null)
          // Also ensure new metadata fields that don't exist in schema are included
          const allColumns = [...new Set([...schemaColumns, ...Object.keys(flatMeta)])];
          record = ensureSchemaConsistency(record, allColumns);

          // Check for exact match (very low distance threshold)
          const exactMatches = await table
            .vectorSearch(embedding)
            .distanceType('cosine')
            .limit(1)
            .toArray();

          if (exactMatches.length > 0 && exactMatches[0]._distance < 0.001) {
            // Exact match found - merge metadata
            const existing = exactMatches[0];
            
            // Extract existing metadata (all columns except id, content, vector, _distance)
            const existingMeta = {};
            for (const [key, value] of Object.entries(existing)) {
              if (!['id', 'content', 'vector', '_distance'].includes(key)) {
                existingMeta[key] = value;
              }
            }
            
            const mergedMeta = { ...existingMeta, ...flatMeta };

            try {
              // Delete old record and insert updated one
              await table.delete(`id = ${existing.id}`);
              
              let updateRecord = {
                id: existing.id,
                content: content,
                vector: embedding,
                ...mergedMeta
              };
              updateRecord = ensureSchemaConsistency(updateRecord, schemaColumns);
              
              await table.add([updateRecord]);

              results.push({
                success: true,
                action: 'updated',
                content,
                meta: mergedMeta
              });
            } catch (error) {
              results.push({
                success: false,
                error: `Failed to update record: ${error.message}. Valid schema fields: ${schemaColumns.join(', ')}`,
                content,
                valid_fields: schemaColumns
              });
            }
          } else {
            // No exact match - insert new record
            try {
              await table.add([record]);
              nextId++;

              results.push({
                success: true,
                action: 'inserted',
                content,
                meta
              });
            } catch (error) {
              results.push({
                success: false,
                error: `Failed to insert record: ${error.message}. Valid schema fields: ${schemaColumns.join(', ')}`,
                content,
                valid_fields: schemaColumns
              });
            }
          }
        }

        return {
          success: true,
          file,
          count: results.length,
          results
        };
      } catch (error) {
        throw new Error(`Failed to memorize: ${error.message}`);
      }
    }
  };

  // Register: forget
  _G.tools.forget = {
    definition: {
      type: 'function',
      function: {
        name: 'forget',
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
      }
    },
    execute: async (args) => {
      const { file, batch } = args;

      if (!file || typeof file !== 'string') {
        throw new Error('file is required and must be a string');
      }

      if (!Array.isArray(batch) || batch.length === 0) {
        throw new Error('batch is required and must be a non-empty array');
      }

      if (typeof log === 'function') {
        log('debug', `🗑️ Forgetting memories from: ${file} (${batch.length} queries)`);
      }

      try {
        const { db, table } = await getDbTable(file);
        const results = [];

        // If table doesn't exist yet, nothing to forget
        if (!table) {
          for (const item of batch) {
            results.push({
              success: false,
              error: 'No memories exist yet',
              query: item.content
            });
          }
          return {
            success: true,
            file,
            count: 0,
            results
          };
        }

        for (const item of batch) {
          const { content, meta } = item;

          if (!content || typeof content !== 'string') {
            results.push({
              success: false,
              error: 'content is required and must be a string',
              content
            });
            continue;
          }

          // Generate embedding
          const embedding = await generateEmbedding(content);

          // Find nearest match
          let search = table
            .vectorSearch(embedding)
            .distanceType('cosine')
            .limit(1);

          // Apply metadata filters if provided using WHERE clause
          const whereClause = buildWhereClause(meta);
          if (whereClause) {
            search = search.where(whereClause);
          }

          const matches = await search.toArray();

          if (matches.length === 0) {
            results.push({
              success: false,
              error: 'No matching memory found',
              query: content
            });
            continue;
          }

          // Delete the closest match
          const match = matches[0];
          await table.delete(`id = ${match.id}`);

          // Extract metadata from deleted record
          const deletedMeta = {};
          for (const [key, value] of Object.entries(match)) {
            if (!['id', 'content', 'vector', '_distance'].includes(key)) {
              deletedMeta[key] = value;
            }
          }

          results.push({
            success: true,
            deleted: {
              content: match.content,
              meta: deletedMeta,
              distance: match._distance
            }
          });
        }

        return {
          success: true,
          file,
          count: results.length,
          results
        };
      } catch (error) {
        throw new Error(`Failed to forget: ${error.message}`);
      }
    }
  };

  if (typeof log === 'function') {
    log('debug', '✅ VectorDB plugin registered successfully');
  }
}

/**
 * Get the next available ID for the table
 */
async function getNextId(table) {
  try {
    const results = await table
      .select(['id'])
      .toArray();
    
    if (results.length === 0) {
      return 1;
    }
    
    const maxId = Math.max(...results.map(r => r.id));
    return maxId + 1;
  } catch (error) {
    return 1;
  }
}

/**
 * Get all metadata column names from table schema
 */
async function getTableMetadataColumns(table) {
  try {
    // Query a single record to inspect schema
    const sample = await table.query().limit(1).toArray();
    if (sample.length === 0) {
      return [];
    }
    
    const columns = Object.keys(sample[0]).filter(
      key => !['id', 'content', 'vector', '_distance'].includes(key)
    );
    return columns;
  } catch (error) {
    return [];
  }
}

/**
 * Ensure record has all schema columns (fill missing with null)
 */
function ensureSchemaConsistency(record, schemaColumns) {
  const fullRecord = { ...record };
  
  for (const col of schemaColumns) {
    if (!(col in fullRecord)) {
      fullRecord[col] = null;
    }
  }
  
  return fullRecord;
}
