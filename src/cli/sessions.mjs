/**
 * Sessions CLI Commands
 * 
 * Handles the `d sessions` subcommand for listing agent sessions
 */

import { Session } from '../lib/session.mjs';
import utils from '../lib/utils.mjs';
import color from '../lib/colors.mjs';

export async function handleSessionsCommand(args, format, options) {
  const subcommand = args[1];

  // Check for help
  if (subcommand === 'help') {
    showHelp();
    process.exit(0);
  }

  // List sessions with optional label filtering
  const sessions = await Session.list();
  let filteredSessions = sessions;

  // Apply label filtering if --labels is provided
  if (options.labels && options.labels.length > 0) {
    filteredSessions = sessions.filter(s => {
      // Session must have labels array
      if (!s.labels || !Array.isArray(s.labels)) {
        return false;
      }

      // Session must contain ALL required labels (AND logic)
      return options.labels.every(requiredLabel => s.labels.includes(requiredLabel));
    });
  }

  // Apply not-labels filtering if --not-labels is provided
  if (options.notLabels && options.notLabels.length > 0) {
    filteredSessions = filteredSessions.filter(s => {
      // If session doesn't have labels array, it passes the not-labels filter
      if (!s.labels || !Array.isArray(s.labels)) {
        return true;
      }

      // Session must NOT contain ANY of the excluded labels (NOR logic)
      return !options.notLabels.some(excludedLabel => s.labels.includes(excludedLabel));
    });
  }

  console.log(utils.outputAs(format, filteredSessions, options));
  process.exit(0);
}

function showHelp() {
  console.log(`${color.bold('d sessions')} - List all agent sessions

Usage: d sessions [options]

Description:
  Lists all active agent sessions with their current state, agent type, model,
  process ID, labels, and last message. Sessions can be filtered by labels.

Options:
  --labels <a,b,c>        Filter to sessions with ALL specified labels (comma-separated)
  --not-labels <x,y,z>    Exclude sessions with ANY of the specified labels (comma-separated)
  --format <format>       Output format: table (default), json, yaml, csv
  --all                   Show full untruncated text fields (table format only)
  --flatten               Flatten nested object hierarchies in output

Examples:
  d sessions                          # List all sessions
  d sessions --labels subagent        # List only subagent sessions
  d sessions --labels a,b             # List sessions with both 'a' AND 'b' labels
  d sessions --labels subagent --not-labels tty # List subagent sessions but exclude those with 'tty' label
  d sessions --format json            # Output as JSON
  d sessions --format yaml --all      # Output as YAML with full text
`);
}
