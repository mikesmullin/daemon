// Task Operations
//
// - query_tasks(query) // Query tasks using SQL-like syntax
// - create_task(title, priority, stakeholders, tags, prompt) // Create a new task
//

import { _G } from '../lib/globals.mjs';
import { spawnAsync } from '../lib/utils.mjs';

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
          id: {
            type: 'string',
            description: 'Globally unique identifier for this task (e.g., "task-001")'
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

      // Add id if provided
      if (args.id) {
        const escapedId = args.id.replace(/'/g, "''");
        setClause += `, id = '${escapedId}'`;
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
      const result = await spawnAsync('todo', ['--format', 'json', 'query', args.query]);
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