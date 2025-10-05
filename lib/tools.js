/**
 * lib/tools.js
 * 
 * Tool definitions and execution for multi-agent system
 * Tools can be called by agents via Copilot API
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { executeCommandWithCheck } from './terminal-allowlist.js';
import yaml from 'js-yaml';

const execAsync = promisify(exec);

/**
 * Tool registry - maps tool names to their implementations
 */
export const tools = {

  // ===== File Operations =====

  read_file: {
    definition: {
      type: 'function',
      function: {
        name: 'read_file',
        description: 'Read contents of a file from the filesystem',
        parameters: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'Absolute or relative path to the file'
            }
          },
          required: ['path']
        }
      }
    },
    requiresApproval: false,
    execute: async (args) => {
      try {
        if (!existsSync(args.path)) {
          return { success: false, error: 'File not found' };
        }
        const content = readFileSync(args.path, 'utf8');
        // Normalize line endings for better YAML readability
        const normalized = content.replace(/\r\n/g, '\n');
        return { success: true, content: normalized };
      } catch (error) {
        return { success: false, error: error.message };
      }
    }
  },

  write_file: {
    definition: {
      type: 'function',
      function: {
        name: 'write_file',
        description: 'Write or overwrite a file (requires approval)',
        parameters: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'Absolute or relative path to the file'
            },
            content: {
              type: 'string',
              description: 'Content to write to the file'
            }
          },
          required: ['path', 'content']
        }
      }
    },
    requiresApproval: true,
    execute: async (args) => {
      try {
        // Ensure directory exists
        const dir = dirname(args.path);
        if (!existsSync(dir)) {
          mkdirSync(dir, { recursive: true });
        }

        writeFileSync(args.path, args.content, 'utf8');
        return { success: true, path: args.path };
      } catch (error) {
        return { success: false, error: error.message };
      }
    }
  },

  // ===== Session Management =====

  list_active_sessions: {
    definition: {
      type: 'function',
      function: {
        name: 'list_active_sessions',
        description: 'List all active agent session files',
        parameters: {
          type: 'object',
          properties: {},
          required: []
        }
      }
    },
    requiresApproval: false,
    execute: async (args) => {
      try {
        const sessionsDir = 'sessions';
        if (!existsSync(sessionsDir)) {
          return { success: true, sessions: [] };
        }

        const files = readdirSync(sessionsDir)
          .filter(f => f.endsWith('.session.yaml'))
          .map(f => {
            const fullPath = join(sessionsDir, f);
            const stats = statSync(fullPath);
            return {
              filename: f,
              path: fullPath,
              lastModified: stats.mtime.toISOString(),
              size: stats.size
            };
          })
          .sort((a, b) => new Date(b.lastModified) - new Date(a.lastModified));

        return {
          success: true,
          sessions: files,
          count: files.length
        };
      } catch (error) {
        return { success: false, error: error.message };
      }
    }
  },

  read_session: {
    definition: {
      type: 'function',
      function: {
        name: 'read_session',
        description: 'Read the contents of another agent\'s session file',
        parameters: {
          type: 'object',
          properties: {
            session_file: {
              type: 'string',
              description: 'Path to the session file (e.g., "sessions/executor-001-abc123.session.yaml")'
            }
          },
          required: ['session_file']
        }
      }
    },
    requiresApproval: false,
    execute: async (args) => {
      try {
        if (!existsSync(args.session_file)) {
          return { success: false, error: 'Session file not found' };
        }
        const content = readFileSync(args.session_file, 'utf8');
        // Normalize line endings for better YAML readability
        const normalized = content.replace(/\r\n/g, '\n');
        return { success: true, content: normalized, path: args.session_file };
      } catch (error) {
        return { success: false, error: error.message };
      }
    }
  },

  edit_session: {
    definition: {
      type: 'function',
      function: {
        name: 'edit_session',
        description: 'Replace or modify an entire session file at once (advanced session management)',
        parameters: {
          type: 'object',
          properties: {
            session_file: {
              type: 'string',
              description: 'Path to the session file (e.g., "sessions/executor-001-abc123.session.yaml")'
            },
            new_content: {
              type: 'string',
              description: 'Complete new YAML content for the session file'
            }
          },
          required: ['session_file', 'new_content']
        }
      }
    },
    requiresApproval: true, // Replacing entire session files is dangerous, requires approval
    execute: async (args) => {
      try {
        if (!existsSync(args.session_file)) {
          return { success: false, error: 'Session file not found' };
        }

        // Validate that the new content is valid YAML
        try {
          yaml.load(args.new_content);
        } catch (yamlError) {
          return { success: false, error: `Invalid YAML content: ${yamlError.message}` };
        }

        // Write the new content to the session file
        writeFileSync(args.session_file, args.new_content, 'utf8');

        return {
          success: true,
          message: 'Session file replaced successfully',
          session_file: args.session_file
        };
      } catch (error) {
        return { success: false, error: error.message };
      }
    }
  },

  list_directory: {
    definition: {
      type: 'function',
      function: {
        name: 'list_directory',
        description: 'List files and folders in a directory',
        parameters: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'Path to the directory'
            }
          },
          required: ['path']
        }
      }
    },
    requiresApproval: false,
    execute: async (args) => {
      try {
        if (!existsSync(args.path)) {
          return { success: false, error: 'Directory not found' };
        }

        const entries = readdirSync(args.path).map(name => {
          const fullPath = join(args.path, name);
          const stats = statSync(fullPath);
          return {
            name,
            type: stats.isDirectory() ? 'directory' : 'file',
            size: stats.size,
            modified: stats.mtime
          };
        });

        return { success: true, entries };
      } catch (error) {
        return { success: false, error: error.message };
      }
    }
  },

  create_directory: {
    definition: {
      type: 'function',
      function: {
        name: 'create_directory',
        description: 'Create a new directory (and parent directories if needed)',
        parameters: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'Path to the directory to create'
            }
          },
          required: ['path']
        }
      }
    },
    requiresApproval: false,
    execute: async (args) => {
      try {
        mkdirSync(args.path, { recursive: true });
        return { success: true, path: args.path };
      } catch (error) {
        return { success: false, error: error.message };
      }
    }
  },

  // ===== Terminal Operations =====

  execute_command: {
    definition: {
      type: 'function',
      function: {
        name: 'execute_command',
        description: 'Execute a shell command (requires approval for dangerous commands)',
        parameters: {
          type: 'object',
          properties: {
            command: {
              type: 'string',
              description: 'The shell command to execute'
            },
            cwd: {
              type: 'string',
              description: 'Working directory for command execution (optional)'
            }
          },
          required: ['command']
        }
      }
    },
    requiresApproval: true, // Will be overridden by allowlist check
    execute: async (args, options = {}) => {
      // Use existing allowlist checker
      return await executeCommandWithCheck(args.command, {
        autoApprove: options.autoApprove || false,
        cwd: args.cwd
      });
    }
  },

  // ===== Task Management =====

  query_tasks: {
    definition: {
      type: 'function',
      function: {
        name: 'query_tasks',
        description: 'Query tasks using SQL-like syntax (uses todo CLI)',
        parameters: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'SQL-like query string (e.g. "SELECT * FROM tasks.md WHERE priority = \'A\'")'
            }
          },
          required: ['query']
        }
      }
    },
    requiresApproval: false,
    execute: async (args) => {
      try {
        const { stdout, stderr } = await execAsync(`todo query "${args.query}"`);
        if (stderr) {
          return { success: false, error: stderr };
        }
        return { success: true, output: stdout };
      } catch (error) {
        return { success: false, error: error.message };
      }
    }
  },

  create_task: {
    definition: {
      type: 'function',
      function: {
        name: 'create_task',
        description: 'Create a new task using the todo CLI. Tasks are added to tasks/approvals.task.md',
        parameters: {
          type: 'object',
          properties: {
            title: {
              type: 'string',
              description: 'Task title/summary'
            },
            priority: {
              type: 'string',
              description: 'Priority: A (highest), B, C, or D (lowest)',
              enum: ['A', 'B', 'C', 'D']
            },
            stakeholders: {
              type: 'array',
              items: { type: 'string' },
              description: 'Agent, or people to assign (e.g. ["@executor-001", "@sarah"])'
            },
            tags: {
              type: 'array',
              items: { type: 'string' },
              description: 'Topic tags for categorization (e.g. ["#infra", "#redis"])'
            },
            prompt: {
              type: 'string',
              description: 'Detailed task prompt/instructions (optional)'
            }
          },
          required: ['title', 'priority', 'stakeholders']
        }
      }
    },
    requiresApproval: false,
    execute: async (args) => {
      try {
        // Build INSERT query with proper task format
        const taskFile = 'tasks/approvals.task.md';

        // Build the SET clause with proper field formatting and escaping
        const escapedTitle = args.title.replace(/'/g, "''");
        let setClause = `title = '${escapedTitle}', priority = '${args.priority}'`;

        // Add stakeholders (remove @ symbol, comma-separated for todo CLI)
        if (args.stakeholders && args.stakeholders.length > 0) {
          const stakeholdersClean = args.stakeholders.map(s => s.replace('@', '')).join(',');
          setClause += `, stakeholders = '${stakeholdersClean}'`;
        }

        // Add tags if provided (remove # symbols, comma-separated for todo CLI)
        if (args.tags && args.tags.length > 0) {
          const tagsStr = args.tags.map(tag => tag.replace('#', '')).join(',');
          setClause += `, tags = '${tagsStr}'`;
        }

        // Add prompt if provided (escape single quotes for SQL)
        if (args.prompt) {
          const escapedPrompt = args.prompt.replace(/'/g, "''");
          setClause += `, prompt = '${escapedPrompt}'`;
        }

        const query = `INSERT INTO ${taskFile} SET ${setClause}`;

        // Execute via todo CLI
        const { stdout, stderr } = await execAsync(`todo query "${query}"`);
        if (stderr) {
          return { success: false, error: stderr };
        }

        // Parse the task ID from output (e.g., "Inserted task dd629895 into tasks/approvals.task.md")
        const match = stdout.match(/Inserted task (\w+) into/);
        const taskId = match ? match[1] : 'unknown';

        return {
          success: true,
          file: taskFile,
          task_id: taskId,
          output: stdout.trim()
        };
      } catch (error) {
        return { success: false, error: error.message };
      }
    }
  },

  update_task: {
    definition: {
      type: 'function',
      function: {
        name: 'update_task',
        description: 'Update task(s) using SQL-like UPDATE syntax',
        parameters: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'UPDATE query (e.g. "UPDATE tasks.md SET completed = true WHERE id = \'task-001\'")'
            }
          },
          required: ['query']
        }
      }
    },
    requiresApproval: false,
    execute: async (args) => {
      try {
        const { stdout, stderr } = await execAsync(`todo query "${args.query}"`);
        if (stderr) {
          return { success: false, error: stderr };
        }
        return { success: true, output: stdout };
      } catch (error) {
        return { success: false, error: error.message };
      }
    }
  },

  // ===== Agent Communication =====

  send_message: {
    definition: {
      type: 'function',
      function: {
        name: 'send_message',
        description: 'Send a message to another agent by appending to their chat log',
        parameters: {
          type: 'object',
          properties: {
            agent_id: {
              type: 'string',
              description: 'Target agent ID (e.g. "planner-001")'
            },
            content: {
              type: 'string',
              description: 'Message content to send'
            }
          },
          required: ['agent_id', 'content']
        }
      }
    },
    requiresApproval: false,
    execute: async (args) => {
      try {
        const agentFile = join('templates', `${args.agent_id}.agent.yaml`);

        if (!existsSync(agentFile)) {
          return { success: false, error: `Agent not found: ${args.agent_id}` };
        }

        // This will be handled by the daemon's appendMessage function
        // For now, just return success with intent
        return {
          success: true,
          intent: 'append_message',
          agent_id: args.agent_id,
          content: args.content
        };
      } catch (error) {
        return { success: false, error: error.message };
      }
    }
  },

  // ===== External Integration =====

  slack_send: {
    definition: {
      type: 'function',
      function: {
        name: 'slack_send',
        description: 'Send a message to Slack (requires approval)',
        parameters: {
          type: 'object',
          properties: {
            channel: {
              type: 'string',
              description: 'Slack channel ID or name'
            },
            message: {
              type: 'string',
              description: 'Message to send'
            }
          },
          required: ['channel', 'message']
        }
      }
    },
    requiresApproval: true,
    execute: async (args) => {
      // In real implementation, would use Slack API
      // For now, log to outbox
      try {
        const outboxPath = 'inbox/slack-outbox.jsonl';
        const entry = {
          timestamp: new Date().toISOString(),
          channel: args.channel,
          message: args.message,
          status: 'pending'
        };

        const line = JSON.stringify(entry) + '\n';

        if (existsSync(outboxPath)) {
          const existing = readFileSync(outboxPath, 'utf8');
          writeFileSync(outboxPath, existing + line, 'utf8');
        } else {
          writeFileSync(outboxPath, line, 'utf8');
        }

        return { success: true, message: 'Queued for Slack delivery' };
      } catch (error) {
        return { success: false, error: error.message };
      }
    }
  },

  slack_read: {
    definition: {
      type: 'function',
      function: {
        name: 'slack_read',
        description: 'Read recent messages from Slack inbox',
        parameters: {
          type: 'object',
          properties: {
            limit: {
              type: 'number',
              description: 'Maximum number of messages to return (default 10)'
            }
          }
        }
      }
    },
    requiresApproval: false,
    execute: async (args) => {
      try {
        const inboxPath = 'inbox/slack-messages.jsonl';

        if (!existsSync(inboxPath)) {
          return { success: true, messages: [] };
        }

        const content = readFileSync(inboxPath, 'utf8');
        const lines = content.trim().split('\n');
        const limit = args.limit || 10;

        const messages = lines
          .slice(-limit)
          .map(line => JSON.parse(line));

        return { success: true, messages };
      } catch (error) {
        return { success: false, error: error.message };
      }
    }
  }
};

/**
 * Get tool definitions for Copilot API
 * @returns {Array} Array of tool definitions
 */
export function getToolDefinitions() {
  return Object.values(tools).map(t => t.definition);
}

/**
 * Execute a tool by name
 * @param {string} name - Tool name
 * @param {Object} args - Tool arguments
 * @param {Object} options - Execution options
 * @returns {Promise<Object>} Tool execution result
 */
export async function executeTool(name, args, options = {}) {
  const tool = tools[name];

  if (!tool) {
    return { success: false, error: `Unknown tool: ${name}` };
  }

  try {
    const result = await tool.execute(args, options);
    return result;
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Check if a tool requires approval
 * @param {string} name - Tool name
 * @param {Object} args - Tool arguments (for context-sensitive checks)
 * @returns {boolean} True if approval required
 */
export function requiresApproval(name, args) {
  const tool = tools[name];
  if (!tool) return true; // Unknown tools require approval

  // Special case for execute_command - check allowlist
  if (name === 'execute_command') {
    // This would integrate with terminal-allowlist.js
    // For now, assume requires approval
    return true;
  }

  return tool.requiresApproval;
}
