#!/usr/bin/env bun
import { spawn } from 'child_process';
import fs from 'fs';
import net from 'net';
import path from 'path';
import { Utils } from './common/utils.mjs';

// Initialize Logger
Utils.setLogLevel('info');
Utils.setLogHandler((level, message) => {
  if (level === 'error') console.error(message);
  else console.log(message);
});

const LOCKFILE = './daemon.lock';
const SOCKET_PATH = process.env.CLI_SOCKET || './cli.sock';

function printUsage() {
  Utils.logInfo(`
Usage: d [options] [command]

Options:
  -d, --daemon     Start daemon in background
  -k, --kill       Kill existing daemon process
  -a, --async      Enqueue command and exit immediately
  -v, --verbose    Enable debug logging
  -h, --help       Show this help

Commands:
  <command>        Execute command in daemon (via socket if daemon is running, or start REPL)

Examples:
  d -d                    # Start daemon in background
  d -k                    # Kill existing daemon
  d -d -k                 # Kill existing, then start new daemon
  d "agent new default"   # Send command to daemon (wait for completion)
  d -a "set log.level debug"  # Send command async (exit immediately)
  d                       # Start interactive REPL
`);
}

function getDaemonPid() {
  if (fs.existsSync(LOCKFILE)) {
    try {
      const pid = parseInt(fs.readFileSync(LOCKFILE, 'utf8').trim());
      // Check if process is actually running
      try {
        process.kill(pid, 0); // Signal 0 checks if process exists
        return pid;
      } catch (e) {
        // Process doesn't exist, remove stale lockfile
        fs.unlinkSync(LOCKFILE);
        return null;
      }
    } catch (e) {
      return null;
    }
  }
  return null;
}

function killDaemon() {
  const pid = getDaemonPid();
  if (pid) {
    Utils.logInfo(`Killing daemon process ${pid}...`);
    try {
      process.kill(pid, 'SIGTERM');
      // Wait a moment for graceful shutdown
      let attempts = 0;
      while (attempts < 100) {
        try {
          process.kill(pid, 0);
          // Still running, wait
          Bun.sleepSync(100);
          attempts++;
        } catch (e) {
          // Process is gone
          Utils.logInfo('Daemon stopped.');
          if (fs.existsSync(LOCKFILE)) fs.unlinkSync(LOCKFILE);
          return true;
        }
      }
      // Force kill
      Utils.logInfo('Force killing daemon...');
      process.kill(pid, 'SIGKILL');
      if (fs.existsSync(LOCKFILE)) fs.unlinkSync(LOCKFILE);
      return true;
    } catch (e) {
      Utils.logError(`Failed to kill daemon: ${e.message}`);
      return false;
    }
  } else {
    Utils.logInfo('No daemon running.');
    return true;
  }
}

function startDaemon() {
  const pid = getDaemonPid();
  if (pid) {
    Utils.logInfo(`Daemon is already running (PID: ${pid}).`);
    return true;
  }

  Utils.logInfo('Starting daemon...');
  const child = spawn('bun', ['run', 'index.mjs', '--daemon'], {
    detached: true,
    stdio: 'ignore',
    cwd: path.dirname(new URL(import.meta.url).pathname)
  });
  child.unref();
  
  // Wait for daemon to be ready (check for socket or lockfile)
  let attempts = 0;
  while (attempts < 30) {
    if (fs.existsSync(LOCKFILE) && fs.existsSync(SOCKET_PATH)) {
      Utils.logInfo('Daemon started.');
      return true;
    }
    Bun.sleepSync(100);
    attempts++;
  }
  
  Utils.logError('Daemon failed to start (timeout).');
  return false;
}

