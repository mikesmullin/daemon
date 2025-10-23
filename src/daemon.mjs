#!/usr/bin/env node

// daemon.mjs: Multi-agent orchestrator

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'; // allow self-signed certs
process.removeAllListeners('warning'); // suppress node.js tls warnings etc.

import fs from 'fs';
import path from 'path';
import clipboardy from 'clipboardy';
import dotenv from 'dotenv';
import { _G } from './lib/globals.mjs';
import utils, { log } from './lib/utils.mjs';
import { Agent } from './lib/agents.mjs';
import { Session } from './lib/session.mjs';
import color from './lib/colors.mjs';
import { handleMcpCommand } from './cli/mcp.mjs';
import { MCPClient } from './lib/mcp-client.mjs';

// Load environment variables
dotenv.config();

// Cleanup MCP servers on exit
process.on('SIGINT', async () => {
  log('info', '\n🛑 Shutting down...');
  await MCPClient.stopAllServers();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  log('info', '\n🛑 Shutting down...');
  await MCPClient.stopAllServers();
  process.exit(0);
});

// clean up transient files in directories
async function clean() {
  for (let dir of [_G.PROC_DIR, _G.SESSIONS_DIR, _G.WORKSPACES_DIR, _G.TASKS_DIR]) {
    dir = utils.relWS(dir);
    if (dir && fs.existsSync(dir)) {
      await fs.promises.rm(dir, { recursive: true, force: true });
      log('debug', `🧹 Cleaned directory: ${dir}`);
    }
  }
}

async function getConfig() {
  _G.CONFIG = await utils.readYaml(_G.CONFIG_PATH);
}

