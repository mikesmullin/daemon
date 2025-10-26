/**
 * Logs CLI Command
 * 
 * Handles the `d logs` subcommand for displaying session chat logs
 */

import { Session } from '../lib/session.mjs';
import utils from '../lib/utils.mjs';
import color from '../lib/colors.mjs';

export async function handleLogsCommand(args) {
  const subcommand = args[1];

  // Check for help
  if (subcommand === 'help') {
    showHelp();
    process.exit(0);
  }

  if (args.length < 2) {
    utils.abort(
      'Error: logs requires a session ID\n' +
      'Usage: d logs <session_id>\n' +
      'Run \'d logs help\' for more information');
  }

  try {
    const session_id = args[1];
    const sessionContent = await Session.load(session_id);

    console.log(`\n👺 Session ${session_id} (${sessionContent.metadata.name}) Chat Log\n`);

    // Use Session.logConversation to display all messages
    if (sessionContent.spec.messages && sessionContent.spec.messages.length > 0) {
      Session.logConversation(sessionContent.spec.messages);
    } else {
      console.log('No messages in this session yet.');
    }

    process.exit(0);
  } catch (error) {
    utils.abort(error.message);
  }
}

function showHelp() {
  console.log(`${color.bold('d logs')} - Display chat log for a session

Usage: d logs <session_id>

Description:
  Displays the complete conversation history for a session, including all
  user messages, assistant responses, and tool calls. Messages are formatted
  with timestamps and color-coded by role.

Arguments:
  <session_id>  ID of the session to display

Examples:
  d logs 5        # Display chat log for session 5
  d logs 0        # Display chat log for session 0
`);
}
