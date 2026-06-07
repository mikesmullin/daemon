/**
 * MCP (Model Context Protocol) Client
 * 
 * Manages MCP server lifecycle, tool discovery, and execution.
 * Servers are lazy-loaded on first use and auto-restart on failure.
 */

import { spawn } from 'child_process';
import { _G } from './globals.mjs';
import utils, { log } from './utils.mjs';
import path from 'path';

export class MCPClient {

  /**
   * Start an MCP server process
   * @param {string} serverName - Name of the server from config
   * @param {Object} config - Server configuration from config.yaml
   * @returns {Promise<Object>} Server instance
   */
  static async startServer(serverName, config) {
    if (_G.mcpServers[serverName]?.process) {
      log('debug', `MCP server ${serverName} already running`);
      return _G.mcpServers[serverName];
    }

    log('info', `🔌 Starting MCP server: ${serverName}`);

    try {
      const serverProcess = spawn(config.command, config.args || [], {
        cwd: config.cwd || process.cwd(),
        env: { ...process.env, ...config.env || {} },
        stdio: ['pipe', 'pipe', 'pipe']
      });

      const server = {
        name: serverName,
        process: serverProcess,
        config,
        tools: {},
        ready: false,
        buffer: '',
        restartCount: 0,
        maxRestarts: 3
      };

      _G.mcpServers[serverName] = server;

      // Setup message handler
      serverProcess.stdout.on('data', (data) => {
        MCPClient._handleServerMessage(serverName, data);
      });

      serverProcess.stderr.on('data', (data) => {
        log('debug', `MCP ${serverName} stderr: ${data.toString().trim()}`);
      });

      serverProcess.on('error', (error) => {
        log('error', `❌ MCP server ${serverName} error: ${error.message}`);
        MCPClient._handleServerCrash(serverName);
      });

      serverProcess.on('exit', (code, signal) => {
        // Remove from child process tracking
        _G.childProcesses.delete(serverProcess);
        log('warn', `⚠️  MCP server ${serverName} exited: code=${code}, signal=${signal}`);
        MCPClient._handleServerCrash(serverName);
      });

      // Track MCP server process for cleanup
      _G.childProcesses.add(serverProcess);

      // Initialize the server
      await MCPClient._sendRequest(serverName, {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {
            tools: {}
          },
          clientInfo: {
            name: 'daemon-cli',
            version: '1.0.0'
          }
        }
      });

      // Wait for server to be ready
      await MCPClient._waitForReady(serverName);

      // Discover available tools
      await MCPClient.discoverTools(serverName);

      log('info', `✅ MCP server ${serverName} started with ${Object.keys(server.tools).length} tools`);

      return server;

    } catch (error) {
      log('error', `❌ Failed to start MCP server ${serverName}: ${error.message}`);
      delete _G.mcpServers[serverName];
      throw error;
    }
  }

  /**
   * Discover tools from a running MCP server
   * @param {string} serverName - Name of the server
   * @returns {Promise<Object>} Map of tool names to definitions
   */
  static async discoverTools(serverName) {
    const server = _G.mcpServers[serverName];
    if (!server) {
      throw new Error(`MCP server ${serverName} not running`);
    }

    try {
      const response = await MCPClient._sendRequest(serverName, {
        jsonrpc: '2.0',
        id: Date.now(),
        method: 'tools/list',
        params: {}
      });

      if (response.result && response.result.tools) {
        for (const tool of response.result.tools) {
          server.tools[tool.name] = tool;
        }

        // Cache tool definitions to disk
        await MCPClient._cacheToolDefinitions(serverName, server.tools);
      }

      return server.tools;

    } catch (error) {
      log('error', `❌ Failed to discover tools from ${serverName}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Translate MCP tool schema to OpenAI function calling format
   * @param {Object} mcpTool - MCP tool definition
   * @param {string} serverName - Server name for prefixing
   * @returns {Object} OpenAI-compatible function definition
   */
  static translateToolDefinition(mcpTool, serverName) {
    return {
      type: 'function',
      function: {
        name: `mcp_${serverName}_${mcpTool.name}`,
        description: mcpTool.description || `MCP tool: ${mcpTool.name}`,
        parameters: mcpTool.inputSchema || {
          type: 'object',
          properties: {},
          required: []
        }
      }
    };
  }

  /**
   * Execute an MCP tool
   * @param {string} serverName - Name of the server
   * @param {string} toolName - Name of the tool (without mcp_ prefix)
   * @param {Object} args - Tool arguments
   * @returns {Promise<Object>} Tool execution result
   */
  static async executeTool(serverName, toolName, args) {
    const server = _G.mcpServers[serverName];
    if (!server) {
      // Lazy load server if not running
      const config = _G.CONFIG?.mcp?.servers?.[serverName];
      if (!config || !config.enabled) {
        throw new Error(`MCP server ${serverName} not configured or not enabled`);
      }
      await MCPClient.startServer(serverName, config);
    }

    try {
      const response = await MCPClient._sendRequest(serverName, {
        jsonrpc: '2.0',
        id: Date.now(),
        method: 'tools/call',
        params: {
          name: toolName,
          arguments: args
        }
      });

      if (response.error) {
        throw new Error(`MCP tool error: ${response.error.message}`);
      }

      return {
        content: JSON.stringify(response.result, null, 2),
        metadata: {
          server: serverName,
          tool: toolName,
          mcp_response: response.result
        },
        success: true
      };

    } catch (error) {
      return {
        content: `MCP tool execution failed: ${error.message}`,
        metadata: { error: error.message, server: serverName, tool: toolName },
        success: false
      };
    }
  }

  /**
   * Stop an MCP server
   * @param {string} serverName - Name of the server
   */
  static async stopServer(serverName) {
    const server = _G.mcpServers[serverName];
    if (!server || !server.process) {
      return;
    }

    log('info', `🔌 Stopping MCP server: ${serverName}`);

    try {
      // Send shutdown request
      await MCPClient._sendRequest(serverName, {
        jsonrpc: '2.0',
        id: Date.now(),
        method: 'shutdown',
        params: {}
      });

      // Give it a moment to shut down gracefully
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Force kill if still running
      if (!server.process.killed) {
        server.process.kill('SIGTERM');
      }

      // Remove from child process tracking
      _G.childProcesses.delete(server.process);

    } catch (error) {
      log('debug', `Error during shutdown of ${serverName}: ${error.message}`);
      server.process.kill('SIGKILL');
      // Remove from child process tracking
      _G.childProcesses.delete(server.process);
    }

    delete _G.mcpServers[serverName];
  }

  /**
   * Stop all running MCP servers
   */
  static async stopAllServers() {
    const serverNames = Object.keys(_G.mcpServers);
    for (const name of serverNames) {
      await MCPClient.stopServer(name);
    }
  }

  /**
   * List all configured MCP servers
   * @returns {Array} Server status list
   */
  static listServers() {
    const servers = [];
    const config = _G.CONFIG?.mcp?.servers || {};

    for (const [name, serverConfig] of Object.entries(config)) {
      const running = _G.mcpServers[name]?.process ? true : false;
      const toolCount = running ? Object.keys(_G.mcpServers[name].tools).length : 0;

      servers.push({
        name,
        enabled: serverConfig.enabled || false,
        running,
        tools: toolCount,
        command: `${serverConfig.command} ${(serverConfig.args || []).join(' ')}`,
        approval_policy: serverConfig.approval_policy || 'approve'
      });
    }

    return servers;
  }

  // =============================================================================
  // PRIVATE METHODS
  // =============================================================================

  /**
   * Send JSON-RPC request to MCP server
   * @private
   */
  static async _sendRequest(serverName, request) {
    const server = _G.mcpServers[serverName];
    if (!server || !server.process) {
      throw new Error(`MCP server ${serverName} not running`);
    }

    return new Promise((resolve, reject) => {
      const requestId = request.id;
      const timeout = setTimeout(() => {
        reject(new Error(`MCP request timeout for ${serverName}`));
      }, 30000); // 30 second timeout

      // Store response handler
      if (!server.pendingRequests) {
        server.pendingRequests = {};
      }

      server.pendingRequests[requestId] = (response) => {
        clearTimeout(timeout);
        resolve(response);
      };

      // Send request
      const requestStr = JSON.stringify(request) + '\n';
      log('debug', `MCP ${serverName} → ${requestStr.trim()}`);
      server.process.stdin.write(requestStr);
    });
  }

  /**
   * Handle messages from MCP server
   * @private
   */
  static _handleServerMessage(serverName, data) {
    const server = _G.mcpServers[serverName];
    if (!server) return;

    server.buffer += data.toString();

    // Process complete JSON-RPC messages (newline delimited)
    const lines = server.buffer.split('\n');
    server.buffer = lines.pop() || ''; // Keep incomplete line in buffer

    for (const line of lines) {
      if (!line.trim()) continue;

      try {
        const message = JSON.parse(line);
        log('debug', `MCP ${serverName} ← ${JSON.stringify(message)}`);

        // Handle response to pending request
        if (message.id && server.pendingRequests?.[message.id]) {
          server.pendingRequests[message.id](message);
          delete server.pendingRequests[message.id];
        }

        // Mark server as ready on successful initialize
        if (message.result && !server.ready) {
          server.ready = true;
        }

      } catch (error) {
        log('error', `Failed to parse MCP message from ${serverName}: ${error.message}`);
        log('debug', `Raw message: ${line}`);
      }
    }
  }

  /**
   * Wait for server to be ready
   * @private
   */
  static async _waitForReady(serverName, timeout = 10000) {
    const server = _G.mcpServers[serverName];
    const start = Date.now();

    while (!server.ready && Date.now() - start < timeout) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    if (!server.ready) {
      throw new Error(`MCP server ${serverName} did not become ready in time`);
    }
  }

  /**
   * Handle server crash and auto-restart
   * @private
   */
  static async _handleServerCrash(serverName) {
    const server = _G.mcpServers[serverName];
    if (!server) return;

    server.restartCount = (server.restartCount || 0) + 1;

    if (server.restartCount <= server.maxRestarts) {
      log('warn', `⚠️  Auto-restarting MCP server ${serverName} (attempt ${server.restartCount}/${server.maxRestarts})`);

      // Clean up old server
      delete _G.mcpServers[serverName];

      // Wait a bit before restart
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Restart
      try {
        await MCPClient.startServer(serverName, server.config);
      } catch (error) {
        log('error', `❌ Failed to restart MCP server ${serverName}: ${error.message}`);
      }
    } else {
      log('error', `❌ MCP server ${serverName} exceeded max restart attempts`);
      delete _G.mcpServers[serverName];
    }
  }

  /**
   * Cache tool definitions to disk
   * @private
   */
  static async _cacheToolDefinitions(serverName, tools) {
    try {
      const cachePath = path.join(_G.MCP_DIR, `${serverName}.yaml`);
      await utils.writeYaml(cachePath, {
        server: serverName,
        updated: new Date().toISOString(),
        tools
      });
    } catch (error) {
      log('debug', `Failed to cache MCP tool definitions: ${error.message}`);
    }
  }
}
