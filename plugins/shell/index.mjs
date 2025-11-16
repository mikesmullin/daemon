// Shell Operations Plugin
//
// - execute_shell(command, cwd) // Execute a shell command
// - create_ptty(name, cwd, env, shell, initialCommands) // Create a PTY session
// - send_to_ptty(sessionId, text, wait) // Send text to PTY session
// - read_ptty(sessionId, lines, sinceLastRead) // Read PTY buffer
// - close_ptty(sessionId, force) // Close PTY session
//

import { checkCommand } from './terminal-allowlist.js';
import { ptyManager } from './pty-manager.mjs';

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

  // Register: create_ptty
  _G.tools.create_ptty = {
    definition: {
      type: 'function',
      function: {
        name: 'create_ptty',
        description: 'Create a new persistent pseudo-terminal session for interactive command execution (SSH, REPLs, etc.)',
        parameters: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              description: 'Human-readable name for this PTY session (optional)'
            },
            cwd: {
              type: 'string',
              description: 'Working directory for the PTY session (optional, defaults to current directory)'
            },
            env: {
              type: 'object',
              description: 'Environment variables to set for the PTY session (optional)',
              additionalProperties: { type: 'string' }
            },
            shell: {
              type: 'string',
              description: 'Shell executable to run (optional, defaults to bash on Unix, powershell on Windows)'
            },
            initialCommands: {
              type: 'string',
              description: 'Commands to execute immediately after PTY creation (optional)'
            }
          },
          required: []
        }
      }
    },
    metadata: {
      requiresHumanApproval: true,
      
      getApprovalPrompt: async (args, context) => {
        return `Create PTY session:\n` +
          `  Name: ${args.name || 'unnamed'}\n` +
          `  Shell: ${args.shell || 'default'}\n` +
          `  CWD: ${args.cwd || 'current'}\n` +
          `  Initial commands: ${args.initialCommands || 'none'}\n\n` +
          `⚠️  This creates a persistent terminal session with full shell access.`;
      }
    },
    execute: async (args, options = {}) => {
      try {
        // Get agent session ID from context
        const agentSessionId = options.context?.sessionId || 'unknown';
        
        // Create PTY session
        const session = ptyManager.createSession(agentSessionId, {
          name: args.name,
          cwd: args.cwd,
          env: args.env,
          shell: args.shell,
          initialCommands: args.initialCommands
        });
        
        // Give it a moment to initialize and process initial commands
        await new Promise(resolve => setTimeout(resolve, 100));
        
        return {
          success: true,
          content: `PTY session created successfully.\n` +
            `Session ID: ${session.id}\n` +
            `Name: ${session.name}\n` +
            `Shell: ${session.shell}\n` +
            `Working directory: ${session.cwd}\n\n` +
            `Use send_to_ptty to send commands and read_ptty to read output.`,
          metadata: {
            sessionId: session.id,
            name: session.name,
            shell: session.shell,
            cwd: session.cwd
          }
        };
      } catch (error) {
        return {
          success: false,
          content: `Failed to create PTY session: ${error.message}`,
          metadata: { error: error.message }
        };
      }
    }
  };

  // Register: send_to_ptty
  _G.tools.send_to_ptty = {
    definition: {
      type: 'function',
      function: {
        name: 'send_text_to_ptty',
        description: 'Send text to an existing PTY session. For special keys like ENTER, Ctrl+C, etc., use send_keys_to_ptty instead.',
        parameters: {
          type: 'object',
          properties: {
            sessionId: {
              type: 'string',
              description: 'ID of the PTY session (returned from create_ptty)'
            },
            text: {
              type: 'string',
              description: 'Text to send to the PTY. This sends literal text - use send_keys_to_ptty for special keys.'
            },
            wait: {
              type: 'boolean',
              description: 'If true, wait briefly for command output before returning (default: false)',
              default: false
            }
          },
          required: ['sessionId', 'text']
        }
      }
    },
    metadata: {
      requiresHumanApproval: true,
      
      getApprovalPrompt: async (args, context) => {
        return `Send to PTY session ${args.sessionId}:\n` +
          `  Text: ${args.text.substring(0, 200)}${args.text.length > 200 ? '...' : ''}\n\n` +
          `⚠️  This will execute in the terminal session.`;
      }
    },
    execute: async (args, options = {}) => {
      try {
        // Get agent session ID from context
        const agentSessionId = options.context?.sessionId || 'unknown';
        
        // Get PTY session
        const session = ptyManager.getSession(agentSessionId, args.sessionId);
        
        if (!session) {
          return {
            success: false,
            content: `PTY session '${args.sessionId}' not found. Use create_ptty first.`,
            metadata: { error: 'session_not_found' }
          };
        }
        
        // Send text
        session.write(args.text);
        
        // Wait if requested
        if (args.wait) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
        
        return {
          success: true,
          content: `Text sent to PTY session ${args.sessionId}${args.wait ? ' (waited for output)' : ''}.`,
          metadata: {
            sessionId: args.sessionId,
            bytesSent: args.text.length,
            waited: args.wait || false
          }
        };
      } catch (error) {
        return {
          success: false,
          content: `Failed to send to PTY session: ${error.message}`,
          metadata: { error: error.message }
        };
      }
    }
  };

  // Register: send_keys_to_ptty
  _G.tools.send_keys_to_ptty = {
    definition: {
      type: 'function',
      function: {
        name: 'send_keys_to_ptty',
        description: 'Send special keys or control sequences to a PTY session (ENTER, Ctrl+C, Ctrl+D, TAB, etc.)',
        parameters: {
          type: 'object',
          properties: {
            sessionId: {
              type: 'string',
              description: 'ID of the PTY session'
            },
            key: {
              type: 'string',
              description: 'Key or control sequence to send. Options: "ENTER", "TAB", "CTRL_C", "CTRL_D", "CTRL_Z", "ESC", "UP", "DOWN", "LEFT", "RIGHT", "BACKSPACE", "DELETE"',
              enum: ['ENTER', 'TAB', 'CTRL_C', 'CTRL_D', 'CTRL_Z', 'ESC', 'UP', 'DOWN', 'LEFT', 'RIGHT', 'BACKSPACE', 'DELETE']
            },
            wait: {
              type: 'boolean',
              description: 'If true, wait briefly after sending the key (default: false)',
              default: false
            }
          },
          required: ['sessionId', 'key']
        }
      }
    },
    metadata: {
      requiresHumanApproval: true,
      
      getApprovalPrompt: async (args, context) => {
        return `Send key to PTY session ${args.sessionId}:\n` +
          `  Key: ${args.key}\n\n` +
          `⚠️  This will send a control sequence to the terminal.`;
      }
    },
    execute: async (args, options = {}) => {
      try {
        // Get agent session ID from context
        const agentSessionId = options.context?.sessionId || 'unknown';
        
        // Get PTY session
        const session = ptyManager.getSession(agentSessionId, args.sessionId);
        
        if (!session) {
          return {
            success: false,
            content: `PTY session '${args.sessionId}' not found. Use create_ptty first.`,
            metadata: { error: 'session_not_found' }
          };
        }
        
        // Map key names to control sequences
        const keyMap = {
          'ENTER': '\r',           // Carriage return (standard terminal ENTER)
          'TAB': '\t',             // Tab
          'CTRL_C': '\x03',        // ETX - End of Text
          'CTRL_D': '\x04',        // EOT - End of Transmission
          'CTRL_Z': '\x1A',        // SUB - Suspend
          'ESC': '\x1B',           // Escape
          'UP': '\x1B[A',          // Arrow up
          'DOWN': '\x1B[B',        // Arrow down
          'RIGHT': '\x1B[C',       // Arrow right
          'LEFT': '\x1B[D',        // Arrow left
          'BACKSPACE': '\x7F',     // Delete character
          'DELETE': '\x1B[3~'      // Delete key
        };
        
        const sequence = keyMap[args.key];
        
        if (!sequence) {
          return {
            success: false,
            content: `Unknown key: ${args.key}. Valid keys: ${Object.keys(keyMap).join(', ')}`,
            metadata: { error: 'invalid_key', key: args.key }
          };
        }
        
        // Send the control sequence
        session.write(sequence);
        
        // Wait if requested
        if (args.wait) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
        
        return {
          success: true,
          content: `Key ${args.key} sent to PTY session ${args.sessionId}${args.wait ? ' (waited for output)' : ''}.`,
          metadata: {
            sessionId: args.sessionId,
            key: args.key,
            sequence: sequence.split('').map(c => '\\x' + c.charCodeAt(0).toString(16).padStart(2, '0')).join(''),
            waited: args.wait || false
          }
        };
      } catch (error) {
        return {
          success: false,
          content: `Failed to send key to PTY session: ${error.message}`,
          metadata: { error: error.message }
        };
      }
    }
  };

  // Register: read_ptty
  _G.tools.read_ptty = {
    definition: {
      type: 'function',
      function: {
        name: 'read_ptty',
        description: 'Read output from a PTY session buffer',
        parameters: {
          type: 'object',
          properties: {
            sessionId: {
              type: 'string',
              description: 'ID of the PTY session'
            },
            lines: {
              type: 'number',
              description: 'Number of lines to read from end of buffer (optional, defaults to visible screen)'
            },
            sinceLastRead: {
              type: 'boolean',
              description: 'If true, only return new content since last read (default: false)',
              default: false
            }
          },
          required: ['sessionId']
        }
      }
    },
    metadata: {
      requiresHumanApproval: false  // Reading is safe, no approval needed
    },
    execute: async (args, options = {}) => {
      try {
        // Get agent session ID from context
        const agentSessionId = options.context?.sessionId || 'unknown';
        
        // Get PTY session
        const session = ptyManager.getSession(agentSessionId, args.sessionId);
        
        if (!session) {
          return {
            success: false,
            content: `PTY session '${args.sessionId}' not found.`,
            metadata: { error: 'session_not_found' }
          };
        }
        
        // Read from session
        const result = session.read({
          lines: args.lines,
          sinceLastRead: args.sinceLastRead
        });
        
        return {
          success: true,
          content: result.content || '(no output)',
          metadata: {
            sessionId: args.sessionId,
            linesRead: result.linesRead,
            totalLines: result.totalLines,
            lastReadLine: result.lastReadLine
          }
        };
      } catch (error) {
        return {
          success: false,
          content: `Failed to read PTY session: ${error.message}`,
          metadata: { error: error.message }
        };
      }
    }
  };

  // Register: close_ptty
  _G.tools.close_ptty = {
    definition: {
      type: 'function',
      function: {
        name: 'close_ptty',
        description: 'Close a PTY session and release its resources',
        parameters: {
          type: 'object',
          properties: {
            sessionId: {
              type: 'string',
              description: 'ID of the PTY session to close'
            },
            force: {
              type: 'boolean',
              description: 'Force-close the PTY if graceful close fails (default: false)',
              default: false
            }
          },
          required: ['sessionId']
        }
      }
    },
    metadata: {
      requiresHumanApproval: true,
      
      getApprovalPrompt: async (args, context) => {
        return `Close PTY session ${args.sessionId}${args.force ? ' (forced)' : ''}.\n\n` +
          `⚠️  This will terminate the terminal session.`;
      }
    },
    execute: async (args, options = {}) => {
      try {
        // Get agent session ID from context
        const agentSessionId = options.context?.sessionId || 'unknown';
        
        // Close PTY session
        const closed = ptyManager.closeSession(agentSessionId, args.sessionId, args.force);
        
        if (!closed) {
          return {
            success: false,
            content: `PTY session '${args.sessionId}' not found.`,
            metadata: { error: 'session_not_found' }
          };
        }
        
        return {
          success: true,
          content: `PTY session ${args.sessionId} closed successfully.`,
          metadata: {
            sessionId: args.sessionId,
            forced: args.force || false
          }
        };
      } catch (error) {
        return {
          success: false,
          content: `Failed to close PTY session: ${error.message}`,
          metadata: { error: error.message }
        };
      }
    }
  };

  if (typeof log === 'function') {
    log('debug', '✅ Shell plugin registered successfully');
  }

  // Register cleanup handlers for PTY sessions
  const cleanupPTYSessions = () => {
    try {
      const totalSessions = ptyManager.getTotalSessions();
      if (totalSessions > 0) {
        if (typeof log === 'function') {
          log('debug', `🧹 Closing ${totalSessions} PTY session(s)...`);
        }
        // Force close all PTY sessions
        for (const [sessionKey, session] of ptyManager.sessions.entries()) {
          session.close(true);
        }
        ptyManager.sessions.clear();
      }
    } catch (error) {
      if (typeof log === 'function') {
        log('debug', `Could not clean up PTY sessions: ${error.message}`);
      }
    }
  };

  // Register signal handlers for cleanup
  process.on('SIGINT', cleanupPTYSessions);
  process.on('SIGTERM', cleanupPTYSessions);
  process.on('exit', cleanupPTYSessions);
}