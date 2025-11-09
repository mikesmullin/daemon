// Shell Operations Plugin
//
// - execute_shell(command, cwd) // Execute a shell command
//

import { checkCommand } from './terminal-allowlist.js';

// Export plugin registration function
export default function registerShellPlugin(_G) {
  const { utils } = _G;
  const { log } = utils || { log: console.log };

  // Register: execute_shell
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
        try {
          const checkResult = await checkCommand(args.command);

          if (checkResult.approved) {
            return 'allow';  // Execute without approval
          } else {
            // Check if it's explicitly denied or just needs approval
            const isDenied = checkResult.details?.fullLineCheck?.denied ||
              checkResult.details?.subCommandChecks?.some(c => c.denied);

            if (isDenied) {
              return 'deny';   // Block execution entirely
            } else {
              return 'approve'; // Request human approval
            }
          }
        } catch (error) {
          // If allowlist check fails, require approval as safety measure
          return 'approve';
        }
      },
      
      getApprovalPrompt: async (args, context) => {
        return `Shell command: ${args.command}\n` +
          `Working directory: ${args.cwd || 'current'}\n` +
          `⚠️  This command may modify your system or files.`;
      }
    },
    execute: async (args, options = {}) => {
      if (typeof utils.logShell === 'function') {
        utils.logShell(args.command);
      }

      // Authorization already handled by Tool.execute() preToolUse hook
      // Execute command directly without additional authorization checks
      try {
        const { spawn } = await import('child_process');

        // Use spawn instead of exec to get child process reference for tracking
        const child = spawn('sh', ['-c', args.command], {
          cwd: args.cwd || process.cwd(),
          timeout: 30000  // 30 second timeout
        });

        // Track child process for cleanup
        _G.childProcesses.add(child);

        // Remove from tracking when process exits
        child.on('exit', () => {
          _G.childProcesses.delete(child);
        });

        return new Promise((resolve) => {
          let stdout = '';
          let stderr = '';

          child.stdout.on('data', (data) => {
            stdout += data.toString();
          });

          child.stderr.on('data', (data) => {
            stderr += data.toString();
          });

          child.on('error', (error) => {
            _G.childProcesses.delete(child);
            resolve({
              success: false,
              content: `Command failed: ${error.message}`,
              metadata: {
                command: args.command,
                error: error.message,
                authorized: 'approved_by_preToolUse_hook'
              }
            });
          });

          child.on('close', (code, signal) => {
            _G.childProcesses.delete(child);

            if (signal) {
              resolve({
                success: false,
                content: `Command terminated by signal: ${signal}`,
                metadata: {
                  command: args.command,
                  cwd: args.cwd || process.cwd(),
                  signal,
                  authorized: 'approved_by_preToolUse_hook'
                }
              });
            } else {
              const output = stdout + (stderr || '');
              resolve({
                success: code === 0,
                content: output || `Command exited with code ${code}`,
                metadata: {
                  command: args.command,
                  cwd: args.cwd || process.cwd(),
                  exit_code: code,
                  authorized: 'approved_by_preToolUse_hook'
                }
              });
            }
          });
        });
      } catch (error) {
        return {
          success: false,
          content: `Command failed: ${error.message}`,
          metadata: {
            command: args.command,
            error: error.message,
            authorized: 'approved_by_preToolUse_hook'
          }
        };
      }
    }
  };

  if (typeof log === 'function') {
    log('debug', '✅ Shell plugin registered successfully');
  }
}