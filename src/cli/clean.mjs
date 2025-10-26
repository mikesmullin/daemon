/**
 * Clean CLI Command
 * 
 * Handles the `d clean` subcommand for removing transient state
 */

import fs from 'fs';
import { _G } from '../lib/globals.mjs';
import utils, { log } from '../lib/utils.mjs';
import color from '../lib/colors.mjs';

export async function handleCleanCommand(args) {
  const subcommand = args[1];

  // Check for help
  if (subcommand === 'help') {
    showHelp();
    process.exit(0);
  }

  // Perform cleanup
  for (let dir of [_G.PROC_DIR, _G.SESSIONS_DIR, _G.WORKSPACES_DIR, _G.TASKS_DIR]) {
    dir = utils.relWS(dir);
    if (dir && fs.existsSync(dir)) {
      await fs.promises.rm(dir, { recursive: true, force: true });
      log('debug', `🧹 Cleaned directory: ${dir}`);
    }
  }

  await utils.makeDirectories();
  log('info', '🧹 Clean completed. Exiting.');
  process.exit(0);
}

function showHelp() {
  console.log(`${color.bold('d clean')} - Remove transient state

Usage: d clean

Description:
  Removes all transient state files and directories including:
  - agents/proc/      (process state files)
  - agents/sessions/  (session YAML files)
  - agents/workspaces/ (workspace data)
  - tasks/            (task files)

  This command is useful for:
  - Resetting the daemon to a clean state
  - Clearing out old/stale sessions
  - Troubleshooting session-related issues

Examples:
  d clean             # Clean all transient state
`);
}
