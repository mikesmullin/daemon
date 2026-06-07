/**
 * Tool CLI Command
 * 
 * Handles the `d tool` subcommand for executing agent tools directly
 */

import { _G } from '../lib/globals.mjs';
import { Agent } from '../lib/agents.mjs';
import utils from '../lib/utils.mjs';
import color from '../lib/colors.mjs';

export async function handleToolCommand(args, format, options) {
  const subcommand = args[1];

  // Check for help or list tools
  if (subcommand === 'help' || args.length < 2) {
    if (subcommand === 'help') {
      showHelp();
      process.exit(0);
    }

    // List all available tools
    const tools = Object.keys(_G.tools).map(name => {
      return {
        name,
        description: _G.tools[name].definition.function.description || '',
        params:
          ['json', 'yaml'].includes(format) ?
            _G.tools[name]?.definition?.function?.parameters?.properties :
            Object.keys(_G.tools[name]?.definition?.function?.parameters?.properties || {}).join(', '),
      };
    });
    console.log(utils.outputAs(format, tools, options));
    process.exit(0);
  }

  try {
    const toolName = args[1];
    // Default to '{}' if no JSON arguments supplied
    const jsonArgs = args.length >= 3 ? args.slice(2).join(' ') : '{}';
    const toolArgs = JSON.parse(jsonArgs);
    const result = await Agent.tool(toolName, toolArgs);

    // Check if result has the standard tool response shape
    if (result && typeof result === 'object' && 'success' in result && 'content' in result && 'metadata' in result) {
      // Print success status with emoji and color
      const successEmoji = result.success ? '✅' : '❌';
      const successColor = result.success ? color.green : color.red;
      console.log(successColor(successEmoji + ' ' + (result.success ? 'Success' : 'Failed')));

      // Print content verbatim
      if (result.content) {
        console.log(result.content + "\n");
      }

      // Smart metadata output - if metadata contains an array, display it directly
      // This makes tabular data display properly instead of showing the wrapper object
      if (result.metadata && Object.keys(result.metadata).length > 0) {
        let dataToDisplay = result.metadata;

        // Check if metadata has a single array field - if so, display the array directly
        const metadataKeys = Object.keys(result.metadata);
        if (metadataKeys.length > 0) {
          // Find array fields in metadata
          const arrayFields = metadataKeys.filter(key => Array.isArray(result.metadata[key]));

          // If there's exactly one array field, display it directly for better table formatting
          if (arrayFields.length === 1 && result.metadata[arrayFields[0]].length > 0) {
            dataToDisplay = result.metadata[arrayFields[0]];
          }
        }

        console.log(utils.outputAs(format, dataToDisplay, options));
      }
    } else {
      // Fallback for tools that don't follow the standard shape
      console.log(utils.outputAs(format, result, options));
    }

    process.exit(0);
  } catch (error) {
    utils.abort(error.message);
  }
}

function showHelp() {
  console.log(`${color.bold('d tool')} - Execute an agent tool directly

Usage: d tool [name] [json-args] [options]
Usage: d tool              (list all tools)

Description:
  Executes an agent tool directly without going through an AI agent. Useful
  for testing tools, debugging, and direct file/system operations.

  When called without arguments, lists all available tools.

Arguments:
  [name]        Name of the tool to execute
  [json-args]   JSON object with tool arguments (default: {})

Options:
  --format <format>   Output format: table (default), json, yaml, csv

Examples:
  d tool                                  # List all available tools
  d tool --format json                    # List tools as JSON
  d tool list_directory '{"path":"."}'    # Execute list_directory tool
  d tool execute_shell '{"command":"ls"}' # Execute shell command
  d tool view_file '{"filePath":"README.md","lineStart":1,"lineEnd":10}'
`);
}
