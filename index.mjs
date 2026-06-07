import { mainLoop } from './daemon/main-loop.mjs';
import { globals } from './common/globals.mjs';
import { Utils } from './common/utils.mjs';
import { PasteAwareInput } from './common/paste-aware-input.mjs';
import readline from 'readline';
import fs from 'fs';
import net from 'net';
import path from 'path';
import pkg from './package.json' assert { type: 'json' };

// Load Core Plugins/Models (registers DB collections)
import './plugins/agent/models/session.mjs';
import './plugins/agent/models/template.mjs';
import './plugins/agent/models/group.mjs';
import './plugins/agent/controllers/agent.mjs';
import './plugins/core/index.mjs';
import './plugins/fs/index.mjs';
import './plugins/human/index.mjs';
import './plugins/shell/index.mjs';
import './plugins/voice/index.mjs';
import './plugins/youtube/index.mjs';
import './plugins/ticket/index.mjs';
import './plugins/vectordb/index.mjs';
import './plugins/gemini/index.mjs';
import './plugins/web/index.mjs';

import { XAIProvider } from './plugins/agent/models/providers/xai.mjs';
import { CopilotProvider } from './plugins/agent/models/providers/copilot.mjs';
import { GeminiProvider } from './plugins/agent/models/providers/gemini.mjs';
import { OllamaProvider } from './plugins/agent/models/providers/ollama.mjs';

import { AgentLoop } from './plugins/agent/controllers/agent-loop.mjs';

// Parse Args
const args = process.argv.slice(2);
const sessionArgIndex = args.indexOf('--session');
const sessionId = sessionArgIndex !== -1 ? args[sessionArgIndex + 1] : null;
const daemonMode = args.includes('--daemon');

// Set REPL mode if not in daemon mode and not in session mode
globals.isRepl = !daemonMode && !sessionId;

