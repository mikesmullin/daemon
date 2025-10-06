// Shell Operations
//
// - execute_shell(command, cwd) // Execute a shell command
//

import { _G } from '../lib/globals.mjs';
import { executeCommandWithCheck } from './terminal-allowlist.js';

export const execute_shell = {
  definition: {
    type: 'function',
    function: {
      name: 'execute_shell',
      description: 'Execute a shell command (requires human approval for some commands)',
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
  execute: async (args, options = {}) => {
    // Use existing allowlist checker
    return await executeCommandWithCheck(args.command, {
      autoApprove: options.autoApprove || false,
      cwd: args.cwd
    });
  }
};