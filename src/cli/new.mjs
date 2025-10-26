/**
 * New Session CLI Command
 * 
 * Handles the `d new` subcommand for creating new agent sessions
 */

import { Agent } from '../lib/agents.mjs';
import utils from '../lib/utils.mjs';
import color from '../lib/colors.mjs';

export async function handleNewCommand(args, format, options) {
  const subcommand = args[1];

  // Check for help
  if (subcommand === 'help') {
    showHelp();
    process.exit(0);
  }

  if (args.length < 2) {
    utils.abort(
      'Error: new requires an agent name\n' +
      'Usage: d new <agent> [prompt|-]\n' +
      'Run \'d new help\' for more information');
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
    console.log(utils.outputAs(format, result, options));
    process.exit(0);
  } catch (error) {
    utils.abort(error.message);
  }
}

function showHelp() {
  console.log(`${color.bold('d new')} - Create a new agent session

Usage: d new <agent> [prompt|-] [options]

Description:
  Creates a new agent session from a template. The session will be in 'pending'
  state if a prompt is provided, or 'success' state if no prompt is given.

Arguments:
  <agent>       Agent template name (from agents/templates/*.yaml)
  [prompt]      Optional initial prompt for the agent
  -             Read prompt from stdin instead of arguments

Options:
  --format <format>   Output format: table (default), json, yaml, csv

Examples:
  d new solo                      # Create empty solo session
  d new solo "hello world"        # Create solo session with prompt
  d new solo -                    # Create session with prompt from stdin
  echo "hello" | d new solo -     # Pipe prompt from stdin
  d new solo --format json        # Create session and output as JSON
`);
}
