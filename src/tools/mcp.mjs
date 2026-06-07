/**
 * MCP Tools Integration
 * 
 * Dynamically registers MCP server tools into the Daemon tool registry.
 * Tools are lazy-loaded when first used.
 */

import { _G } from '../lib/globals.mjs';
import { MCPClient } from '../lib/mcp-client.mjs';
import { log } from '../lib/utils.mjs';

/**
 * Ensure MCP tools are initialized (call this before using MCP)
 * This is idempotent - safe to call multiple times
 */
export async function ensureMCPInitialized() {
  if (_G.mcpInitialized) {
    return; // Already initialized
  }

  log('debug', '🔌 Initializing MCP tools...');
  await registerMCPTools();
  _G.mcpInitialized = true;
}

/**
 * Register all MCP tools from configured servers
 * This runs lazily when first needed by an agent
 */
export async function registerMCPTools() {
  if (!_G.CONFIG?.mcp?.servers) {
    log('debug', 'No MCP servers configured');
    return;
  }

  const servers = _G.CONFIG.mcp.servers;
  let totalTools = 0;

  for (const [serverName, serverConfig] of Object.entries(servers)) {
    if (!serverConfig.enabled) {
      log('debug', `MCP server ${serverName} is disabled, skipping`);
      continue;
    }

    try {
      // Register lazy-loading wrappers for each server's tools
      // We don't start the server yet - it will start on first tool use
      await registerServerTools(serverName, serverConfig);

    } catch (error) {
      log('error', `Failed to register MCP tools for ${serverName}: ${error.message}`);
    }
  }

  if (totalTools > 0) {
    log('info', `📦 Registered ${totalTools} MCP tools from ${Object.keys(servers).length} servers`);
  }
}

/**
 * Register tools for a specific MCP server
 * Creates lazy-loading wrappers that start the server on first use
 */
async function registerServerTools(serverName, serverConfig) {
  // Try to load cached tool definitions
  const cachedTools = await loadCachedTools(serverName);

  if (cachedTools && Object.keys(cachedTools).length > 0) {
    // Register tools from cache
    for (const [toolName, toolDef] of Object.entries(cachedTools)) {
      registerMCPTool(serverName, toolName, toolDef, serverConfig);
    }
    log('debug', `Registered ${Object.keys(cachedTools).length} cached tools for MCP server ${serverName}`);
  } else {
    // No cache available - eagerly start server and discover tools
    log('info', `🔌 No cache for ${serverName}, starting server to discover tools...`);
    try {
      await MCPClient.startServer(serverName, serverConfig);
      await discoverAndRegisterTools(serverName);
    } catch (error) {
      log('error', `Failed to start MCP server ${serverName} during registration: ${error.message}`);
      log('warn', `Tools from ${serverName} will not be available`);
    }
  }
}

/**
 * Register a single MCP tool in the global tool registry
 */
function registerMCPTool(serverName, toolName, toolDef, serverConfig) {
  const fullToolName = `mcp_${serverName}_${toolName}`;

  // Don't re-register if already exists
  if (_G.tools[fullToolName]) {
    return;
  }

  const definition = MCPClient.translateToolDefinition(toolDef, serverName);
  const approvalPolicy = serverConfig.approval_policy || 'approve';

  _G.tools[fullToolName] = {
    definition,

    metadata: {
      mcp: true,
      serverName,
      originalToolName: toolName,
      requiresHumanApproval: approvalPolicy === 'approve',

      preToolUse: async (args, context) => {
        // Check approval policy
        if (approvalPolicy === 'deny') {
          return 'deny';
        } else if (approvalPolicy === 'approve') {
          return 'approve'; // Ask user
        } else if (approvalPolicy === 'auto' || approvalPolicy === 'allow') {
          return 'allow'; // Execute without asking
        }
        return 'approve'; // Default to asking
      }
    },

    execute: async (args, context) => {
      try {
        // Lazy-load: Start server if not running
        if (!_G.mcpServers[serverName]) {
          log('info', `🔌 Lazy-loading MCP server: ${serverName}`);
          await MCPClient.startServer(serverName, serverConfig);
        }

        // Execute the tool
        return await MCPClient.executeTool(serverName, toolName, args);

      } catch (error) {
        log('error', `MCP tool ${fullToolName} execution failed: ${error.message}`);
        return {
          content: `MCP tool execution failed: ${error.message}`,
          metadata: { error: error.message },
          success: false
        };
      }
    }
  };
}

/**
 * Load cached tool definitions from disk
 */
async function loadCachedTools(serverName) {
  try {
    const cachePath = `${_G.MCP_DIR}/${serverName}.yaml`;
    const fs = await import('fs/promises');

    // Check if cache exists
    try {
      await fs.access(cachePath);
    } catch {
      return null; // No cache file
    }

    const cached = await import('../lib/utils.mjs').then(m => m.default.readYaml(cachePath));
    return cached.tools || null;

  } catch (error) {
    log('debug', `Failed to load cached tools for ${serverName}: ${error.message}`);
    return null;
  }
}

/**
 * Discover and register tools from a running MCP server
 * This is called when a server starts or when cache is unavailable
 */
export async function discoverAndRegisterTools(serverName) {
  const server = _G.mcpServers[serverName];
  if (!server) {
    throw new Error(`MCP server ${serverName} not running`);
  }

  const serverConfig = _G.CONFIG.mcp.servers[serverName];
  const tools = await MCPClient.discoverTools(serverName);

  for (const [toolName, toolDef] of Object.entries(tools)) {
    registerMCPTool(serverName, toolName, toolDef, serverConfig);
  }

  log('info', `📦 Registered ${Object.keys(tools).length} tools from MCP server ${serverName}`);
}
