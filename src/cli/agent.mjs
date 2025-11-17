/**
 * Agent CLI Command
 * 
 * Handles the `d agent` subcommand for creating and running agents to completion
 */

import path from 'path';
import { _G } from '../lib/globals.mjs';
import { Agent } from '../lib/agents.mjs';
import { Session } from '../lib/session.mjs';
import utils, { log } from '../lib/utils.mjs';
import color from '../lib/colors.mjs';

// Agent name regex: allows file path characters (alphanumeric, hyphen, underscore, forward slash, dot)
const AGENT_NAME_PATTERN = /^@([\w\-\/\.]+)/;

export async function handleAgentCommand(args, last) {
  const subcommand = args[1];

  // Check for help
  if (subcommand === 'help') {
    showHelp();
    process.exit(0);
  }

  // Handle interactive mode
  if (_G.cliFlags.interactive) {
    await handleInteractiveMode(args, last);
    return;
  }

  // Non-interactive mode: parse @agent prompt pattern
  const fullPrompt = args.slice(1).join(' ');
  const agentMatch = fullPrompt.match(new RegExp(AGENT_NAME_PATTERN.source + '\\s+(.+)$'));

  if (!agentMatch) {
    utils.abort(
      'Error: agent requires @<agent> <prompt> format\n' +
      `Received: "${fullPrompt}"\n` +
      'Usage: d agent @<agent> <prompt>\n' +
      'Example: d agent @solo run command: whoami\n' +
      'Run \'d agent help\' for more information');
  }

  const agent = agentMatch[1];
  const prompt = agentMatch[2].trim();

  // Execute the agent
  await executeAgent(agent, prompt, last);
}

async function handleInteractiveMode(args, last) {
  // Interactive mode: @agent is required, prompt is optional (will be collected)
  if (args.length < 2) {
    utils.abort(
      'Error: agent requires @<agent> in interactive mode\n' +
      'Usage: d agent -i @<agent>\n' +
      'Example: d agent -i @solo');
  }

  const agentArg = args[1];
  const agentMatch = agentArg.match(AGENT_NAME_PATTERN);

  if (!agentMatch) {
    utils.abort(
      'Error: agent must start with @<agent> in interactive mode\n' +
      `Received: "${agentArg}"\n` +
      'Usage: d agent -i @<agent>\n' +
      'Example: d agent -i @solo');
  }

  const agent = agentMatch[1];

  // Import TUI module and prompt for input
  const { prompt: tuiPrompt } = await import('../lib/tui.mjs');

  // REPL loop: continuously prompt and execute
  let sessionId = null;

  while (true) {
    log('debug', `🤖 Interactive mode: collecting prompt for ${agent} agent...`);
    const collectedPrompt = await tuiPrompt('> ');

    // Validate prompt - if empty, just re-prompt (don't crash)
    if (!collectedPrompt || !collectedPrompt.trim()) {
      log('debug', 'Empty prompt provided, re-prompting...');
      continue; // Skip this iteration and prompt again
    }

    // Execute with the collected prompt, continuing the same session
    // Pass true for isInteractive flag to handle logging differently
    sessionId = await executeAgent(agent, collectedPrompt.trim(), last, sessionId, true);
  }
}

