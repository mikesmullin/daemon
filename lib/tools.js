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
        description: 'Create a new task in a task file',
        parameters: {
          type: 'object',
          properties: {
            file: {
              type: 'string',
              description: 'Path to the task file (e.g. tasks/project.task.md)'
            },
            content: {
              type: 'string',
              description: 'Task content in todo format (e.g. "- [ ] A @agent #tag `Title`")'
            }
          },
          required: ['file', 'content']
        }
      }
    },
    requiresApproval: false,
    execute: async (args) => {
      try {
        // Read existing file or create with ## TODO section
        let fileContent = '';
        if (existsSync(args.file)) {
          fileContent = readFileSync(args.file, 'utf8');
        }

        // Append task under ## TODO section
        if (!fileContent.includes('## TODO')) {
          fileContent += '\n## TODO\n\n';
        }

        fileContent += args.content + '\n';

        writeFileSync(args.file, fileContent, 'utf8');

        return { success: true, file: args.file };
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
        const agentFile = join('agents', `${args.agent_id}.agent.md`);

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
