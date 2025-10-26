/**
 * Pump CLI Command
 * 
 * Handles the `d pump` subcommand for one-time session processing
 */

import { Agent } from '../lib/agents.mjs';
import { log } from '../lib/utils.mjs';
import color from '../lib/colors.mjs';

export async function handlePumpCommand(args) {
  const subcommand = args[1];

  // Check for help
  if (subcommand === 'help') {
    showHelp();
    process.exit(0);
  }

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

  process.exit(0);
}

function showHelp() {
  console.log(`${color.bold('d pump')} - Run one iteration and exit

Usage: d pump [options]

Description:
  Processes all pending agent sessions once and then exits. Useful for
  external orchestration, step-through debugging, and cron-based workflows.

  Unlike 'watch' which runs continuously, 'pump' runs a single iteration
  and terminates, making it suitable for scripting and automation.

Options:
  --session <id>          Only process the specified session
  --labels <a,b,c>        Only process sessions with ALL specified labels (comma-separated)
  --no-humans             Auto-reject tool requests not on allowlist (unattended mode)

Examples:
  d pump                          # Process all pending sessions once
  d pump --session 5              # Process only session 5
  d pump --labels subagent        # Process only subagent sessions
  d pump --labels a,b --no-humans # Process sessions with labels 'a' AND 'b', unattended
`);
}