async function executeAgent(agent, prompt, suppressLogs = false, continueSessionId = null, isInteractive = false) {
  if (!prompt) {
    utils.abort(
      'Error: agent requires a prompt after @<agent>\n' +
      'Usage: d agent @<agent> <prompt>\n' +
      'Example: d agent @solo run command: whoami');
  }

  try {
    // Load config (needed for AI provider settings)
    _G.CONFIG = await utils.readYaml(_G.CONFIG_PATH);

    let sessionId;

    if (continueSessionId) {
      // Continue existing session by pushing new message
      log('debug', `🔄 Continuing session ${continueSessionId} with prompt: ${prompt}`);
      const pushResult = await Session.push(continueSessionId, prompt);
      sessionId = continueSessionId;

      // In interactive mode, update lastRead to the message timestamp to prevent re-logging the user message
      if (isInteractive && pushResult.ts) {
        await Session.updateLastRead(sessionId, pushResult.ts);
      }
    } else {
      // Check for --lock flag: abort if another agent of same type is running
      if (_G.cliFlags.lock) {
        const sessions = await Session.list();
        const runningSession = sessions.find(s =>
          s.agent === agent &&
          (s.state === 'running' || s.state === SessionState.RUNNING)
        );

        if (runningSession) {
          utils.abort(
            `Error: Another ${agent} agent is already running (session ${runningSession.session_id}, PID ${runningSession.pid || 'unknown'}).\n` +
            `Use --kill to terminate it first, or wait for it to complete.`
          );
        }
      }

      // Check for --kill flag: kill any running agent of same type
      if (_G.cliFlags.kill) {
        const sessions = await Session.list();
        const runningSessions = sessions.filter(s =>
          s.agent === agent &&
          (s.state === 'running' || s.state === SessionState.RUNNING)
        );

        for (const runningSession of runningSessions) {
          const pid = runningSession.pid;
          if (pid) {
            try {
              log('info', `🔪 Killing existing ${agent} session ${runningSession.session_id} (PID ${pid})...`);
              process.kill(pid, 'SIGKILL');

              // Wait a moment and verify process is dead
              await new Promise(resolve => setTimeout(resolve, 100));

              try {
                process.kill(pid, 0); // Check if process exists
                utils.abort(`Error: Failed to kill process ${pid}. Process is still running.`);
              } catch (e) {
                // Process is dead (expected)
                log('debug', `✅ Process ${pid} successfully terminated`);
              }
            } catch (error) {
              if (error.code === 'ESRCH') {
                // Process doesn't exist, that's fine
                log('debug', `Process ${pid} not found (already terminated)`);
              } else {
                utils.abort(`Error: Failed to kill process ${pid}: ${error.message}`);
              }
            }
          }
        }
      }

      // Create new agent session via Agent.fork() (CLI wrapper)
      log('debug', `🤖 Creating new ${agent} agent session with prompt: ${prompt}`);
      const result = await Agent.fork({ agent, prompt });
      sessionId = result.session_id;

      // Store PID in session metadata
      const sessionPath = path.join(_G.SESSIONS_DIR, `${sessionId}.yaml`);
      const sessionContent = await utils.readYaml(sessionPath);
      sessionContent.metadata.pid = process.pid;
      if (_G.cliFlags.timeout) {
        sessionContent.metadata.timeout = _G.cliFlags.timeout;
        sessionContent.metadata.startTime = new Date().toISOString();
      }
      await utils.writeYaml(sessionPath, sessionContent);

      // In interactive mode, update lastRead to prevent re-logging the initial user message
      if (isInteractive && prompt) {
        // Get the timestamp of the user message that was just added
        const messages = sessionContent.spec.messages || [];
        const lastUserMessage = messages.filter(m => m.role === 'user').pop();
        if (lastUserMessage && lastUserMessage.ts) {
          await Session.updateLastRead(sessionId, lastUserMessage.ts);
        }
      }

      log('debug', `✅ Created session ${sessionId}, now monitoring until completion...`);
    }

    // Setup timeout handler if --timeout flag is set
    let timeoutHandle = null;
    if (_G.cliFlags.timeout) {
      timeoutHandle = setTimeout(() => {
        utils.abort(
          `Error: Agent session ${sessionId} exceeded timeout of ${_G.cliFlags.timeout} seconds.\n` +
          `The session was started at ${sessionContent.metadata.startTime}.`
        );
      }, _G.cliFlags.timeout * 1000);
    }

    // V3: Use temp FSM for CLI one-shot watch
    const { FSMEngine, SessionState } = await import('../observability/fsm-engine.mjs');
    const { ChannelManager } = await import('../observability/channel-manager.mjs');
    const tempChannelManager = new ChannelManager(process.cwd(), new FSMEngine(tempChannelManager)); // Self-reference for emit
    await tempChannelManager.initialize();
    const fsmEngine = tempChannelManager.fsmEngine;

    // Ensure session registered (fork() may have done it)
    fsmEngine.registerSession(sessionId, SessionState.RUNNING); // Start immediately for one-shot

    // Promise resolver for completion
    let completeWatch = null;
    const watchCompletionPromise = isInteractive ? new Promise((resolve, reject) => {
      completeWatch = { resolve, reject };
    }) : null;

    const performAgentWatch = async () => {
      try {
        // Check FSM state
        const sessionFSM = fsmEngine.getSession(sessionId);
        if (!sessionFSM) {
          log('error', `❌ Session ${sessionId} not found in FSM`);
          if (isInteractive) {
            completeWatch.reject(new Error(`Session ${sessionId} not found`));
            return;
          }
          process.exit(1);
        }

        const state = sessionFSM.state;

        // Terminal states
        if ([SessionState.SUCCESS, SessionState.FAILED, SessionState.STOPPED].includes(state)) {
          log('debug', `✅ Session ${sessionId} completed with state: ${state}`);

          // Clear timeout
          if (timeoutHandle) clearTimeout(timeoutHandle);

          // Output final response (non-interactive)
          if (!suppressLogs && !isInteractive) {
            try {
              const sessionContent = await Session.load(sessionId);
              const messages = sessionContent.spec.messages || [];
              for (let i = messages.length - 1; i >= 0; i--) {
                if (messages[i].role === 'assistant' && messages[i].content?.trim()) {
                  console.log('\n\n' + messages[i].content);
                  break;
                }
              }
            } catch (error) {
              log('debug', `Could not retrieve final response: ${error.message}`);
            }
          }

          // Resolve/exit
          if (isInteractive) {
            if (state === SessionState.FAILED) {
              completeWatch.reject(new Error('Agent session failed'));
            } else {
              completeWatch.resolve();
            }
            return;
          } else {
            process.exit(state === SessionState.FAILED ? 1 : 0);
          }
        }

        // Process via FSM tick (single session focus)
        await fsmEngine.processSession(sessionFSM);

        // Re-check after tick
        const updatedFSM = fsmEngine.getSession(sessionId);
        if (updatedFSM && [SessionState.SUCCESS, SessionState.FAILED, SessionState.STOPPED].includes(updatedFSM.state)) {
          // Handle as above
          log('debug', `✅ Session ${sessionId} completed with state: ${updatedFSM.state}`);
          if (timeoutHandle) clearTimeout(timeoutHandle);
          if (!suppressLogs && !isInteractive) {
            try {
              const sessionContent = await Session.load(sessionId);
              const messages = sessionContent.spec.messages || [];
              for (let i = messages.length - 1; i >= 0; i--) {
                if (messages[i].role === 'assistant' && messages[i].content?.trim()) {
                  console.log('\n\n' + messages[i].content);
                  break;
                }
              }
            } catch (error) {
              log('debug', `Could not retrieve final response: ${error.message}`);
            }
          }
          if (isInteractive) {
            if (updatedFSM.state === SessionState.FAILED) {
              completeWatch.reject(new Error('Agent session failed'));
            } else {
              completeWatch.resolve();
            }
            return;
          } else {
            process.exit(updatedFSM.state === SessionState.FAILED ? 1 : 0);
          }
        }

        // Schedule next tick (100ms as in FSM)
        setTimeout(performAgentWatch, 100);

      } catch (error) {
        log('error', `❌ Agent watch failed: ${error.message}`);
        if (isInteractive) {
          completeWatch.reject(error);
          return;
        }
        process.exit(1);
      }
    };

    // Start watch
    performAgentWatch();

    if (isInteractive) {
      await watchCompletionPromise;
      return sessionId;
    } else {
      await new Promise(() => {}); // Keep alive
    }

  } catch (error) {
    log('error', `❌ Failed to execute agent: ${error.message}`);
    process.exit(1);
  }
}

