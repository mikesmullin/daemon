#!/usr/bin/env node

// daemon.mjs: Multi-agent orchestrator

import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { _G } from './lib/globals.mjs';
import {
  relWS, log, readYaml, initializeDirectories, makeDirectories
} from './lib/utils.mjs';
import { Agent } from './lib/agents.mjs';
import color from './lib/colors.mjs';
import { Copilot } from './lib/copilot.mjs';

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
  _G.CONFIG = await readYaml(_G.CONFIG_PATH);
  await makeDirectories();

  if ('pump' == _G.mode) {
    log('debug', `⛽ ${color.bold('PUMP MODE:')} Will run one iteration and exit`);
  }

  // testing
  const sessions = await Agent.list();
  console.debug(`Found ${sessions.length} active session(s)`, sessions);

  // const a1 = await Agent.fork('planner');
  // console.debug(`Forked new agent session: ${a1}`);
  // const as1 = await Agent.state(a1);
  // console.debug(`Session ${a1} state: ${as1}`);

  // const a2 = await Agent.fork('executor');
  // console.debug(`Forked new agent session: ${a2}`);
  // const as2 = await Agent.state(a2);
  // console.debug(`Session ${a2} state: ${as2}`);

  {
    // Test Copilot
    const messages = [
      {
        role: 'system',
        content: 'You are a pirate. Always respond in pirate speak with "Arrr!" and nautical terms.'
      },
      {
        role: 'user',
        content: 'My favorite color is blue.'
      },
      {
        role: 'assistant',
        content: 'Arrr! Blue, ye say? That be the hue o’ the deep sea and the sky over the horizon! A fine choice for a pirate’s heart. Be ye wantin’ to deck out yer ship’s sails in that azure glory or somethin’ else? Speak, me matey! Arrr!'
      },
      {
        role: 'user',
        content: 'My favorite number is 42.'
      },
      {
        role: 'assistant',
        content: 'Arrr! Forty-two, eh? That be a number with a mystical ring, like a cannon blast echoin’ across the seven seas! Be it yer lucky number for plunderin’ or just a whim, it’s a fine pick. What else be stirrin’ in yer pirate soul, matey? Arrr!'
      },
      {
        role: 'user',
        content: 'What were my favorite color and number? Answer in one sentence.'
      },
    ];
    try {
      await Copilot.init();
      const response = await Copilot.client.chat.completions.create({
        model: 'claude-sonnet-4.5',
        messages: messages,
        max_tokens: 300,
      });
      console.debug('Full response:' + JSON.stringify(response, null, 2));
    } catch (error) {
      console.error('❌ Error:', error.message);
    }
  }

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