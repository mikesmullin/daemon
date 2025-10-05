#!/usr/bin/env node

// daemon.mjs: Multi-agent orchestrator

import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { _G } from './lib/globals.mjs';
import { mkdirp, relWS, abort, log } from './lib/utils.mjs';
import { Agent } from './lib/agents.mjs';
import color from './lib/colors.mjs';

// read configuration from YAML file
async function readConfig() {
  try {
    const configPath = relWS('config.yaml');
    log('debug', `⚙️  Reading configuration from ${configPath}`);
    const config = yaml.load(fs.readFileSync(configPath, 'utf8'));
    return config;
  } catch (error) {
    abort(`Failed to read config.yaml: ${error.message}`);
  }
}

// initialize directory skeleton on first run
function initializeDirectories() {
  _G.PROC_DIR = relWS('agents', 'proc');
  _G.TEMPLATES_DIR = relWS('agents', 'templates');
  _G.SESSIONS_DIR = relWS('agents', 'sessions');
  _G.WORKSPACES_DIR = relWS('agents', 'workspaces');

  _G.NEXT_PATH = path.join(_G.PROC_DIR, '_next');
}

async function makeDirectories() {
  await mkdirp(_G.PROC_DIR);
  await mkdirp(_G.TEMPLATES_DIR);
  await mkdirp(_G.SESSIONS_DIR);
  await mkdirp(_G.WORKSPACES_DIR);
}

// clean up transient files in directories
async function clean() {
  for (let dir of [_G.PROC_DIR, _G.SESSIONS_DIR, _G.WORKSPACES_DIR]) {
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

  // Determine subcommand (first non-option arg) - default is 'help'
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


  console.log('👺 Multi-Agent Orchestrator Daemon\n')
  if (subcommand != 'help') {
    console.error(`  Unknown subcommand.\n`);
  }
  console.log(`Usage: daemon.mjs <subcommand> [options]

Subcommands:
  pump          Run one iteration and exit
  watch         Run continuously, checking-in at intervals
  clean         Remove transient state (proc, sessions, workspaces)
  help          Show this help message (default)
`);
  process.exit(0);
}

// main
(async () => {
  initializeDirectories();
  await parseCliArgs();

  log('info', `👺🚀 ${color.bold('Multi-Agent Orchestrator Daemon')} starting`);
  const config = await readConfig();
  await makeDirectories();

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

  if ('watch' == _G.mode) {
    log('debug', `👀 ${color.bold('WATCH MODE:')} Will run continuously and check in at ${config.daemon.checkin_interval} second interval`);
    setInterval(() => {
      console.log(`Daemon checking-in...`);
    }, config.daemon.checkin_interval * 1000);
  }

  if ('pump' == _G.mode) {
    log('debug', '🥱 Daemon has nothing to do. 😴💤 Exiting.');
  }
})();