function showHelp() {
  console.log(`${color.bold('d agent')} - Create and run agent until completion

Usage: d agent @<agent> <prompt> [options]
Usage: d agent -i @<agent>         (interactive REPL mode)

Description:
  Creates a new agent session and runs it to completion, blocking until
  the agent finishes. The session is monitored continuously and the final
  response is printed to stdout.

  In interactive mode (-i), the agent enters a REPL (Read-Evaluate-Print-Loop)
  where it continuously prompts for new input after each completion, maintaining
  the same session and conversation context. Press Ctrl+C to exit.

  This command is ideal for one-off tasks where you want to wait for the
  result before continuing.

Arguments:
  @<agent>      Agent template name (must start with @)
  <prompt>      Task description for the agent (optional in interactive mode)

Options:
  -t, --timeout <n>   Abort if session runs longer than <n> seconds
  -l, --lock          Abort if another instance of this agent type is running
  -k, --kill          Kill any running instance of this agent type before starting
  -i, --interactive   REPL mode - continuously prompt for input, maintain context
  --last              Suppress all logs except the final assistant message
  --no-humans         Auto-reject tool requests not on allowlist (unattended mode)

Examples:
  d agent @solo "list files in current directory"
  d agent @ada "create a subagent to write tests"
  d agent -i @solo                    # Interactive REPL mode
  d agent -k @solo "restart the task" # Kill existing, then run
  d agent -l @solo "run only one"     # Fail if already running
  d agent -t=300 @solo "long task"    # 5 minute timeout
  d agent --last @solo "quiet mode"   # Only show final response
`);
}
