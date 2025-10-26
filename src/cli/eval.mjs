/**
 * Eval Session CLI Command
 * 
 * Handles the `d eval` subcommand for evaluating sessions
 */

import { _G } from '../lib/globals.mjs';
import { Agent } from '../lib/agents.mjs';
import utils from '../lib/utils.mjs';
import color from '../lib/colors.mjs';

export async function handleEvalCommand(args, format, options) {
  const subcommand = args[1];

  // Check for help
  if (subcommand === 'help') {
    showHelp();
    process.exit(0);
  }

  if (args.length < 2) {
    utils.abort(
      'Error: eval requires a session ID\n' +
      'Usage: d eval <session_id>\n' +
      'Run \'d eval help\' for more information');
  }

  const sessionId = args[1];

  try {
    // Load config (needed for AI provider settings)
    _G.CONFIG = await utils.readYaml(_G.CONFIG_PATH);

    const result = await Agent.eval(sessionId);
    console.log(utils.outputAs(format, result, options));
    process.exit(0);
  } catch (error) {
    utils.abort(error.message);
  }
}

function showHelp() {
  console.log(`${color.bold('d eval')} - Evaluate an agent session

Usage: d eval <session_id> [options]

Description:
  Evaluates a session by processing any pending messages and tool calls.
  This is similar to running 'pump' but for a specific session regardless
  of its current state. Useful for manual session management.

Arguments:
  <session_id>  ID of the session to evaluate

Options:
  --format <format>   Output format: table (default), json, yaml, csv

Examples:
  d eval 5                    # Evaluate session 5
  d eval 5 --format json      # Evaluate and output as JSON
`);
}
