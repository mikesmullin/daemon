#!/usr/bin/env node

// daemon.mjs: Multi-agent orchestrator

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'; // allow self-signed certs
process.removeAllListeners('warning'); // suppress node.js tls warnings etc.

import fs from 'fs';
import clipboardy from 'clipboardy';
import { _G } from './lib/globals.mjs';
import utils, { log } from './lib/utils.mjs';
import { Agent } from './lib/agents.mjs';
import { Session } from './lib/session.mjs';
import color from './lib/colors.mjs';

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

let logWasUndefined = false;

// parse and route command line arguments
async function parseCliArgs() {
  const args = process.argv.slice(2);

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
  new           Create a new agent session: new <agent> [prompt|-]
  push          Append message to session: push <session_id> <prompt>
  fork          Fork an existing agent session: fork <session_id> [prompt]
  eval          Ask Copilot to evaluate a session: eval <session_id>
  logs          Display chat log for a session: logs <session_id>
  tool          Execute an agent tool: tool <name> <json-args>

Options:
  --format      Output format (table|json|yaml|csv) [default: table]
  --truncate    Truncate long text fields in output
  --flatten     Flatten nested object hierarchies in output
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
          log('info', `👀 Pump completed. Processed ${result.processed}/${result.total}${sessionInfo}.`);
        } else {
          // If watching a specific session, check if it's completed
          if (_G.watchSessionId) {
            const sessions = await Agent.list();
            const targetSession = sessions.find(s => s.session_id === _G.watchSessionId);
            if (targetSession && ['success', 'fail'].includes(targetSession.bt_state)) {
              log('info', `✅ Session ${_G.watchSessionId} completed with state: ${targetSession.bt_state}`);
              log('info', `👀 Watch will continue monitoring for any state changes...`);
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
        log('info', `⛽ Pump completed. Processed ${result.processed}/${result.total} sessions.`);
      } else {
        log('info', '🥱 No pending sessions to process. 😴💤 Exiting.');
      }
    } catch (error) {
      log('error', `❌ Pump failed: ${error.message}`);
      process.exit(1);
    }
  }
})();