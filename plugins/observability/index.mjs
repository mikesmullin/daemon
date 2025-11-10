#!/usr/bin/env bun
/**
 * Observability Plugin for Daemon
 * Provides real-time monitoring dashboard for AI agent activity
 */

import { spawn } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Get plugin metadata
 */
function getPluginInfo() {
  return {
    name: 'observability',
    version: '1.0.0',
    description: 'Real-time monitoring dashboard for AI agent orchestration',
    author: 'Daemon Team'
  };
}

/**
 * Start the observability web server
 */
async function startServer(port) {
  const servePath = join(__dirname, 'serve.mjs');
  
  console.log(`🔍 Starting Observability Dashboard on port ${port}...`);
  console.log(`📊 Dashboard: http://localhost:${port}`);
  console.log(`📡 Listening for UDP events from daemons with --observe ${port}`);
  console.log('');
  console.log('Press Ctrl+C to stop');
  
  // Start the server process
  const serverProcess = spawn('bun', [servePath, port.toString()], {
    stdio: 'inherit',
    cwd: __dirname
  });
  
  serverProcess.on('error', (error) => {
    console.error('Failed to start observability server:', error);
    process.exit(1);
  });
  
  serverProcess.on('exit', (code) => {
    if (code !== 0 && code !== null) {
      console.error(`Observability server exited with code ${code}`);
      process.exit(code);
    }
  });
  
  // Handle cleanup
  process.on('SIGINT', () => {
    console.log('\nShutting down observability server...');
    serverProcess.kill('SIGINT');
    process.exit(0);
  });
  
  process.on('SIGTERM', () => {
    serverProcess.kill('SIGTERM');
    process.exit(0);
  });
}

/**
 * Register CLI subcommand for observability server
 * Called by daemon's plugin system
 */
function registerCommands() {
  return {
    observe: {
      description: 'Start the observability dashboard server',
      usage: 'd observe [port]',
      examples: [
        'd observe',
        'd observe 3002',
        'd observe 3003  # For monitoring a separate team'
      ],
      handler: async (args) => {
        const port = args[0] || 3002;
        await startServer(port);
      }
    }
  };
}

/**
 * Default export for plugin system compatibility
 * Called when plugin is loaded by daemon
 */
export default function(context) {
  // This plugin provides CLI commands, not tools
  // Tool registration is handled separately via registerCommands()
  // Just register plugin info for now
  const info = getPluginInfo();
  context.log?.('debug', `📦 Loaded observability plugin: ${info.name} v${info.version}`);
}

export {
  registerCommands,
  getPluginInfo
};
