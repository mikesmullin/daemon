// Agent operation handlers
import fs from 'fs/promises';
import yaml from 'js-yaml';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';
import { promisify } from 'util';
import { Agent } from '../../lib/agents.mjs';
import utils from '../../lib/utils.mjs';

const execAsync = promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export class AgentHandlers {
  constructor(server) {
    this.server = server;
    this.workspaceRoot = join(__dirname, '../../..');
    this.sessionsDir = join(this.workspaceRoot, 'agents', 'sessions');
    this.channelsDir = join(this.workspaceRoot, 'agents', 'channels');
    this.templatesDir = join(this.workspaceRoot, 'agents', 'templates');
  }

  async handleInvite(ws, msg) {
    const { channel, template, prompt } = msg;
    
    if (!channel || !template) {
      throw new Error('Channel and template are required');
    }

    const finalPrompt = prompt || 'You have been invited to the channel';

    try {
      // V3: Use ChannelManager for consolidated creation + FSM registration
      const sessionId = await this.server.channelManager.createSession({
        channel,
        template,
        prompt: finalPrompt,
        labels: ['subagent']
      });

      // Response sent via ChannelManager.emit()
    } catch (err) {
      throw new Error(`Failed to invite agent: ${err.message}`);
    }
  }

  async handlePause(ws, msg) {
    const { session_id } = msg;
    
    if (!session_id) {
      throw new Error('Session ID is required');
    }

    // V3: Use FSMEngine for state management
    try {
      this.server.fsmEngine.pauseSession(session_id);
      
      ws.send(JSON.stringify({
        type: 'agent:paused',
        session_id
      }));
      
      this.server.broadcast({
        type: 'agent:paused',
        session_id
      });
    } catch (err) {
      throw new Error(`Failed to pause session: ${err.message}`);
    }
  }

  async handleResume(ws, msg) {
    const { session_id } = msg;
    
    if (!session_id) {
      throw new Error('Session ID is required');
    }

    // V3: Use FSMEngine for state management
    try {
      this.server.fsmEngine.resumeSession(session_id);
      
      ws.send(JSON.stringify({
        type: 'agent:resumed',
        session_id
      }));
      
      this.server.broadcast({
        type: 'agent:resumed',
        session_id
      });
    } catch (err) {
      throw new Error(`Failed to resume session: ${err.message}`);
    }
  }

  async handleStop(ws, msg) {
    const { session_id } = msg;
    
    if (!session_id) {
      throw new Error('Session ID is required');
    }

    // V3: Use FSMEngine for state management
    try {
      this.server.fsmEngine.stopSession(session_id);
      
      ws.send(JSON.stringify({
        type: 'agent:stopped',
        session_id
      }));
      
      this.server.broadcast({
        type: 'agent:stopped',
        session_id
      });
    } catch (err) {
      throw new Error(`Failed to stop session: ${err.message}`);
    }
  }
}
