// Database module for Task Management Plugin
// Handles all SQLite operations using bun:sqlite

import { Database } from 'bun:sqlite';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync, existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Database singleton
let db = null;

/**
 * Initialize database connection and schema
 * @returns {Database} SQLite database instance
 */
export function initializeDatabase() {
  if (db) {
    return db;
  }

  const dbPath = join(__dirname, 'data', 'taskmgmt.db');
  db = new Database(dbPath, { create: true });

  // Enable foreign keys
  db.run('PRAGMA foreign_keys = ON');

  // Load and execute schema
  const schemaPath = join(__dirname, 'schema.sql');
  const schema = readFileSync(schemaPath, 'utf-8');
  
  // Execute schema statements
  const statements = schema
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0);
  
  for (const stmt of statements) {
    db.run(stmt);
  }

  return db;
}

/**
 * Get database instance (ensures initialization)
 * @returns {Database}
 */
export function getDatabase() {
  if (!db) {
    return initializeDatabase();
  }
  return db;
}

/**
 * Create a new ticket
 * @param {Object} data - Ticket data
 * @returns {number} Ticket ID
 */
export function createTicket(data) {
  const db = getDatabase();
  
  const {
    title,
    description = null,
    assignee = null,
    urgency = 3,
    importance = 3,
    dueDate = null,
    labels = []
  } = data;

  // Validate urgency and importance
  if (urgency < 1 || urgency > 5) {
    throw new Error('urgency must be between 1 and 5');
  }
  if (importance < 1 || importance > 5) {
    throw new Error('importance must be between 1 and 5');
  }

  // Convert labels array to JSON, auto-lowercase
  const labelsJson = JSON.stringify(labels.map(l => l.toLowerCase()));

  const stmt = db.prepare(`
    INSERT INTO tickets (title, description, assignee, urgency, importance, due_date, labels)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const result = stmt.run(title, description, assignee, urgency, importance, dueDate, labelsJson);
  return result.lastInsertRowid;
}

/**
 * Get ticket by ID
 * @param {number} id - Ticket ID
 * @returns {Object|null} Ticket data
 */
export function getTicket(id) {
  const db = getDatabase();
  const stmt = db.prepare('SELECT * FROM tickets WHERE id = ?');
  const ticket = stmt.get(id);
  
  if (!ticket) {
    return null;
  }

  // Parse labels JSON
  ticket.labels = ticket.labels ? JSON.parse(ticket.labels) : [];
  
  return ticket;
}

/**
 * Update ticket fields
 * @param {number} id - Ticket ID
 * @param {Object} updates - Fields to update
 * @returns {boolean} Success
 */
export function updateTicket(id, updates) {
  const db = getDatabase();
  
  // Build dynamic UPDATE query
  const fields = [];
  const values = [];
  
  if (updates.title !== undefined) {
    fields.push('title = ?');
    values.push(updates.title);
  }
  if (updates.description !== undefined) {
    fields.push('description = ?');
    values.push(updates.description);
  }
  if (updates.assignee !== undefined) {
    fields.push('assignee = ?');
    values.push(updates.assignee);
  }
  if (updates.status !== undefined) {
    // Validate status
    const validStatuses = ['Open', 'In Progress', 'Review', 'Done'];
    if (!validStatuses.includes(updates.status)) {
      throw new Error(`Invalid status. Must be one of: ${validStatuses.join(', ')}`);
    }
    fields.push('status = ?');
    values.push(updates.status);
  }
  if (updates.urgency !== undefined) {
    if (updates.urgency < 1 || updates.urgency > 5) {
      throw new Error('urgency must be between 1 and 5');
    }
    fields.push('urgency = ?');
    values.push(updates.urgency);
  }
  if (updates.importance !== undefined) {
    if (updates.importance < 1 || updates.importance > 5) {
      throw new Error('importance must be between 1 and 5');
    }
    fields.push('importance = ?');
    values.push(updates.importance);
  }
  if (updates.dueDate !== undefined) {
    fields.push('due_date = ?');
    values.push(updates.dueDate);
  }
  if (updates.labels !== undefined) {
    fields.push('labels = ?');
    values.push(JSON.stringify(updates.labels.map(l => l.toLowerCase())));
  }
  
  if (fields.length === 0) {
    return false; // No updates
  }
  
  // Always update updated_at timestamp
  fields.push('updated_at = datetime("now")');
  
  const query = `UPDATE tickets SET ${fields.join(', ')} WHERE id = ?`;
  values.push(id);
  
  const stmt = db.prepare(query);
  const result = stmt.run(...values);
  
  return result.changes > 0;
}

/**
 * Delete ticket
 * @param {number} id - Ticket ID
 * @returns {boolean} Success
 */
export function deleteTicket(id) {
  const db = getDatabase();
  const stmt = db.prepare('DELETE FROM tickets WHERE id = ?');
  const result = stmt.run(id);
  return result.changes > 0;
}

/**
 * Add comment to ticket
 * @param {number} ticketId - Ticket ID
 * @param {string} author - Comment author
 * @param {string} content - Comment content
 * @returns {number} Comment ID
 */
export function addComment(ticketId, author, content) {
  const db = getDatabase();
  const stmt = db.prepare(`
    INSERT INTO comments (ticket_id, author, content)
    VALUES (?, ?, ?)
  `);
  const result = stmt.run(ticketId, author, content);
  return result.lastInsertRowid;
}

/**
 * Get comments for ticket
 * @param {number} ticketId - Ticket ID
 * @param {number} limit - Max results
 * @param {number} offset - Offset for pagination
 * @returns {Array} Comments
 */
export function getComments(ticketId, limit = 100, offset = 0) {
  const db = getDatabase();
  const stmt = db.prepare(`
    SELECT id, content, author, timestamp
    FROM comments
    WHERE ticket_id = ?
    ORDER BY timestamp ASC
    LIMIT ? OFFSET ?
  `);
  return stmt.all(ticketId, limit, offset);
}

/**
 * List tickets with filters
 * @param {Object} filters - Filter criteria
 * @returns {Array} Ticket summaries
 */
export function listTickets(filters = {}) {
  const db = getDatabase();
  
  const conditions = [];
  const values = [];
  
  if (filters.status !== undefined) {
    conditions.push('status = ?');
    values.push(filters.status);
  }
  if (filters.assignee !== undefined) {
    conditions.push('assignee = ?');
    values.push(filters.assignee);
  }
  if (filters.urgency !== undefined) {
    conditions.push('urgency = ?');
    values.push(filters.urgency);
  }
  if (filters.importance !== undefined) {
    conditions.push('importance = ?');
    values.push(filters.importance);
  }
  if (filters.labels !== undefined && filters.labels.length > 0) {
    // Search for tickets containing all specified labels
    for (const label of filters.labels) {
      conditions.push(`labels LIKE ?`);
      values.push(`%"${label.toLowerCase()}"%`);
    }
  }
  
  let query = `
    SELECT id, title, status, assignee, urgency, importance, updated_at
    FROM tickets
  `;
  
  if (conditions.length > 0) {
    query += ` WHERE ${conditions.join(' AND ')}`;
  }
  
  // Add sorting
  if (filters.sort) {
    query += ` ORDER BY ${filters.sort}`;
  } else {
    query += ` ORDER BY updated_at DESC`;
  }
  
  // Add limit and offset
  const limit = filters.limit || 100;
  const offset = filters.offset || 0;
  query += ` LIMIT ? OFFSET ?`;
  values.push(limit, offset);
  
  const stmt = db.prepare(query);
  return stmt.all(...values);
}

/**
 * Get ticket history
 * @param {number} ticketId - Ticket ID
 * @param {number} limit - Max results
 * @returns {Array} History entries
 */
export function getTicketHistory(ticketId, limit = 100) {
  const db = getDatabase();
  const stmt = db.prepare(`
    SELECT field_changed, old_value, new_value, changed_by, timestamp
    FROM history
    WHERE ticket_id = ?
    ORDER BY timestamp DESC
    LIMIT ?
  `);
  return stmt.all(ticketId, limit);
}

/**
 * Log change to history
 * @param {number} ticketId - Ticket ID
 * @param {string} field - Changed field name
 * @param {*} oldValue - Previous value
 * @param {*} newValue - New value
 * @param {string} changedBy - Who made the change
 */
export function logHistory(ticketId, field, oldValue, newValue, changedBy) {
  const db = getDatabase();
  
  // Convert values to strings for storage
  const oldStr = oldValue === null || oldValue === undefined ? null : 
                 typeof oldValue === 'object' ? JSON.stringify(oldValue) : String(oldValue);
  const newStr = newValue === null || newValue === undefined ? null : 
                 typeof newValue === 'object' ? JSON.stringify(newValue) : String(newValue);
  
  const stmt = db.prepare(`
    INSERT INTO history (ticket_id, field_changed, old_value, new_value, changed_by)
    VALUES (?, ?, ?, ?, ?)
  `);
  stmt.run(ticketId, field, oldStr, newStr, changedBy);
}

/**
 * Execute a transaction
 * @param {Function} callback - Transaction callback
 * @returns {*} Result from callback
 */
export function transaction(callback) {
  const db = getDatabase();
  return db.transaction(callback)();
}
