// Task Operations
//
// - query_tasks(query) // Query tasks using SQL-like syntax
// - create_task(title, priority, stakeholders, tags, prompt) // Create a new task
// - update_task(id, updates) // Update an existing task
//

import { _G } from '../lib/globals.mjs';
import { spawn } from 'child_process';

// Helper function to run commands with spawn and capture exit code
const spawnAsync = (command, args = []) => {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args);
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', (exitCode) => {
      resolve({
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        exitCode
      });
    });

    child.on('error', (error) => {
      reject(error);
    });
  });
};


export const create_task = {
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
      const cmd = 'todo';
      const cmdArgs = ['query', query];
      const result = await spawnAsync(cmd, cmdArgs);
      if (result.exitCode !== 0) {
        return {
          success: false,
          error: result.stderr || `Command failed with exit code ${result.exitCode}`,
          exitCode: result.exitCode,
          cmd: `${cmd} ${cmdArgs.join(' ')}`,
        };
      }

      // Parse the task ID from output (e.g., "Inserted task dd629895 into tasks/approvals.task.md")
      const match = result.stdout.match(/Inserted task (\w+) into/);
      const taskId = match ? match[1] : 'unknown';

      return {
        success: true,
        file: taskFile,
        task_id: taskId,
        output: result.stdout,
        exitCode: result.exitCode
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
};

export const update_task = {
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
      const result = await spawnAsync('todo', ['query', args.query]);
      if (result.exitCode !== 0) {
        return {
          success: false,
          error: result.stderr || `Command failed with exit code ${result.exitCode}`,
          exitCode: result.exitCode
        };
      }
      return {
        success: true,
        output: result.stdout,
        exitCode: result.exitCode
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
};

export const query_tasks = {
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
      const result = await spawnAsync('todo', ['query', args.query]);
      if (result.exitCode !== 0) {
        return {
          success: false,
          error: result.stderr || `Command failed with exit code ${result.exitCode}`,
          exitCode: result.exitCode
        };
      }
      return {
        success: true,
        output: result.stdout,
        exitCode: result.exitCode
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
};