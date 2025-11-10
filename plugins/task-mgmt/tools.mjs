// Agent tools for Task Management Plugin
// Wraps database operations with audit logging and validation

import * as db from './db.mjs';

/**
 * Create a new ticket
 * @param {Object} args - Tool arguments
 * @returns {Object} Result with success and id
 */
export async function createTicket(args) {
  const {
    title,
    description,
    assignee,
    urgency = 3,
    importance = 3,
    dueDate,
    labels = [],
    changedBy
  } = args;

  // Validate required fields
  if (!title || title.trim() === '') {
    return {
      success: false,
      message: 'title is required and cannot be empty'
    };
  }

  if (!changedBy || changedBy.trim() === '') {
    return {
      success: false,
      message: 'changedBy is required and cannot be empty'
    };
  }

  try {
    // Create ticket in a transaction
    const ticketId = db.transaction(() => {
      const id = db.createTicket({
        title,
        description,
        assignee,
        urgency,
        importance,
        dueDate,
        labels
      });

      // Log creation in history
      db.logHistory(id, 'created', null, 'ticket created', changedBy);

      return id;
    });

    return {
      success: true,
      id: ticketId
    };
  } catch (error) {
    return {
      success: false,
      message: error.message
    };
  }
}

/**
 * Get ticket by ID
 * @param {Object} args - Tool arguments
 * @returns {Object|null} Ticket data or null
 */
export async function getTicket(args) {
  const { id } = args;

  if (!id) {
    return null;
  }

  try {
    const ticket = db.getTicket(id);
    return ticket;
  } catch (error) {
    return null;
  }
}

/**
 * Update ticket fields
 * @param {Object} args - Tool arguments
 * @returns {Object} Result with success
 */
export async function updateTicket(args) {
  const { id, updates, changedBy } = args;

  if (!id) {
    return {
      success: false,
      message: 'id is required'
    };
  }

  if (!updates || typeof updates !== 'object') {
    return {
      success: false,
      message: 'updates object is required'
    };
  }

  if (!changedBy || changedBy.trim() === '') {
    return {
      success: false,
      message: 'changedBy is required and cannot be empty'
    };
  }

  try {
    // Get current ticket state for history logging
    const oldTicket = db.getTicket(id);
    if (!oldTicket) {
      return {
        success: false,
        message: 'Ticket not found'
      };
    }

    // Update in transaction with history logging
    db.transaction(() => {
      // Update the ticket
      const success = db.updateTicket(id, updates);

      if (!success) {
        throw new Error('No changes made');
      }

      // Log each changed field
      const fieldMap = {
        title: 'title',
        description: 'description',
        assignee: 'assignee',
        status: 'status',
        urgency: 'urgency',
        importance: 'importance',
        dueDate: 'due_date',
        labels: 'labels'
      };

      for (const [key, dbField] of Object.entries(fieldMap)) {
        if (updates[key] !== undefined) {
          const oldValue = oldTicket[dbField === 'due_date' ? 'due_date' : key];
          const newValue = updates[key];
          
          // Only log if value actually changed
          const oldStr = JSON.stringify(oldValue);
          const newStr = JSON.stringify(newValue);
          
          if (oldStr !== newStr) {
            db.logHistory(id, dbField, oldValue, newValue, changedBy);
          }
        }
      }
    });

    return { success: true };
  } catch (error) {
    return {
      success: false,
      message: error.message
    };
  }
}

/**
 * Delete ticket by ID
 * @param {Object} args - Tool arguments
 * @returns {boolean} Success
 */
export async function deleteTicket(args) {
  const { id, changedBy } = args;

  if (!id) {
    return false;
  }

  if (!changedBy || changedBy.trim() === '') {
    return false;
  }

  try {
    // Log deletion before removing
    db.transaction(() => {
      db.logHistory(id, 'deleted', 'exists', 'deleted', changedBy);
      db.deleteTicket(id);
    });

    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Add comment to ticket
 * @param {Object} args - Tool arguments
 * @returns {Object} Result with success and id
 */
export async function addComment(args) {
  const { ticketId, content, author } = args;

  if (!ticketId) {
    return {
      success: false,
      message: 'ticketId is required'
    };
  }

  if (!content || content.trim() === '') {
    return {
      success: false,
      message: 'content is required and cannot be empty'
    };
  }

  if (!author || author.trim() === '') {
    return {
      success: false,
      message: 'author is required and cannot be empty'
    };
  }

  try {
    // Add comment in transaction with history log
    const commentId = db.transaction(() => {
      const id = db.addComment(ticketId, author, content);
      db.logHistory(ticketId, 'comment_added', null, `Comment by ${author}`, author);
      return id;
    });

    return {
      success: true,
      id: commentId
    };
  } catch (error) {
    return {
      success: false,
      message: error.message
    };
  }
}

/**
 * Get comments for ticket
 * @param {Object} args - Tool arguments
 * @returns {Array} Comments
 */
export async function getComments(args) {
  const { ticketId, limit = 100, offset = 0 } = args;

  if (!ticketId) {
    return [];
  }

  try {
    return db.getComments(ticketId, limit, offset);
  } catch (error) {
    return [];
  }
}

/**
 * List tickets with filters
 * @param {Object} args - Tool arguments
 * @returns {Array} Ticket summaries
 */
export async function listTickets(args = {}) {
  const {
    status,
    assignee,
    urgency,
    importance,
    labels,
    sort,
    limit = 100,
    offset = 0
  } = args;

  try {
    const filters = {
      status,
      assignee,
      urgency,
      importance,
      labels,
      sort,
      limit,
      offset
    };

    // Remove undefined filters
    Object.keys(filters).forEach(key => 
      filters[key] === undefined && delete filters[key]
    );

    return db.listTickets(filters);
  } catch (error) {
    return [];
  }
}

/**
 * Get ticket history
 * @param {Object} args - Tool arguments
 * @returns {Array} History entries
 */
export async function getTicketHistory(args) {
  const { ticketId, limit = 100 } = args;

  if (!ticketId) {
    return [];
  }

  try {
    return db.getTicketHistory(ticketId, limit);
  } catch (error) {
    return [];
  }
}