if (sessionId) {
    Utils.logTrace(`[index.mjs] [TRACE] ${new Date().toISOString()} Container process started for session ${sessionId}`);
    Utils.setLogHandler((level, message, context) => {
        const stream = level === 'error' ? console.error : console.log;
        stream(message);
        if (Object.keys(context).length > 0) stream(context);
    });
    
    // Load config and apply log level for container
    globals.loadConfig();
    if (globals.config.log?.level) {
        Utils.setLogLevel(globals.config.log.level);
    }
    
    Utils.logInfo(`Starting Agent Session: ${sessionId}`);
    
    // Socket is created and managed by host - container doesn't need to create a server
    // Container only needs to connect as a client when sending messages to host via bridge
    
    const loop = new AgentLoop(sessionId);
    loop.start();
    
    // Keep process alive (loop.start is async but we want to handle signals)
    process.on('SIGTERM', () => {
        Utils.logInfo('Agent stopping...');
        loop.stop();
        process.exit(0);
    });
} else {
    // Main Daemon Mode
    
    // Handle Lockfile
    const lockfile = globals.lockfile || './daemon.lock';
    
    try {
      // Try to create lockfile atomically
      fs.writeFileSync(lockfile, process.pid.toString(), { flag: 'wx' });
    } catch (e) {
      if (e.code === 'EEXIST') {
        // Lockfile exists, check if process is actually running
        try {
          const pid = parseInt(fs.readFileSync(lockfile, 'utf8').trim());
          if (pid) {
            try {
              process.kill(pid, 0); // Check if process exists
              console.error(`Daemon is already running (PID: ${pid}). Aborting.`);
              process.exit(1);
            } catch (err) {
              if (err.code === 'EPERM') {
                 console.error(`Daemon is already running (PID: ${pid}). Aborting.`);
                 process.exit(1);
              }
              // ESRCH: Process dead, lockfile stale. Overwrite it.
              console.warn(`Found stale lockfile for PID ${pid}. Overwriting.`);
              fs.writeFileSync(lockfile, process.pid.toString());
            }
          } else {
             // Invalid PID in file, overwrite
             fs.writeFileSync(lockfile, process.pid.toString());
          }
        } catch (readErr) {
           // Could not read file (maybe race condition or permission), abort to be safe
           console.error(`Failed to read lockfile: ${readErr.message}. Aborting.`);
           process.exit(1);
        }
      } else {
        throw e;
      }
    }

    // Cleanup on exit
    const cleanup = () => {
      if (fs.existsSync(lockfile)) {
        fs.unlinkSync(lockfile);
      }
      const cliSocketPath = globals.socketPath || './cli.sock';
      if (fs.existsSync(cliSocketPath)) {
        fs.unlinkSync(cliSocketPath);
      }
      mainLoop.stop();
    };

    process.on('exit', cleanup);
    process.on('SIGTERM', () => {
        Utils.logInfo('Received SIGTERM, shutting down...');
        process.exit(0);
    });
    
    // Create socket server (for both daemon and REPL modes)
    // This allows containers and CLI commands to communicate with the daemon
    const cliSocketPath = globals.socketPath || './cli.sock';
    if (fs.existsSync(cliSocketPath)) {
      fs.unlinkSync(cliSocketPath);
    }
    
    const server = net.createServer((socket) => {
      socket.on('data', async (data) => {
        try {
          const request = JSON.parse(data.toString().trim());
          Utils.logDebug(`[index.mjs:socket.on('data')] Received request: type=${request.type}, requestId=${request.requestId}, command=${request.command?.substring(0, 50)}`);
          
          // Import bridge for routing (lazy load to avoid circular deps)
          const { bridge } = await import('./plugins/agent/controllers/host-container-bridge.mjs');
          
          // Route all messages through bridge
          try {
            Utils.logDebug(`[index.mjs:socket.on('data')] Routing to bridge: type=${request.type}, requestId=${request.requestId}, procId=${request.procId}`);
            const result = await bridge.route(request, { sessionId: request.sessionId, procId: request.procId });
            Utils.logDebug(`[index.mjs:socket.on('data')] Bridge returned result: success=${result.success}, requestId=${result.requestId}, has result=${!!result.result}`);
            const responseJson = JSON.stringify(result) + '\n';
            Utils.logDebug(`[index.mjs:socket.on('data')] Writing response: ${responseJson.substring(0, 100)}...`);
            socket.write(responseJson);
            Utils.logDebug(`[index.mjs:socket.on('data')] Response written, closing socket`);
          } catch (e) {
            Utils.logError(`[Daemon] Bridge routing failed: ${e.message}`);
            socket.write(JSON.stringify({ success: false, error: e.message }) + '\n');
          }
          socket.end();
      } catch (e) {
          socket.write(JSON.stringify({ success: false, error: e.message }) + '\n');
          socket.end();
        }
      });
      
      socket.on('error', (err) => {
        Utils.logError(`Socket error: ${err.message}`);
      });
    });
    
    server.listen(cliSocketPath, () => {
    });

    // Always log to file (truncate on startup)
    const logStream = fs.createWriteStream('./daemon.log', { flags: 'w' });

    if (daemonMode) {
      // Daemon mode: headless - log to file only since stdio is ignored
      Utils.setLogHandler((level, message, context) => {
          const line = `${message}\n`;
          logStream.write(line);
          if (Object.keys(context).length > 0) logStream.write(JSON.stringify(context) + '\n');
      });
      
      // Apply log level from config
      if (globals.config.log?.level) {
          Utils.setLogLevel(globals.config.log.level);
      }

      Utils.logInfo('Daemon mode: Running in background');
    } else {
      // Interactive REPL mode
      const rl = new PasteAwareInput({
        input: process.stdin,
        output: process.stdout,
        prompt: 'd> ',
        pasteThreshold: globals.pasteDetectionThreshold
      });

      Utils.setLogHandler((level, message, context) => {
          // Write to file (always, regardless of procId)
          logStream.write(`${message}\n`);
          if (Object.keys(context).length > 0) logStream.write(JSON.stringify(context) + '\n');
          
          // Determine if we should write to stdout
          // Write to stdout if:
          // 1. No procId is set (REPL or direct host execution)
          // 2. procId matches current process (command output for matching CLI)
          const shouldWriteToStdout = !globals.currentRequestContext.procId || globals.currentRequestContext.procId === process.pid;
          
          if (shouldWriteToStdout) {
            // Write to console
            readline.cursorTo(process.stdout, 0);
            readline.clearLine(process.stdout, 0);
            const stream = level === 'error' ? console.error : console.log;
            stream(message);
            if (Object.keys(context).length > 0) stream(context);
            rl.prompt(true);
          }
      });
      
      // Apply log level from config
      if (globals.config.log?.level) {
          Utils.setLogLevel(globals.config.log.level);
      }

      rl.prompt();

      rl.on('line', (line) => {
        const trimmed = line.trim();
        if (trimmed === 'exit' || trimmed === 'quit') {
            rl.close();
            return;
        }
        if (trimmed) {
          globals.enqueueCommand(trimmed);
        }
        rl.prompt();
      }).on('SIGINT', () => {
        // Forward SIGINT to process handler to toggle pause state
        process.emit('SIGINT');
      }).on('close', () => {
        // Switch to simple logger to avoid prompt redraw
        Utils.setLogHandler((level, message, context) => {
             logStream.write(`${message}\n`);
             if (Object.keys(context).length > 0) logStream.write(JSON.stringify(context) + '\n');
             const stream = level === 'error' ? console.error : console.log;
             stream(message);
             if (Object.keys(context).length > 0) stream(context);
        });

        Utils.logInfo('Received SIGINT.');
        process.exit(0);
      });
    }

    // Start Main Loop
    mainLoop.start();
    Utils.logInfo(`Daemon v${pkg.version} started. Type 'help' or commands.`);
}

process.on('SIGINT', () => {
  Utils.logInfo('Type "exit" to quit.');
});