function sendCommandViaSocket(command, waitForResponse = true) {
  return new Promise((resolve, reject) => {
    // Add timeout
    const timeoutId = setTimeout(() => {
      client.destroy();
      reject(new Error('Socket connection timeout (5s)'));
    }, 5000);
    
    const client = net.createConnection(SOCKET_PATH, () => {
      clearTimeout(timeoutId);
      const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const procId = process.pid;
      const message = JSON.stringify({ type: 'command', command, waitForResponse, requestId, procId });
      console.error(`[cli.mjs] [TRACE] ${new Date().toISOString()} Sending command with requestId=${requestId}, procId=${procId}: ${command}`);
      client.write(message + '\n');

      let responseData = '';
      
      client.on('data', (data) => {
        clearTimeout(timeoutId);
        responseData += data.toString();
        console.error(`[cli.mjs] Received data: ${data.toString().substring(0, 100)}`);
        
        if (waitForResponse) {
          // Check if we have a complete response (newline-delimited JSON)
          if (responseData.includes('\n')) {
            try {
              const response = JSON.parse(responseData.trim());
              console.error(`[cli.mjs] Parsed response: requestId=${response.requestId}, expected=${requestId}, match=${response.requestId === requestId}`);
              // Validate this response matches our request
              if (response.requestId === requestId) {
                console.error(`[cli.mjs] Response matches requestId, resolving`);
                client.end();
                resolve(response);
              } else {
                // Not our response, keep waiting
                console.error(`[cli.mjs] Response requestId mismatch, clearing buffer and waiting for next`);
                responseData = '';
              }
            } catch (e) {
              // Incomplete JSON, keep accumulating
              console.error(`[cli.mjs] JSON parse error: ${e.message}`);
            }
          }
        }
      });

      client.on('error', (err) => {
        clearTimeout(timeoutId);
        console.error(`[cli.mjs] Socket error: ${err.message}`);
        reject(err);
      });

      client.on('end', () => {
        clearTimeout(timeoutId);
        console.error(`[cli.mjs] Socket closed, waitForResponse=${waitForResponse}, has responseData=${!!responseData}`);
        if (!waitForResponse) {
          resolve({ success: true, message: 'Command enqueued' });
        } else if (responseData) {
          try {
            const response = JSON.parse(responseData.trim());
            resolve(response);
          } catch (e) {
            resolve({ success: false, error: 'Invalid response format' });
          }
        }
      });
    });
  });
}

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    // No args: Start REPL (import and run index.mjs directly)
    const pid = getDaemonPid();
    if (pid) {
      console.warn('Daemon already running. Use -k to kill it first, or send commands directly.');
      process.exit(1);
    }
    await import('./index.mjs');
    return;
  }

  let daemon = false;
  let kill = false;
  let async = false;
  let help = false;
  let command = null;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '-d' || arg === '--daemon') {
      daemon = true;
    } else if (arg === '-k' || arg === '--kill') {
      kill = true;
    } else if (arg === '-a' || arg === '--async') {
      async = true;
    } else if (arg === '-h' || arg === '--help') {
      help = true;
    } else {
      // Everything else is the command
      command = args.slice(i).join(' ');
      break;
    }
  }

  if (help) {
    printUsage();
    process.exit(0);
  }

  if (kill) {
    killDaemon();
    if (!daemon) {
      process.exit(0);
    }
  }

  if (daemon) {
    startDaemon();
    process.exit(0);
  }

  // If we have a command, send it via socket
  if (command) {
    const pid = getDaemonPid();
    if (!pid) {
      console.error('Daemon not running. Start with: d -d');
      process.exit(1);
    }
    
    // Check if socket exists
    if (!fs.existsSync(SOCKET_PATH)) {
      console.error(`Socket ${SOCKET_PATH} not found. Daemon may not be ready.`);
      process.exit(1);
    }

    try {
      const response = await sendCommandViaSocket(command, !async);
      if (async) {
        console.log('Command enqueued.');
      } else {
        if (response.success) {
          // Print result if available (clean output), otherwise logs
          if (response.result) {
            console.log(response.result);
          } else if (response.output) {
            console.log(response.output);
          }
        } else {
          console.error(response.error || 'Command failed');
          process.exit(1);
        }
      }
    } catch (e) {
      console.error(`Failed to send command: ${e.message}`);
      process.exit(1);
    }
  }
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
