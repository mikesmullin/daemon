/**
 * Agent CLI Command
 * 
 * Handles the `d agent` subcommand for creating and running agents to completion
 */

import path from 'path';
import { _G } from '../lib/globals.mjs';
import { Agent } from '../lib/agents.mjs';
import utils, { log } from '../lib/utils.mjs';
import color from '../lib/colors.mjs';

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
  const agentMatch = fullPrompt.match(/^@([\w-]+)\s+(.+)$/);

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
  const agentMatch = agentArg.match(/^@([\w-]+)$/);

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

  log('debug', `🤖 Interactive mode: collecting prompt for ${agent} agent...`);
  const collectedPrompt = await tuiPrompt('> ');

  if (!collectedPrompt || !collectedPrompt.trim()) {
    utils.abort('Error: No prompt provided');
  }

  // Execute with the collected prompt
  await executeAgent(agent, collectedPrompt, last);
}

async function executeAgent(agent, prompt, suppressLogs = false) {
  if (!prompt) {
    utils.abort(
      'Error: agent requires a prompt after @<agent>\n' +
      'Usage: d agent @<agent> <prompt>\n' +
      'Example: d agent @solo run command: whoami');
  }

  try {
    // Load config (needed for AI provider settings)
    _G.CONFIG = await utils.readYaml(_G.CONFIG_PATH);

    // Check for --lock flag: abort if another agent of same type is running
    if (_G.cliFlags.lock) {
      const sessions = await Agent.list();
      const runningSession = sessions.find(s =>
        s.agent === agent &&
        s.state === 'running'
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
      const sessions = await Agent.list();
      const runningSessions = sessions.filter(s =>
        s.agent === agent &&
        s.state === 'running'
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

    // Create new agent session
    log('debug', `🤖 Creating new ${agent} agent session with prompt: ${prompt}`);
    const result = await Agent.fork({ agent, prompt });
    const sessionId = result.session_id;

    // Store PID in session metadata
    const sessionPath = path.join(_G.SESSIONS_DIR, `${sessionId}.yaml`);
    const sessionContent = await utils.readYaml(sessionPath);
    sessionContent.metadata.pid = process.pid;
    if (_G.cliFlags.timeout) {
      sessionContent.metadata.timeout = _G.cliFlags.timeout;
      sessionContent.metadata.startTime = new Date().toISOString();
    }
    await utils.writeYaml(sessionPath, sessionContent);

    log('debug', `✅ Created session ${sessionId}, now monitoring until completion...`);

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

    // Enter focused watch mode for this specific session
    const watchIntervalMs = _G.CONFIG.daemon.watch_poll_interval * 1000;
    let lastIterationStart = 0;

    const performAgentWatch = async () => {
      try {
        const iterationStart = Date.now();
        log('debug', `👀 Checking session ${sessionId}...`);

        // Check session state before pumping
        const sessions = await Agent.list();
        const targetSession = sessions.find(s => s.session_id === sessionId);

        if (!targetSession) {
          log('error', `❌ Session ${sessionId} not found`);
          process.exit(1);
        }

        // If session is already in terminal state, we're done
        if (['success', 'fail'].includes(targetSession.state)) {
          log('debug', `✅ Session ${sessionId} completed with state: ${targetSession.state}`);

          // Output the final assistant response to console
          if (!suppressLogs) {
            try {
              const sessionFileName = `${sessionId}.yaml`;
              const sessionPath = path.join(_G.SESSIONS_DIR, sessionFileName);
              const sessionContent = await utils.readYaml(sessionPath);
              const messages = sessionContent.spec.messages || [];

              // Find the last assistant message with content
              for (let i = messages.length - 1; i >= 0; i--) {
                if (messages[i].role === 'assistant' && messages[i].content && messages[i].content.trim()) {
                  console.log('\n\n' + messages[i].content);
                  break;
                }
              }
            } catch (error) {
              log('debug', `Could not retrieve final response: ${error.message}`);
            }
          }

          if (targetSession.state === 'fail') {
            process.exit(1);
          } else {
            process.exit(0);
          }
        }

        // Process the session if it's pending
        if (targetSession.state === 'pending') {
          log('debug', `🔄 Processing session ${sessionId} (${targetSession.agent})`);
          await Agent.eval(sessionId);

          // Immediately re-check session state after processing
          const updatedSessions = await Agent.list();
          const updatedSession = updatedSessions.find(s => s.session_id === sessionId);

          if (updatedSession && ['success', 'fail'].includes(updatedSession.state)) {
            log('debug', `✅ Session ${sessionId} completed with state: ${updatedSession.state}`);

            // Clear timeout if set
            if (timeoutHandle) {
              clearTimeout(timeoutHandle);
            }

            // Output the final assistant response to console
            if (!suppressLogs) {
              try {
                const sessionFileName = `${sessionId}.yaml`;
                const sessionPath = path.join(_G.SESSIONS_DIR, sessionFileName);
                const sessionContent = await utils.readYaml(sessionPath);
                const messages = sessionContent.spec.messages || [];

                // Find the last assistant message with content
                for (let i = messages.length - 1; i >= 0; i--) {
                  if (messages[i].role === 'assistant' && messages[i].content && messages[i].content.trim()) {
                    console.log('\n\n' + messages[i].content);
                    break;
                  }
                }
              } catch (error) {
                log('debug', `Could not retrieve final response: ${error.message}`);
              }
            }

            if (updatedSession.state === 'fail') {
              process.exit(1);
            } else {
              process.exit(0);
            }
          }
        }

        // Calculate timing for next iteration
        const iterationEnd = Date.now();
        const iterationDuration = iterationEnd - iterationStart;
        const timeSinceLastStart = lastIterationStart ? iterationStart - lastIterationStart : 0;
        lastIterationStart = iterationStart;

        const remainingDelay = Math.max(0, watchIntervalMs - timeSinceLastStart);
        log('debug', `⏱️ Iteration took ${iterationDuration}ms, next run in ${remainingDelay}ms`);

        // Schedule next iteration
        setTimeout(performAgentWatch, remainingDelay);

      } catch (error) {
        log('error', `❌ Agent watch failed: ${error.message}`);
        process.exit(1);
      }
    };

    // Start the focused watch loop
    performAgentWatch();

    // Keep the process alive - the watch loop will exit via process.exit() when done
    await new Promise(() => { }); // Never resolves

  } catch (error) {
    log('error', `❌ Failed to execute agent: ${error.message}`);
    process.exit(1);
  }
}

function showHelp() {
  console.log(`${color.bold('d agent')} - Create and run agent until completion

Usage: d agent @<agent> <prompt> [options]
Usage: d agent -i @<agent>         (interactive mode)

Description:
  Creates a new agent session and runs it to completion, blocking until
  the agent finishes. The session is monitored continuously and the final
  response is printed to stdout.

  This command is ideal for one-off tasks where you want to wait for the
  result before continuing.

Arguments:
  @<agent>      Agent template name (must start with @)
  <prompt>      Task description for the agent

Options:
  -t, --timeout <n>   Abort if session runs longer than <n> seconds
  -l, --lock          Abort if another instance of this agent type is running
  -k, --kill          Kill any running instance of this agent type before starting
  -i, --interactive   Prompt for input using multi-line text editor
  --last              Suppress all logs except the final assistant message
  --no-humans         Auto-reject tool requests not on allowlist (unattended mode)

Examples:
  d agent @solo "list files in current directory"
  d agent @ada "create a subagent to write tests"
  d agent -i @solo                    # Interactive mode
  d agent -k @solo "restart the task" # Kill existing, then run
  d agent -l @solo "run only one"     # Fail if already running
  d agent -t=300 @solo "long task"    # 5 minute timeout
  d agent --last @solo "quiet mode"   # Only show final response
`);
}
