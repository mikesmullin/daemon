// Task Management Plugin
//
// Minimalist Jira-like ticket tracking system for agent collaboration
//
// Tools:
// - createTicket(title, description, assignee, urgency, importance, dueDate, labels, changedBy)
// - getTicket(id)
// - updateTicket(id, updates, changedBy)
// - deleteTicket(id, changedBy)
// - addComment(ticketId, content, author)
// - getComments(ticketId, limit, offset)
// - listTickets(status, assignee, urgency, importance, labels, sort, limit, offset)
// - getTicketHistory(ticketId, limit)

import * as db from './db.mjs';
import * as tools from './tools.mjs';

/**
 * Register Task Management plugin with daemon
 * @param {Object} _G - Global context
 */
export default function registerTaskMgmtPlugin(_G) {
  const { log } = _G.utils || { log: console.log };

  // Initialize database
  try {
    db.initializeDatabase();
    if (typeof log === 'function') {
      log('debug', '📋 Task Management database initialized');
    }
  } catch (error) {
    if (typeof log === 'function') {
      log('error', `Failed to initialize Task Management database: ${error.message}`);
    }
    throw error;
  }

  // Register: createTicket
  _G.tools.createTicket = {
    definition: {
      type: 'function',
      function: {
        name: 'createTicket',
        description: 'Create a new ticket in the task management system. Returns ticket ID on success. All changes are automatically logged in the audit history.',
        parameters: {
          type: 'object',
          properties: {
            title: {
              type: 'string',
              description: 'Ticket title (required, max 255 chars recommended)'
            },
            description: {
              type: 'string',
              description: 'Detailed description (optional, markdown supported)'
            },
            assignee: {
              type: 'string',
              description: 'Assigned agent/user name (optional)'
            },
            urgency: {
              type: 'number',
              description: 'Eisenhower urgency level: 1=very urgent, 5=not urgent (default: 3)',
              minimum: 1,
              maximum: 5
            },
            importance: {
              type: 'number',
              description: 'Eisenhower importance level: 1=very important, 5=not important (default: 3)',
              minimum: 1,
              maximum: 5
            },
            dueDate: {
              type: 'string',
              description: 'Due date in ISO 8601 format (optional, e.g., "2025-12-31")'
            },
            labels: {
              type: 'array',
              items: { type: 'string' },
              description: 'Array of label strings for categorization (auto-lowercased)'
            },
            changedBy: {
              type: 'string',
              description: 'Name of agent/user creating the ticket (required for audit trail)'
            }
          },
          required: ['title', 'changedBy']
        }
      }
    },
    execute: async (args) => {
      try {
        const result = await tools.createTicket(args);
        return {
          content: JSON.stringify(result, null, 2),
          success: result.success
        };
      } catch (error) {
        return {
          content: JSON.stringify({ success: false, message: error.message }, null, 2),
          success: false
        };
      }
    }
  };

  // Register: getTicket
  _G.tools.getTicket = {
    definition: {
      type: 'function',
      function: {
        name: 'getTicket',
        description: 'Retrieve a ticket by ID. Returns full ticket details or null if not found.',
        parameters: {
          type: 'object',
          properties: {
            id: {
              type: 'number',
              description: 'Ticket ID'
            }
          },
          required: ['id']
        }
      }
    },
    execute: async (args) => {
      try {
        const ticket = await tools.getTicket(args);
        return {
          content: JSON.stringify(ticket, null, 2),
          success: ticket !== null
        };
      } catch (error) {
        return {
          content: JSON.stringify({ error: error.message }, null, 2),
          success: false
        };
      }
    }
  };

  // Register: updateTicket
  _G.tools.updateTicket = {
    definition: {
      type: 'function',
      function: {
        name: 'updateTicket',
        description: 'Update ticket fields. Only specified fields are updated. Changes are automatically logged in audit history.',
        parameters: {
          type: 'object',
          properties: {
            id: {
              type: 'number',
              description: 'Ticket ID'
            },
            updates: {
              type: 'object',
              description: 'Object containing fields to update',
              properties: {
                title: { type: 'string' },
                description: { type: 'string' },
                assignee: { type: 'string' },
                status: {
                  type: 'string',
                  enum: ['Open', 'In Progress', 'Review', 'Done'],
                  description: 'Workflow status'
                },
                urgency: {
                  type: 'number',
                  minimum: 1,
                  maximum: 5,
                  description: 'Eisenhower urgency (1-5)'
                },
                importance: {
                  type: 'number',
                  minimum: 1,
                  maximum: 5,
                  description: 'Eisenhower importance (1-5)'
                },
                dueDate: {
                  type: 'string',
                  description: 'Due date in ISO 8601 format'
                },
                labels: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'Label array (replaces existing)'
                }
              }
            },
            changedBy: {
              type: 'string',
              description: 'Name of agent/user making the change (required for audit trail)'
            }
          },
          required: ['id', 'updates', 'changedBy']
        }
      }
    },
    execute: async (args) => {
      try {
        const result = await tools.updateTicket(args);
        return {
          content: JSON.stringify(result, null, 2),
          success: result.success
        };
      } catch (error) {
        return {
          content: JSON.stringify({ success: false, message: error.message }, null, 2),
          success: false
        };
      }
    }
  };

  // Register: deleteTicket
  _G.tools.deleteTicket = {
    definition: {
      type: 'function',
      function: {
        name: 'deleteTicket',
        description: 'Delete a ticket by ID. Cascades to delete all comments and history. Returns true on success.',
        parameters: {
          type: 'object',
          properties: {
            id: {
              type: 'number',
              description: 'Ticket ID to delete'
            },
            changedBy: {
              type: 'string',
              description: 'Name of agent/user deleting the ticket (required for audit trail)'
            }
          },
          required: ['id', 'changedBy']
        }
      }
    },
    execute: async (args) => {
      try {
        const success = await tools.deleteTicket(args);
        return {
          content: JSON.stringify({ success }, null, 2),
          success
        };
      } catch (error) {
        return {
          content: JSON.stringify({ success: false, error: error.message }, null, 2),
          success: false
        };
      }
    }
  };

  // Register: addComment
  _G.tools.addComment = {
    definition: {
      type: 'function',
      function: {
        name: 'addComment',
        description: 'Add a comment to a ticket. Comments support markdown. Returns comment ID on success.',
        parameters: {
          type: 'object',
          properties: {
            ticketId: {
              type: 'number',
              description: 'Ticket ID to comment on'
            },
            content: {
              type: 'string',
              description: 'Comment body (markdown supported)'
            },
            author: {
              type: 'string',
              description: 'Name of commenter (required)'
            }
          },
          required: ['ticketId', 'content', 'author']
        }
      }
    },
    execute: async (args) => {
      try {
        const result = await tools.addComment(args);
        return {
          content: JSON.stringify(result, null, 2),
          success: result.success
        };
      } catch (error) {
        return {
          content: JSON.stringify({ success: false, message: error.message }, null, 2),
          success: false
        };
      }
    }
  };

  // Register: getComments
  _G.tools.getComments = {
    definition: {
      type: 'function',
      function: {
        name: 'getComments',
        description: 'Retrieve all comments for a ticket, ordered by timestamp (oldest first). Supports pagination.',
        parameters: {
          type: 'object',
          properties: {
            ticketId: {
              type: 'number',
              description: 'Ticket ID'
            },
            limit: {
              type: 'number',
              description: 'Maximum number of comments to return (default: 100)'
            },
            offset: {
              type: 'number',
              description: 'Offset for pagination (default: 0)'
            }
          },
          required: ['ticketId']
        }
      }
    },
    execute: async (args) => {
      try {
        const comments = await tools.getComments(args);
        return {
          content: JSON.stringify(comments, null, 2),
          success: true
        };
      } catch (error) {
        return {
          content: JSON.stringify({ error: error.message }, null, 2),
          success: false
        };
      }
    }
  };

  // Register: listTickets
  _G.tools.listTickets = {
    definition: {
      type: 'function',
      function: {
        name: 'listTickets',
        description: 'List tickets with optional exact-match filters. Returns ticket summaries. Defaults to all tickets if no filters provided. Supports sorting by any field.',
        parameters: {
          type: 'object',
          properties: {
            status: {
              type: 'string',
              enum: ['Open', 'In Progress', 'Review', 'Done'],
              description: 'Filter by status'
            },
            assignee: {
              type: 'string',
              description: 'Filter by assignee (exact match)'
            },
            urgency: {
              type: 'number',
              minimum: 1,
              maximum: 5,
              description: 'Filter by urgency level'
            },
            importance: {
              type: 'number',
              minimum: 1,
              maximum: 5,
              description: 'Filter by importance level'
            },
            labels: {
              type: 'array',
              items: { type: 'string' },
              description: 'Filter by labels (tickets must contain all specified labels)'
            },
            sort: {
              type: 'string',
              description: 'Sort expression (e.g., "updated_at desc", "urgency asc,importance desc"). Default: "updated_at desc"'
            },
            limit: {
              type: 'number',
              description: 'Maximum number of results (default: 100)'
            },
            offset: {
              type: 'number',
              description: 'Offset for pagination (default: 0)'
            }
          },
          required: []
        }
      }
    },
    execute: async (args) => {
      try {
        const tickets = await tools.listTickets(args);
        return {
          content: JSON.stringify(tickets, null, 2),
          success: true
        };
      } catch (error) {
        return {
          content: JSON.stringify({ error: error.message }, null, 2),
          success: false
        };
      }
    }
  };

  // Register: getTicketHistory
  _G.tools.getTicketHistory = {
    definition: {
      type: 'function',
      function: {
        name: 'getTicketHistory',
        description: 'Retrieve change history for a ticket, ordered by timestamp (newest first). Shows all field changes, comments, and who made each change.',
        parameters: {
          type: 'object',
          properties: {
            ticketId: {
              type: 'number',
              description: 'Ticket ID'
            },
            limit: {
              type: 'number',
              description: 'Maximum number of history entries (default: 100)'
            }
          },
          required: ['ticketId']
        }
      }
    },
    execute: async (args) => {
      try {
        const history = await tools.getTicketHistory(args);
        return {
          content: JSON.stringify(history, null, 2),
          success: true
        };
      } catch (error) {
        return {
          content: JSON.stringify({ error: error.message }, null, 2),
          success: false
        };
      }
    }
  };

  if (typeof log === 'function') {
    log('debug', '✅ Task Management plugin registered successfully');
  }
}
