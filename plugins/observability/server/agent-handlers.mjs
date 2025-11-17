// Agent operation handlers
import fs from 'fs/promises';
import yaml from 'js-yaml';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';
import { promisify } from 'util';

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
    this.procDir = join(this.workspaceRoot, 'agents', 'proc');
  }

  async handleInvite(ws, msg) {
    const { channel, template, prompt } = msg;
    
    if (!channel || !template) {
      throw new Error('Channel and template are required');
    }

    const finalPrompt = prompt || 'You have been invited to the channel';

    try {
      // Generate unique session ID
      const sessionId = Date.now();
      
      // Create session file
      const sessionData = {
        metadata: {
          name: template,
          session_id: sessionId,
          created: new Date().toISOString(),
          channel: channel
        },
        spec: {
          template: template,
          messages: [
            {
              ts: new Date().toISOString(),
              role: 'user',
              content: finalPrompt
            }
          ]
        }
      };

      // Ensure sessions directory exists
      await fs.mkdir(this.sessionsDir, { recursive: true });
      await fs.mkdir(this.procDir, { recursive: true });
      
      const sessionFile = join(this.sessionsDir, `${sessionId}.yaml`);
      await fs.writeFile(sessionFile, yaml.dump(sessionData), 'utf8');
      
      // Mark as pending
      await fs.writeFile(join(this.procDir, String(sessionId)), 'pending', 'utf8');
      
      // Add session to channel
      const channelFile = join(this.channelsDir, `${channel}.yaml`);
      try {
        const content = await fs.readFile(channelFile, 'utf8');
        const channelData = yaml.load(content);
        
        if (!channelData.spec.sessions.includes(sessionId)) {
          channelData.spec.sessions.push(sessionId);
          await fs.writeFile(channelFile, yaml.dump(channelData), 'utf8');
        }
      } catch (err) {
        console.warn(`Failed to update channel file: ${err.message}`);
      }

      ws.send(JSON.stringify({
        type: 'agent:invited',
        session_id: sessionId,
        channel: channel,
        agent: template
      }));
      
      // Broadcast to all clients
      this.server.broadcast({
        type: 'agent:invited',
        session_id: sessionId,
        channel: channel,
        agent: template
      });
      
    } catch (err) {
      throw new Error(`Failed to invite agent: ${err.message}`);
    }
  }

  async handlePause(ws, msg) {
    const { session_id } = msg;
    
    if (!session_id) {
      throw new Error('Session ID is required');
    }

    // Mark session as paused by updating proc file
    try {
      await fs.writeFile(join(this.procDir, String(session_id)), 'paused', 'utf8');
      
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

    // Mark session as pending to resume
    try {
      await fs.writeFile(join(this.procDir, String(session_id)), 'pending', 'utf8');
      
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

    // Mark session as stopped by removing proc file
    try {
      await fs.unlink(join(this.procDir, String(session_id))).catch(() => {});
      
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
