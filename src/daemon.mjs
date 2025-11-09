#!/usr/bin/env node

// daemon.mjs: Multi-agent orchestrator

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'; // allow self-signed certs
process.removeAllListeners('warning'); // suppress node.js tls warnings etc.

import clipboardy from 'clipboardy';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { _G } from './lib/globals.mjs';
import utils, { log } from './lib/utils.mjs';
import { Agent } from './lib/agents.mjs';
import color from './lib/colors.mjs';
import { MCPClient } from './lib/mcp-client.mjs';

// Import CLI command handlers
import { handleSessionsCommand } from './cli/sessions.mjs';
import { handleModelsCommand } from './cli/models.mjs';
import { handleCleanCommand } from './cli/clean.mjs';
import { handleWatchCommand } from './cli/watch.mjs';
import { handleAgentCommand } from './cli/agent.mjs';
import { handleToolCommand } from './cli/tool.mjs';
import { handleMcpCommand } from './cli/mcp.mjs';

// Get directory of this script to find .env file
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const workspaceRoot = join(__dirname, '..');

// Load environment variables from workspace root
dotenv.config({ path: join(workspaceRoot, '.env') });

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

async function getConfig() {
  _G.CONFIG = await utils.readYaml(_G.CONFIG_PATH);
}

let logWasUndefined = false;

// Parse and route command line arguments
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

  // Parse --no-humans or --no-human
  const noHumansIndex = args.findIndex(arg => arg === '--no-humans' || arg === '--no-human');
  if (noHumansIndex !== -1) {
    noHumans = true;
    args.splice(noHumansIndex, 1);
  }

  // Parse --session <session_id> (for watch/pump modes)
  let session = null;
  const sessionIndex = args.indexOf('--session');
  if (sessionIndex !== -1 && sessionIndex + 1 < args.length) {
    session = args[sessionIndex + 1];
    args.splice(sessionIndex, 2);
  }

  // Parse --labels <label1,label2,...> (for watch/pump/sessions modes)
  let labels = [];
  const labelsIndex = args.indexOf('--labels');
  if (labelsIndex !== -1 && labelsIndex + 1 < args.length) {
    const labelsStr = args[labelsIndex + 1];
    labels = labelsStr.split(',').map(l => l.trim()).filter(l => l.length > 0);
    args.splice(labelsIndex, 2);
  }

  // Store global flags in _G for access throughout the app
  _G.cliFlags = { timeout, lock, kill, interactive, noHumans, session, labels };

  // Parse --format flag
  let format = 'table';
  const formatIndex = args.indexOf('--format');
  if (formatIndex !== -1 && formatIndex + 1 < args.length) {
    format = args[formatIndex + 1];
    args.splice(formatIndex, 2);
  }

  // Parse truncate flag - default to true, use --all to disable
  let truncate = true;
  const allIndex = args.indexOf('--all');
  if (allIndex !== -1) {
    truncate = false;
    args.splice(allIndex, 1);
  }

  // Parse --flatten flag
  let flatten = false;
  const flattenIndex = args.indexOf('--flatten');
  if (flattenIndex !== -1) {
    flatten = true;
    args.splice(flattenIndex, 1);
  }

  // Parse --last flag
  let last = false;
  const lastIndex = args.indexOf('--last');
  if (lastIndex !== -1) {
    last = true;
    args.splice(lastIndex, 1);
  }

  // Package options for commands
  const options = { truncate, flatten, labels };

  // Determine subcommand (first non-option arg after flags are removed)
  const subcommand = (args[0] && !args[0].startsWith('-')) ? args[0] : '';

  // Route to appropriate CLI handler
  switch (subcommand) {
    case 'clean':
      await handleCleanCommand(args);
      break;

    case 'session':
    case 'sessions':
      await handleSessionsCommand(args, format, options);
      break;

    case 'model':
    case 'models':
      await handleModelsCommand(args, format);
      break;

    case 'mcp':
      await getConfig();
      await handleMcpCommand(args, format, options);
      break;

    case 'agent':
      await handleAgentCommand(args, last);
      break;

    case 'tool':
    case 'tools':
      await handleToolCommand(args, format, options);
      break;

    case 'watch':
      await handleWatchCommand(args);
      break;

    case 'help':
      showHelp();
      process.exit(0);
      break;

    case '':
      // No subcommand provided
      showHelp();
      process.exit(0);
      break;

    default:
      // Check if it's a quick-prompt (doesn't start with @ or -)
      if (!subcommand.startsWith('@') && !subcommand.startsWith('-')) {
        await handleQuickPrompt(args);
      } else {
        console.error(`Unknown subcommand: ${subcommand}\n`);
        showHelp();
        process.exit(1);
      }
  }
}

function showHelp() {
  console.log('👺 Multi-Agent Orchestrator Daemon\n');
  console.log(`Usage: d <subcommand> [options]
Usage: d <prompt>                (quick-prompt mode)

Subcommands:
  help          Show this help message
  clean         Remove transient state (proc, sessions, workspaces)
  watch         Run continuously, monitoring sessions
  sessions      List all agent sessions
  models        List available AI models from all providers
  agent         Create and run agent until completion
  tool          Execute an agent tool directly
  mcp           Manage MCP servers

Global Options:
  -t, --timeout <n>   Abort if session runs longer than <n> seconds
  -l, --lock          Abort if another instance of this agent type is running
  -k, --kill          Kill any running instance of this agent type before starting
  -i, --interactive   (agent only) Prompt for input using multi-line text editor
  --no-humans         Auto-reject tool requests not on allowlist (unattended mode)

Format Options:
  --format <format>   Output format: table (default), json, yaml, csv
  --all               Show full untruncated text fields (table format only)
  --flatten           Flatten nested object hierarchies in output

For detailed help on a specific subcommand, run:
  d <subcommand> help

Examples:
  d help                    # Show this help
  d sessions help           # Show sessions subcommand help
  d watch help              # Show watch subcommand help
  d "how to list files"     # Quick-prompt mode
`);
}

async function handleQuickPrompt(args) {
  if (logWasUndefined) process.env.LOG = ''; // only show warnings
  await getConfig();
  const prompt = args.join(' ');

  const result = await Agent.prompt({
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
})();
