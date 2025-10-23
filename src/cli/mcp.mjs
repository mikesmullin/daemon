/**
 * MCP CLI Commands
 * 
 * Handles all `d mcp` subcommands for managing MCP servers
 */

import { MCPClient } from '../lib/mcp-client.mjs';
import { _G } from '../lib/globals.mjs';
import utils, { log } from '../lib/utils.mjs';
import { discoverAndRegisterTools, ensureMCPInitialized } from '../tools/mcp.mjs';

export async function handleMcpCommand(args, format, options) {
  // Initialize MCP for mcp-specific commands
  await ensureMCPInitialized();

  const subcommand = args[1] || 'list';

  switch (subcommand) {
    case 'list':
      return await listServers(format, options);

    case 'start':
      return await startServer(args[2], format, options);

    case 'stop':
      return await stopServer(args[2], format, options);

    case 'discover':
      return await discoverServer(args[2], format, options);

    case 'add':
      return await addServer(args.slice(2), format, options);

    default:
      utils.abort(
        `Unknown mcp subcommand: ${subcommand}\n` +
        `Usage: d mcp <list|start|stop|discover|add>`
      );
  }
}

/**
 * List all MCP servers and their status
 */
async function listServers(format, options) {
  const servers = MCPClient.listServers();
  console.log(utils.outputAs(format, servers, options));
  process.exit(0);
}

/**
 * Start an MCP server
 */
async function startServer(serverName, format, options) {
  if (!serverName) {
    utils.abort('Error: start requires a server name\nUsage: d mcp start <server_name>');
  }

  const config = _G.CONFIG?.mcp?.servers?.[serverName];
  if (!config) {
    utils.abort(`Error: MCP server '${serverName}' not found in config.yaml`);
  }

  if (!config.enabled) {
    utils.abort(`Error: MCP server '${serverName}' is disabled in config.yaml`);
  }

  try {
    await MCPClient.startServer(serverName, config);
    await discoverAndRegisterTools(serverName);

    const server = _G.mcpServers[serverName];
    const result = {
      server: serverName,
      status: 'running',
      tools: Object.keys(server.tools).length,
      message: `MCP server ${serverName} started successfully`
    };

    console.log(utils.outputAs(format, result, options));
    process.exit(0);
  } catch (error) {
    utils.abort(`Failed to start MCP server ${serverName}: ${error.message}`);
  }
}

/**
 * Stop an MCP server
 */
async function stopServer(serverName, format, options) {
  if (!serverName) {
    utils.abort('Error: stop requires a server name\nUsage: d mcp stop <server_name>');
  }

  try {
    await MCPClient.stopServer(serverName);

    const result = {
      server: serverName,
      status: 'stopped',
      message: `MCP server ${serverName} stopped successfully`
    };

    console.log(utils.outputAs(format, result, options));
    process.exit(0);
  } catch (error) {
    utils.abort(`Failed to stop MCP server ${serverName}: ${error.message}`);
  }
}

/**
 * Discover tools from an MCP server
 */
async function discoverServer(serverName, format, options) {
  if (!serverName) {
    utils.abort('Error: discover requires a server name\nUsage: d mcp discover <server_name>');
  }

  const config = _G.CONFIG?.mcp?.servers?.[serverName];
  if (!config) {
    utils.abort(`Error: MCP server '${serverName}' not found in config.yaml`);
  }

  try {
    // Start server if not running
    if (!_G.mcpServers[serverName]) {
      await MCPClient.startServer(serverName, config);
    }

    const tools = await MCPClient.discoverTools(serverName);
    const toolList = Object.entries(tools).map(([name, tool]) => ({
      name: `mcp_${serverName}_${name}`,
      original_name: name,
      description: tool.description || '',
      input_schema: ['json', 'yaml'].includes(format) ? tool.inputSchema :
        Object.keys(tool.inputSchema?.properties || {}).join(', ')
    }));

    console.log(utils.outputAs(format, toolList, options));
    process.exit(0);
  } catch (error) {
    utils.abort(`Failed to discover tools from ${serverName}: ${error.message}`);
  }
}

/**
 * Add a new MCP server to configuration
 * Format: d mcp add <server_name> -- <command> [args...]
 * Example: d mcp add chrome-devtools -- npx -y chrome-devtools-mcp@latest -u http://localhost:9222
 */
async function addServer(args, format, options) {
  // Find the separator '--'
  const separatorIndex = args.indexOf('--');

  if (separatorIndex === -1 || separatorIndex === 0) {
    utils.abort(
      'Error: add requires server name and command\n' +
      'Usage: d mcp add <server_name> -- <command> [args...]\n' +
      'Example: d mcp add chrome-devtools -- npx -y chrome-devtools-mcp@latest -u http://localhost:9222'
    );
  }

  const serverName = args[0];
  const command = args[separatorIndex + 1];
  const commandArgs = args.slice(separatorIndex + 2);

  if (!serverName || !command) {
    utils.abort(
      'Error: add requires server name and command\n' +
      'Usage: d mcp add <server_name> -- <command> [args...]\n' +
      'Example: d mcp add chrome-devtools -- npx -y chrome-devtools-mcp@latest -u http://localhost:9222'
    );
  }

  try {
    // Read current config
    const config = await utils.readYaml(_G.CONFIG_PATH);

    // Initialize mcp.servers if it doesn't exist
    if (!config.mcp) {
      config.mcp = { servers: {} };
    }
    if (!config.mcp.servers) {
      config.mcp.servers = {};
    }

    // Check if server already exists
    if (config.mcp.servers[serverName]) {
      utils.abort(`Error: MCP server '${serverName}' already exists in config.yaml`);
    }

    // Add new server configuration
    config.mcp.servers[serverName] = {
      command,
      args: commandArgs,
      enabled: true,
      approval_policy: 'approve',
      env: {},
      cwd: null
    };

    // Write updated config
    await utils.writeYaml(_G.CONFIG_PATH, config);

    // Reload config in global state
    _G.CONFIG = config;

    const result = {
      server: serverName,
      command: `${command} ${commandArgs.join(' ')}`,
      message: `MCP server '${serverName}' added to config.yaml`,
      next_steps: [
        `Review and customize settings in config.yaml`,
        `Start the server with: d mcp start ${serverName}`,
        `Discover tools with: d mcp discover ${serverName}`
      ]
    };

    console.log(utils.outputAs(format, result, options));
    process.exit(0);

  } catch (error) {
    utils.abort(`Failed to add MCP server: ${error.message}`);
  }
}
