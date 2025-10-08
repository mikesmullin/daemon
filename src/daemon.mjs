#!/usr/bin/env node

// daemon.mjs: Multi-agent orchestrator

import fs from 'fs';
import { _G } from './lib/globals.mjs';
import {
  relWS, log, readYaml, initializeDirectories, makeDirectories, outputAs, abort
} from './lib/utils.mjs';
import { Agent } from './lib/agents.mjs';
import color from './lib/colors.mjs';

// clean up transient files in directories
async function clean() {
  for (let dir of [_G.PROC_DIR, _G.SESSIONS_DIR, _G.WORKSPACES_DIR, _G.TASKS_DIR]) {
    dir = relWS(dir);
    if (dir && fs.existsSync(dir)) {
      await fs.promises.rm(dir, { recursive: true, force: true });
      log('debug', `🧹 Cleaned directory: ${dir}`);
    }
  }
}

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
  let subcommand = 'help';
  if (args[0] && !args[0].startsWith('-')) {
    subcommand = args[0];
  }

  if (subcommand === 'clean') {
    await clean();
    await makeDirectories();
    log('info', '🧹 Clean completed. Exiting.');
    process.exit(0);
  }

  if (['pump', 'watch'].includes(subcommand)) {
    _G.mode = subcommand;
    return;
  }

  if (subcommand === 'list') {
    const sessions = await Agent.list();
    console.log(outputAs(format, sessions, { truncate, flatten }));
    process.exit(0);
  }

  if (subcommand === 'new') {
    if (args.length < 2) {
      abort(
        'Error: new requires an agent name' +
        'Usage: daemon.mjs new <agent> [prompt]');
    }

    const agent = args[1];
    const prompt = args.slice(2).join(' ') || null;

    try {
      const result = await Agent.fork({ agent, prompt });

      console.log(outputAs(format, result, { truncate, flatten }));
      process.exit(0);
    } catch (error) {
      abort(error.message);
    }
  }

  if (subcommand === 'fork') {
    if (args.length < 2) {
      abort(
        'Error: fork requires a session id' +
        'Usage: daemon.mjs fork <session_id> [prompt]');
    }

    const session_id = args[1];
    const prompt = args.slice(2).join(' ') || null;

    try {
      const result = await Agent.fork({ session_id, prompt });
      if (prompt) result.initial_prompt = prompt;

      console.log(outputAs(format, result, { truncate, flatten }));
      process.exit(0);
    } catch (error) {
      abort(error.message);
    }
  }

  if (subcommand === 'push') {
    if (args.length < 3) {
      abort(
        `Error: push requires a session ID and prompt` +
        `Usage: daemon.mjs push <session_id> <prompt>`);
    }

    const sessionId = args[1];
    const prompt = args.slice(2).join(' ');

    try {
      const result = await Agent.push(sessionId, prompt);
      console.log(outputAs(format, result, { truncate, flatten }));
      process.exit(0);
    } catch (error) {
      abort(error.message);
    }
  }

  if (subcommand === 'eval') {
    if (args.length < 2) {
      abort(
        `Error: eval requires a session ID` +
        `Usage: daemon.mjs eval <session_id>`);
    }

    const sessionId = args[1];

    try {
      const result = await Agent.eval(sessionId);
      console.log(outputAs(format, result, { truncate, flatten }));
      process.exit(0);
    } catch (error) {
      abort(error.message);
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
      console.log(outputAs(format, tools, { truncate, flatten }));
      process.exit(0);
    }

    if (args.length < 3) {
      abort(
        `Error: tool requires a tool name and JSON arguments.\n` +
        `Usage: daemon.mjs tool <name> <json-args>`);
    }

    try {
      const toolName = args[1];
      const jsonArgs = args.slice(2).join(' ');
      const toolArgs = JSON.parse(jsonArgs);
      const result = await Agent.tool(toolName, toolArgs);
      console.log(outputAs(format, result, { truncate, flatten }));
      process.exit(0);
    } catch (error) {
      abort(error.message);
    }
  }

  console.log('👺 Multi-Agent Orchestrator Daemon\n')
  if (subcommand != 'help') {
    console.error(`  Unknown subcommand.\n`);
  }
  console.log(`Usage: daemon.mjs <subcommand> [options]

Subcommands:
  help          Show this help message (default)
  clean         Remove transient state (proc, sessions, workspaces)
  pump          Run one iteration and exit
  watch         Run continuously, checking-in at intervals
  list          List all agent sessions
  new           Create a new agent session: new <agent> [prompt]
  push          Append message to session: push <session_id> <prompt>
  fork          Fork an existing agent session: fork <session_id> [prompt]
  eval          Ask Copilot to evaluate a session: eval <session_id>
  tool          Execute an agent tool: tool <name> <json-args>

Options:
  --format      Output format (table|json|yaml|csv) [default: table]
  --truncate    Truncate long text fields in output
  --flatten     Flatten nested object hierarchies in output
`);
  process.exit(0);
}

// main
(async () => {
  initializeDirectories();
  _G.CONFIG = await readYaml(_G.CONFIG_PATH);
  await makeDirectories();
  await parseCliArgs();

  log('info', `👺🚀 ${color.bold('Multi-Agent Orchestrator Daemon')} starting`);

  if ('pump' == _G.mode) {
    log('debug', `⛽ ${color.bold('PUMP MODE:')} Will run one iteration and exit`);
  }

  // testing
  const sessions = await Agent.list();
  console.debug(`Found ${sessions.length} active session(s)`, sessions);

  const a1 = await Agent.fork('planner');
  console.debug(`Forked new agent session: ${a1}`);
  const as1 = await Agent.state(a1);
  console.debug(`Session ${a1} state: ${as1}`);

  const a2 = await Agent.fork('executor');
  console.debug(`Forked new agent session: ${a2}`);
  const as2 = await Agent.state(a2);
  console.debug(`Session ${a2} state: ${as2}`);

  // const response = await Agent.eval(a1);
  // console.debug(`Session ${a1} evaluation response:`, response);

  if ('watch' == _G.mode) {
    log('debug', `👀 ${color.bold('WATCH MODE:')} Will run continuously and check in at ${_G.CONFIG.daemon.checkin_interval} second interval`);
    setInterval(() => {
      console.log(`Daemon checking-in...`);
    }, _G.CONFIG.daemon.checkin_interval * 1000);
  }

  if ('pump' == _G.mode) {
    log('debug', '🥱 Daemon has nothing to do. 😴💤 Exiting.');
  }
})();