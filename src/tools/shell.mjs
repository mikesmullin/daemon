// Shell Operations
//
// - execute_shell(command, cwd) // Execute a shell command
//

import { _G } from '../lib/globals.mjs';
import utils from '../lib/utils.mjs';
import { executeCommandWithCheck } from './terminal-allowlist.js';

_G.tools.execute_shell = {
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
  metadata: {
    requiresHumanApproval: true,

    preToolUse: async (args, context) => {
      // Security check - delegate to existing allowlist system
      // This determines if human approval is needed
      const isAllowed = await utils.isCommandAllowed?.(args.command);

      if (isAllowed === true) {
        return 'allow';  // Execute without approval
      } else if (isAllowed === false) {
        return 'deny';   // Block execution entirely
      } else {
        return 'approve'; // Request human approval
      }
    },

    getApprovalPrompt: async (args, context) => {
      return `Shell command: ${args.command}\n` +
        `Working directory: ${args.cwd || 'current'}\n` +
        `⚠️  This command may modify your system or files.`;
    }
  },
  execute: async (args, options = {}) => {
    utils.logShell(args.command);

    // Use allowlist checker
    const result = await executeCommandWithCheck(args.command);
    return result;
  }
};