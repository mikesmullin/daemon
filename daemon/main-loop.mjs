import { globals } from '../common/globals.mjs';
import { Utils } from '../common/utils.mjs';
import { parseArg } from '../common/yaml-db.mjs';
import { EventEmitter } from 'events';
import fs from 'fs';

import { SessionModel } from '../plugins/agent/models/session.mjs';
import { WorkspaceManager } from '../plugins/agent/controllers/workspace.mjs';

export class MainLoop {
  constructor() {
    this.isRunning = false;
    this.tickIntervalId = null;
    this.abortController = new AbortController();
    this.activeTasks = new Set();
    
    // Bind methods
    this.tick = this.tick.bind(this);
  }

  /**
   * Removed: tryMatchAlias was duplicated command resolution logic
   * Now using Bridge.resolveCommand() as single source of truth
   */

  async start() {
    if (this.isRunning) return;
    this.isRunning = true;
    
    // Start the tick loop
    const interval = globals.getConfig('tickInterval') || 1000;
    this.tickIntervalId = setInterval(this.tick, interval);
    
    globals.eventBus.emit('started');
  }

  async stop() {
    if (!this.isRunning) return;
    this.isRunning = false;
    

    if (this.tickIntervalId) {
      clearInterval(this.tickIntervalId);
      this.tickIntervalId = null;
    }
    
    // Abort all in-flight tasks
    this.abortController.abort();
    this.abortController = new AbortController(); // Reset for next time
    
    // Wait for active tasks? (Optional, for now just clear)
    this.activeTasks.clear();
    
    globals.eventBus.emit('stopped');
  }

  async tick() {
    // if (globals.isPaused) return; // Handled in processQueue

    try {
      // 1. Process Command Queue
      await this.processQueue();

      // 2. Emit tick event for plugins
      if (!globals.isPaused) {
          globals.eventBus.emit('tick');
          
          // Auto-save DB
          for (const collection of globals.dbCollections) {
              collection.save();
          }
      }

      // 3. Update metrics (placeholder)
      // globals.metrics.uptime = ...
    } catch (error) {
      Utils.logError('Error in main loop tick:', error);
    }
  }

  async processQueue() {
    // Process commands up to concurrency limit
    const limit = globals.concurrency;
    
    if (globals.isPaused) {
        // Find first control command to unpause or exit
        const index = globals.commandQueue.findIndex(cmd => {
            const cmdString = typeof cmd === 'string' ? cmd : cmd.cmd;
            const parsed = Utils.parseDSL(cmdString);
            return parsed && ['continue', 'c', 'exit'].includes(parsed.command);
        });
        
        if (index !== -1) {
            const cmd = globals.commandQueue.splice(index, 1)[0];
            await this.executeCommand(cmd);
        }
        return;
    }
    
    while (
      globals.commandQueue.length > 0 && 
      this.activeTasks.size < limit && 
      !globals.isPaused
    ) {
      const cmd = globals.commandQueue.shift();
      this.executeCommand(cmd);
    }
  }

  async executeCommand(cmdInput) {
    // Handle new format: cmdInput can be string or {cmd, procId, ...}
    const cmdString = typeof cmdInput === 'string' ? cmdInput : cmdInput.cmd;
    const procId = typeof cmdInput === 'object' ? cmdInput.procId : null;
    
    const taskId = Date.now() + Math.random();
    this.activeTasks.add(taskId);
    Utils.logTrace(`[main-loop.mjs] [TRACE] ${new Date().toISOString()} executeCommand called for: ${cmdString}`);
    
    // Set global context for output filtering
    globals.currentRequestContext.procId = procId || null;
    
    const outputBuffer = [];
    const logListener = (log) => {
        outputBuffer.push(log.message);
    };
    Utils.addLogListener(logListener);
    
    try {
      // Use centralized command resolution from bridge
      const { bridge } = await import('../plugins/agent/controllers/host-container-bridge.mjs');
      const resolved = bridge.resolveCommand(cmdString);
      
      if (resolved.error) {
        Utils.logError(`Command resolution failed: ${resolved.error}`);
        throw new Error(resolved.error);
      }

      const { cmd, args, handler } = resolved;

      // Execute the resolved command
      let result;
      if (handler) {
        Utils.logTrace(`[main-loop.mjs] Executing handler for ${cmd}`);
        result = await handler(args);
        Utils.logTrace(`[main-loop.mjs] Handler result: ${JSON.stringify(result)}`);
      } else {
        result = await this.handleBuiltInCommand(cmd, args);
      }
      
      // Note: handlers are responsible for their own output via Utils.logInfo()
      // Don't log result here to avoid duplication
      
      const requestId = bridge.requestIdMap.get(cmdString);
      
      // console.error(`[main-loop.mjs:executeCommand] Command completed: "${cmdString.substring(0, 50)}", requestId=${requestId}, success=true`);
      
      globals.eventBus.emit('commandProcessed', { 
          command: cmdString, 
          success: true,
          output: outputBuffer.join('\n'),
          result: result?.result || result, // Pass result back to CLI (e.g. for context report)
          requestId
      });
    } catch (error) {
      Utils.logError(`Command failed: ${cmdString}`, error);
      const { bridge } = await import('../plugins/agent/controllers/host-container-bridge.mjs');
      const requestId = bridge.requestIdMap.get(cmdString);
      
      console.error(`[main-loop.mjs:executeCommand] Command failed: "${cmdString.substring(0, 50)}", requestId=${requestId}, error=${error.message}`);
      
      globals.eventBus.emit('commandProcessed', { 
          command: cmdString, 
          success: false, 
          error,
          output: outputBuffer.join('\n'),
          requestId
      });
    } finally {
      Utils.removeLogListener(logListener);
      this.activeTasks.delete(taskId);
      // Clear request context
      globals.currentRequestContext.procId = null;
    }
  }

  async handleBuiltInCommand(command, args) {
    // Most commands have been migrated to core plugin as tools.
    // This is just a fallback for any remaining unregistered commands.
    Utils.logWarn(`Unknown command: ${command}`);
  }
}

export const mainLoop = new MainLoop();