// Execute an agent with the given prompt
async function executeAgent(agent, prompt, suppressLogs = false) {
  if (!prompt) {
    utils.abort(
      'Error: agent requires a prompt after @<agent>\n' +
      'Usage: d agent @<agent> <prompt>\n' +
      'Example: d agent @solo run command: whoami');
  }

  try {
    await getConfig();

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
        if (['success', 'fail'].includes(targetSession.bt_state)) {
          log('debug', `✅ Session ${sessionId} completed with state: ${targetSession.bt_state}`);

          // Output the final assistant response to console
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

          if (targetSession.bt_state === 'fail') {
            process.exit(1);
          } else {
            process.exit(0);
          }
        }

        // Process the session if it's pending
        if (targetSession.bt_state === 'pending') {
          log('debug', `🔄 Processing session ${sessionId} (${targetSession.agent})`);
          await Agent.eval(sessionId);

          // Immediately re-check session state after processing
          // This allows for immediate exit instead of waiting for next interval
          const updatedSessions = await Agent.list();
          const updatedSession = updatedSessions.find(s => s.session_id === sessionId);

          if (updatedSession && ['success', 'fail'].includes(updatedSession.bt_state)) {
            log('debug', `✅ Session ${sessionId} completed with state: ${updatedSession.bt_state}`);

            // Clear timeout if set
            if (timeoutHandle) {
              clearTimeout(timeoutHandle);
            }

            // Output the final assistant response to console
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

            if (updatedSession.bt_state === 'fail') {
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

let logWasUndefined = false;

// parse and route command line arguments
async function parseCliArgs() {
  const args = process.argv.slice(2);

  // Parse global flags
  let timeout = null;
  let lock = false;
  let kill = false;
  let interactive = false;
  let noHumans = false;

  // Parse -t=<n> or --timeout=<n>
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('-t=')) {
      timeout = parseInt(args[i].substring(3), 10);
      args.splice(i, 1);
      i--;
    } else if (args[i].startsWith('--timeout=')) {
      timeout = parseInt(args[i].substring(10), 10);
      args.splice(i, 1);
      i--;
    } else if (args[i] === '-t' || args[i] === '--timeout') {
      if (i + 1 < args.length) {
        timeout = parseInt(args[i + 1], 10);
        args.splice(i, 2);
        i--;
      }
    }
  }

  // Parse -l or --lock
  const lockIndex = args.findIndex(arg => arg === '-l' || arg === '--lock');
  if (lockIndex !== -1) {
    lock = true;
    args.splice(lockIndex, 1);
  }

  // Parse -k or --kill
  const killIndex = args.findIndex(arg => arg === '-k' || arg === '--kill');
  if (killIndex !== -1) {
    kill = true;
    args.splice(killIndex, 1);
  }

  // Parse -i or --interactive
  const interactiveIndex = args.findIndex(arg => arg === '-i' || arg === '--interactive');
  if (interactiveIndex !== -1) {
    interactive = true;
    args.splice(interactiveIndex, 1);
  }

  // Parse --no-humans
  const noHumansIndex = args.findIndex(arg => arg === '--no-humans');
  if (noHumansIndex !== -1) {
    noHumans = true;
    args.splice(noHumansIndex, 1);
  }

  // Store global flags in _G for access throughout the app
  _G.cliFlags = { timeout, lock, kill, interactive, noHumans };

  // Parse --format flag
  let format = 'table';
  const formatIndex = args.indexOf('--format');
  if (formatIndex !== -1 && formatIndex + 1 < args.length) {
    format = args[formatIndex + 1];
    args.splice(formatIndex, 2); // Remove --format and its value
  }

  // Parse --truncate flag
  let truncate = false;
  const truncateIndex = args.indexOf('--truncate');
  if (truncateIndex !== -1) {
    truncate = true;
    args.splice(truncateIndex, 1); // Remove --truncate flag
  }

  // Parse --flatten flag
  let flatten = false;
  const flattenIndex = args.indexOf('--flatten');
  if (flattenIndex !== -1) {
    flatten = true;
    args.splice(flattenIndex, 1); // Remove --flatten flag
  }

  // Parse --last flag
  let last = false;
  const lastIndex = args.indexOf('--last');
  if (lastIndex !== -1) {
    last = true;
    args.splice(lastIndex, 1); // Remove --last flag
  }

  // Determine subcommand (first non-option arg after flags are removed) - default is 'help'
  let subcommand = '';
  if (args[0] && !args[0].startsWith('-')) {
    subcommand = args[0];
  }

  if (subcommand === 'clean') {
    await clean();
    await utils.makeDirectories();
    log('info', '🧹 Clean completed. Exiting.');
    process.exit(0);
  }

  if (['pump', 'watch'].includes(subcommand)) {
    _G.mode = subcommand;

    // For watch mode, capture optional session_id argument
    if (subcommand === 'watch' && args[1]) {
      _G.watchSessionId = args[1];
    }

    return;
  }

  if (subcommand === 'sessions') {
    const sessions = await Agent.list();
    console.log(utils.outputAs(format, sessions, { truncate, flatten }));
    process.exit(0);
  }

  if (subcommand === 'models') {
    const { registry } = await import('./lib/ai-providers/registry.mjs');
    log('info', '🔍 Listing available models from all configured providers...\n');

    const results = await registry.listAllModels();

    // Format output based on requested format
    if (format === 'json') {
      console.log(JSON.stringify(results, null, 2));
    } else if (format === 'yaml') {
      const yaml = await import('js-yaml');
      console.log(yaml.dump(results));
    } else {
      // Table format (default)
      for (const providerResult of results) {
        const statusIcon = providerResult.configured ? '✅' : '❌';
        console.log(`\n${statusIcon} ${color.bold(providerResult.provider.toUpperCase())}`);

        if (!providerResult.configured) {
          console.log(`   ${color.yellow('Not configured - missing API key or configuration')}`);
        } else if (providerResult.error) {
          console.log(`   ${color.red('Error: ' + providerResult.error)}`);
        } else if (providerResult.models.length === 0) {
          console.log(`   ${color.gray('No models available')}`);
        } else {
          console.log(`   ${color.gray(`${providerResult.count} models available:`)}`);
          for (const model of providerResult.models) {
            console.log(`   • ${color.cyan(model.id)} - ${model.description || model.name}`);
          }
        }
      }
      console.log('');
    }

    process.exit(0);
  }

  if (subcommand === 'mcp') {
    await getConfig();
    await handleMcpCommand(args, format, { truncate, flatten });
  }

  if (subcommand === 'new') {
    if (args.length < 2) {
      utils.abort(
        'Error: new requires an agent name\n' +
        'Usage: daemon.mjs new <agent> [prompt|-]');
    }

    const agent = args[1];
    let prompt = args.slice(2).join(' ') || null;

    // Handle stdin input
    const stdinData = await utils.readStdin();

    if (prompt === '-') {
      // Explicit stdin request
      if (!stdinData) {
        utils.abort('Error: No stdin provided when "-" specified for prompt');
      }
      prompt = stdinData;
    } else if (stdinData) {
      // Append stdin to existing prompt or use as prompt if none provided
      prompt = prompt ? `${prompt} ${stdinData}` : stdinData;
    }

    try {
      const result = await Agent.fork({ agent, prompt });

      console.log(utils.outputAs(format, result, { truncate, flatten }));
      process.exit(0);
    } catch (error) {
      utils.abort(error.message);
    }
  }

  if (subcommand === 'fork') {
    if (args.length < 2) {
      utils.abort(
        'Error: fork requires a session id' +
        'Usage: daemon.mjs fork <session_id> [prompt]');
    }

    const session_id = args[1];
    const prompt = args.slice(2).join(' ') || null;

    try {
      const result = await Agent.fork({ session_id, prompt });
      if (prompt) result.initial_prompt = prompt;

      console.log(utils.outputAs(format, result, { truncate, flatten }));
      process.exit(0);
    } catch (error) {
      utils.abort(error.message);
    }
  }

  if (subcommand === 'push') {
    if (args.length < 3) {
      utils.abort(
        `Error: push requires a session ID and prompt` +
        `Usage: daemon.mjs push <session_id> <prompt>`);
    }

    const sessionId = args[1];
    const prompt = args.slice(2).join(' ');

    try {
      const result = await Agent.push(sessionId, prompt);
      console.log(utils.outputAs(format, result, { truncate, flatten }));
      process.exit(0);
    } catch (error) {
      utils.abort(error.message);
    }
  }

  if (subcommand === 'eval') {
    if (args.length < 2) {
      utils.abort(
        `Error: eval requires a session ID` +
        `Usage: daemon.mjs eval <session_id>`);
    }

    const sessionId = args[1];

    try {
      await getConfig();
      const result = await Agent.eval(sessionId);
      console.log(utils.outputAs(format, result, { truncate, flatten }));
      process.exit(0);
    } catch (error) {
      utils.abort(error.message);
    }
  }

  if (subcommand === 'logs') {
    if (args.length < 2) {
      utils.abort(
        `Error: logs requires a session ID.\n` +
        `Usage: d logs <session_id>`);
    }

    try {
      const session_id = args[1];
      const sessionContent = await Session.load(session_id);

      console.log(`\n👺 Session ${session_id} (${sessionContent.metadata.name}) Chat Log\n`);

      // Use Session.logConversation to display all messages
      if (sessionContent.spec.messages && sessionContent.spec.messages.length > 0) {
        Session.logConversation(sessionContent.spec.messages);
      } else {
        console.log('No messages in this session yet.');
      }

      process.exit(0);
    } catch (error) {
      utils.abort(error.message);
    }
  }

  if (subcommand === 'agent') {
    // Handle interactive mode
    if (_G.cliFlags.interactive) {
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
      const { prompt: tuiPrompt } = await import('./lib/tui.mjs');

      log('debug', `🤖 Interactive mode: collecting prompt for ${agent} agent...`);
      const collectedPrompt = await tuiPrompt('> ');

      if (!collectedPrompt || !collectedPrompt.trim()) {
        utils.abort('Error: No prompt provided');
      }

      // Continue with the collected prompt
      const fullPrompt = `@${agent} ${collectedPrompt}`;

      // If --last flag is set, suppress all logs except errors
      if (last) {
        process.env.LOG = 'error';
      }

      const prompt = collectedPrompt.trim();

      // Jump to agent execution logic (same as below)
      await executeAgent(agent, prompt, last);
      // Note: executeAgent never returns - it exits the process when done
    }

    // Non-interactive mode (original logic)
    if (args.length < 2) {
      utils.abort(
        'Error: agent requires a prompt starting with @<agent>\n' +
        'Usage: d agent @<agent> <prompt>\n' +
        'Example: d agent @solo run command: whoami');
    }

    // If --last flag is set, suppress all logs except errors
    if (last) {
      process.env.LOG = 'error';
    }

    let fullPrompt = args.slice(1).join(' ');

    // Handle stdin input (same logic as 'd new')
    const stdinData = await utils.readStdin();

    if (fullPrompt === '-') {
      // Explicit stdin request
      if (!stdinData) {
        utils.abort('Error: No stdin provided when "-" specified for prompt');
      }
      fullPrompt = stdinData;
    } else if (stdinData) {
      // Append stdin to existing prompt or use as prompt if none provided
      fullPrompt = fullPrompt ? `${fullPrompt} ${stdinData}` : stdinData;
    }

    // Parse @<agent> from the beginning of the prompt
    const agentMatch = fullPrompt.match(/^@([\w-]+)\s*([\s\S]*)$/);
    if (!agentMatch) {
      utils.abort(
        'Error: agent prompt must start with @<agent>\n' +
        `Received prompt: "${fullPrompt}"\n` +
        'Usage: d agent @<agent> <prompt>\n' +
        'Example: d agent @solo run command: whoami');
    }

    const agent = agentMatch[1];
    const prompt = agentMatch[2].trim();

    // Execute the agent
    await executeAgent(agent, prompt, last);
    // Note: executeAgent never returns - it exits the process when done
  }

  if (subcommand === 'tool') {
    if (args.length < 2) {
      const tools = Object.keys(_G.tools).map(name => {
        return {
          name,
          description: _G.tools[name].definition.function.description || '',
          params:
            ['json', 'yaml'].includes(format) ?
              _G.tools[name]?.definition?.function?.parameters?.properties :
              Object.keys(_G.tools[name]?.definition?.function?.parameters?.properties || {}).join(', '),
        };
      });
      console.log(utils.outputAs(format, tools, { truncate, flatten }));
      process.exit(0);
    }

    if (args.length < 3) {
      utils.abort(
        `Error: tool requires a tool name and JSON arguments.\n` +
        `Usage: daemon.mjs tool <name> <json-args>`);
    }

    try {
      const toolName = args[1];
      const jsonArgs = args.slice(2).join(' ');
      const toolArgs = JSON.parse(jsonArgs);
      const result = await Agent.tool(toolName, toolArgs);
      console.log(utils.outputAs(format, result, { truncate, flatten }));
      process.exit(0);
    } catch (error) {
      utils.abort(error.message);
    }
  }

  if (subcommand === 'help' || 0 == args.length) {
    console.log('👺 Multi-Agent Orchestrator Daemon\n')

    if (subcommand != 'help') {
      console.error(`  Unknown subcommand.\n`);
    }
    console.log(`Usage: d <subcommand> [options]
Usage: d <prompt>

Subcommands:
  help          Show this help message (default)
  clean         Remove transient state (proc, sessions, workspaces)
  pump          Run one iteration and exit
  watch         Run continuously, checking-in at intervals: watch [session_id]
  sessions      List all agent sessions
  models        List available AI models from all configured providers
  new           Create a new agent session: new <agent> [prompt|-]
  agent         Create agent session and run until completion: agent @<agent> <prompt>
  push          Append message to session: push <session_id> <prompt>
  fork          Fork an existing agent session: fork <session_id> [prompt]
  eval          Ask Copilot to evaluate a session: eval <session_id>
  logs          Display chat log for a session: logs <session_id>
  tool          Execute an agent tool: tool <name> <json-args>
  mcp           Manage MCP servers: mcp <list|start|stop|discover|add>

Global Options:
  -t=<n>, --timeout=<n>   Abort if session runs longer than <n> seconds
  -l, --lock              Abort if another instance of this agent type is running
  -k, --kill              Kill any running instance of this agent type before starting
  -i, --interactive       (agent only) Prompt for input using multi-line text editor
  --no-humans             Auto-reject tool requests not on allowlist (unattended mode)

Format Options:
  --format      Output format (table|json|yaml|csv) [default: table]
  --truncate    Truncate long text fields in output
  --flatten     Flatten nested object hierarchies in output
  --last        (agent only) Suppress all logs except the final assistant message
`);
    process.exit(0);
  }

  // quick-prompt
  {
    if (logWasUndefined) process.env.LOG = ''; // only show warnings
    await getConfig();
    const prompt = args.join(' ');
    const result = await Agent.prompt({
      // model: 'grok-code-fast-1',
      // model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content:
            `You are a command line expert. ` +
            `The user wants to run a command but they don't know how. ` +
            `Return ONLY the exact shell command needed. ` +
            `Do not prepend with an explanation, no markdown, no code blocks -- ` +
            `just return the raw command you think will solve their query.`
        },
        {
          role: 'user',
          content: prompt
        }
      ],
    });
    const response = result?.choices[0]?.message?.content;
    console.log(`    ${color.yellow(response)}`);

    // Copy to clipboard
    try {
      await clipboardy.write(response);
    } catch (error) {
      console.log(`${color.red(`❌ Failed to copy to clipboard: ${error.message}`)}`);
    }

    process.exit(0);
  }
}

// main
(async () => {
  if (undefined == process.env.LOG) {
    logWasUndefined = true;
    process.env.LOG = '*'; // show all logs
  }
  utils.initializeDirectories();
  await utils.makeDirectories();
  await getConfig();
  await parseCliArgs();

  log('debug', `👺🚀 ${color.bold('Multi-Agent Orchestrator Daemon')} starting`);

  // Show session info for watch mode and debugging
  if ('watch' == _G.mode) {
    const sessionInfo = _G.watchSessionId ? ` session ${_G.watchSessionId}` : ' all sessions';
    log('debug', `👀 ${color.bold('WATCH MODE:')} Will run continuously and pump${sessionInfo} every ${_G.CONFIG.daemon.watch_poll_interval} seconds`);

    const watchIntervalMs = _G.CONFIG.daemon.watch_poll_interval * 1000;
    let lastIterationStart = 0;

    // Define the watch pump function with serial execution
    const performWatchPump = async () => {
      try {
        const iterationStart = Date.now();
        const sessionInfo = _G.watchSessionId ? ` session ${_G.watchSessionId}` : ' sessions';
        log('debug', `👀 Checking for pending${sessionInfo}...`);
        const result = await Agent.pump();

        if (result.processed > 0) {
          log('debug', `👀 Pump completed. Processed ${result.processed}/${result.total}${sessionInfo}.`);
        } else {
          // If watching a specific session, check if it's completed
          if (_G.watchSessionId) {
            const sessions = await Agent.list();
            const targetSession = sessions.find(s => s.session_id === _G.watchSessionId);
            if (targetSession && ['success', 'fail'].includes(targetSession.bt_state)) {
              log('debug', `✅ Session ${_G.watchSessionId} completed with state: ${targetSession.bt_state}`);
              log('debug', `👀 Watch will continue monitoring for any state changes...`);
            } else if (!targetSession) {
              log('warn', `⚠️  Session ${_G.watchSessionId} not found. Continuing to monitor...`);
            }
          }
          log('debug', `👀 No pending${sessionInfo} to process.`);
        }

        // Calculate elapsed time for this iteration
        const iterationEnd = Date.now();
        const iterationDuration = iterationEnd - iterationStart;

        // Calculate how long since the last iteration started
        const timeSinceLastStart = lastIterationStart ? iterationStart - lastIterationStart : 0;
        lastIterationStart = iterationStart;

        // Calculate remaining time until next interval
        // If iteration took longer than interval, run immediately (delay = 0)
        // Otherwise, wait for the remaining time to maintain the interval
        const remainingDelay = Math.max(0, watchIntervalMs - timeSinceLastStart);

        log('debug', `⏱️ Iteration took ${iterationDuration}ms, next run in ${remainingDelay}ms`);

        // Schedule next pump iteration (serial execution ensures no overlapping)
        setTimeout(performWatchPump, remainingDelay);

      } catch (error) {
        log('error', `❌ Pump failed: ${error.message}`);
        // Still schedule next iteration even if this one failed
        setTimeout(performWatchPump, watchIntervalMs);
      }
    };

    // Run initial pump
    await performWatchPump();

    log('info', '👀 Watch mode started with serial execution. Press Ctrl+C to stop.');
  }

  if ('pump' == _G.mode) {
    log('debug', `⛽ ${color.bold('PUMP MODE:')} Will run one iteration and exit`);
    try {
      const result = await Agent.pump();
      if (result.processed > 0) {
        log('debug', `⛽ Pump completed. Processed ${result.processed}/${result.total} sessions.`);
      } else {
        log('debug', '🥱 No pending sessions to process. 😴💤 Exiting.');
      }
    } catch (error) {
      log('error', `❌ Pump failed: ${error.message}`);
      process.exit(1);
    }
  }
})();