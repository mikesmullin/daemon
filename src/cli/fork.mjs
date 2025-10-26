/**
 * Fork Session CLI Command
 * 
 * Handles the `d fork` subcommand for forking existing sessions
 */

import { Agent } from '../lib/agents.mjs';
import utils from '../lib/utils.mjs';
import color from '../lib/colors.mjs';

export async function handleForkCommand(args, format, options) {
  const subcommand = args[1];

  // Check for help
  if (subcommand === 'help') {
    showHelp();
    process.exit(0);
  }

  if (args.length < 2) {
    utils.abort(
      'Error: fork requires a session id\n' +
      'Usage: d fork <session_id> [prompt]\n' +
      'Run \'d fork help\' for more information');
  }

  const session_id = args[1];
  const prompt = args.slice(2).join(' ') || null;

  try {
    const result = await Agent.fork({ session_id, prompt });
    if (prompt) result.initial_prompt = prompt;

    console.log(utils.outputAs(format, result, options));
    process.exit(0);
  } catch (error) {
    utils.abort(error.message);
  }
}

function showHelp() {
  console.log(`${color.bold('d fork')} - Fork an existing agent session

Usage: d fork <session_id> [prompt] [options]

Description:
  Creates a new session by forking (copying) an existing session. The forked
  session will have the same agent type, configuration, and conversation history
  as the source session. Optionally provide a new prompt to continue the conversation.

Arguments:
  <session_id>  ID of the session to fork
  [prompt]      Optional prompt to append to the forked session

Options:
  --format <format>   Output format: table (default), json, yaml, csv

Examples:
  d fork 5                        # Fork session 5 without new prompt
  d fork 5 "continue task"        # Fork session 5 with new prompt
  d fork 5 --format json          # Fork and output as JSON
`);
}
