#!/usr/bin/env bun

// Standalone HTTP server launcher for Task Management Plugin
// Run with: bun plugins/task-mgmt/serve.mjs

import { createServer } from './http.mjs';
import * as db from './db.mjs';

// Parse command line arguments
const args = process.argv.slice(2);
let port = 3001;

// Check for --port or -p flag
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--port' || args[i] === '-p') {
    if (i + 1 < args.length) {
      port = parseInt(args[i + 1], 10);
    }
  } else if (args[i].startsWith('--port=')) {
    port = parseInt(args[i].substring(7), 10);
  } else if (args[i].startsWith('-p=')) {
    port = parseInt(args[i].substring(3), 10);
  }
}

// Validate port
if (isNaN(port) || port < 1 || port > 65535) {
  console.error('❌ Invalid port number. Using default: 3001');
  port = 3001;
}

console.log('📋 Task Management HTTP Service');
console.log('================================\n');

// Initialize database
try {
  db.initializeDatabase();
  console.log('✅ Database initialized');
} catch (error) {
  console.error(`❌ Failed to initialize database: ${error.message}`);
  process.exit(1);
}

// Start server
try {
  const server = createServer(port);
  console.log(`\n✨ Server ready! Open http://localhost:${port} in your browser`);
  console.log('\nPress Ctrl+C to stop\n');
} catch (error) {
  console.error(`❌ Failed to start server: ${error.message}`);
  process.exit(1);
}

// Graceful shutdown on Ctrl+C
process.on('SIGINT', () => {
  console.log('\n\n👋 Shutting down server...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n\n👋 Shutting down server...');
  process.exit(0);
});
