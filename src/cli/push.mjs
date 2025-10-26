/**
 * Push Message CLI Command
 * 
 * Handles the `d push` subcommand for appending messages to sessions
 */

import { Agent } from '../lib/agents.mjs';
import utils from '../lib/utils.mjs';
import color from '../lib/colors.mjs';

export async function handlePushCommand(args, format, options) {
  const subcommand = args[1];

  // Check for help
  if (subcommand === 'help') {
    showHelp();
    process.exit(0);
  }

  if (args.length < 3) {
    utils.abort(
      'Error: push requires a session ID and prompt\n' +
      'Usage: d push <session_id> <prompt>\n' +
      'Run \'d push help\' for more information');
  }

  const sessionId = args[1];
  const prompt = args.slice(2).join(' ');

  try {
    const result = await Agent.push(sessionId, prompt);
    console.log(utils.outputAs(format, result, options));
    process.exit(0);
  } catch (error) {
    utils.abort(error.message);
  }
}

function showHelp() {
  console.log(`${color.bold('d push')} - Append message to session

Usage: d push <session_id> <prompt> [options]

Description:
  Appends a new user message to an existing agent session and sets the session
  to 'pending' state so it will be processed on the next pump/watch iteration.

Arguments:
  <session_id>  ID of the session to append to
  <prompt>      Message to append to the session

Options:
  --format <format>   Output format: table (default), json, yaml, csv

Examples:
  d push 5 "continue with the next step"     # Add message to session 5
  d push 5 "what's the status?" --format json # Push and output as JSON
`);
}
