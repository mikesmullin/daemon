// Channel operation handlers
import fs from 'fs/promises';
import yaml from 'js-yaml';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export class ChannelHandlers {
  constructor(server) {
    this.server = server;
    this.workspaceRoot = join(__dirname, '../../..');
    this.channelsDir = join(this.workspaceRoot, 'agents', 'channels');
  }

  async handleCreate(ws, msg) {
    const { name, description } = msg;
    
    if (!name) {
      throw new Error('Channel name is required');
    }

    const channelFile = join(this.channelsDir, `${name}.yaml`);
    
    // Check if channel already exists
    try {
      await fs.access(channelFile);
      // Channel exists, just return it
      const content = await fs.readFile(channelFile, 'utf8');
      const channelData = yaml.load(content);
      
      ws.send(JSON.stringify({
        type: 'channel:joined',
        channel: channelData
      }));
      return;
    } catch {
      // Channel doesn't exist, create it
    }

    // Create channel directory if it doesn't exist
    await fs.mkdir(this.channelsDir, { recursive: true });

    // Create new channel
    const channelData = {
      metadata: {
        name: name,
        description: description || '',
        created: new Date().toISOString()
      },
      spec: {
        sessions: []
      }
    };

    await fs.writeFile(channelFile, yaml.dump(channelData), 'utf8');
    
    ws.send(JSON.stringify({
      type: 'channel:created',
      channel: channelData
    }));
    
    // Broadcast to all clients
    this.server.broadcast({
      type: 'channel:created',
      channel: channelData
    });
  }

  async handleDelete(ws, msg) {
    const { name } = msg;
    
    if (!name) {
      throw new Error('Channel name is required');
    }

    const channelFile = join(this.channelsDir, `${name}.yaml`);
    
    try {
      // Read channel to get sessions
      const content = await fs.readFile(channelFile, 'utf8');
      const channelData = yaml.load(content);
      
      // TODO: Stop all sessions in this channel
      // For now, just delete the channel file
      
      await fs.unlink(channelFile);
      
      ws.send(JSON.stringify({
        type: 'channel:deleted',
        channel: name
      }));
      
      // Broadcast to all clients
      this.server.broadcast({
        type: 'channel:deleted',
        channel: name
      });
    } catch (err) {
      if (err.code === 'ENOENT') {
        throw new Error(`Channel "${name}" not found`);
      }
      throw err;
    }
  }

  async handleList(ws) {
    try {
      const files = await fs.readdir(this.channelsDir);
      const channels = [];
      
      for (const file of files) {
        if (file.endsWith('.yaml')) {
          const content = await fs.readFile(join(this.channelsDir, file), 'utf8');
          channels.push(yaml.load(content));
        }
      }
      
      ws.send(JSON.stringify({
        type: 'channel:list:response',
        channels
      }));
    } catch (err) {
      if (err.code === 'ENOENT') {
        // Directory doesn't exist yet
        ws.send(JSON.stringify({
          type: 'channel:list:response',
          channels: []
        }));
      } else {
        throw err;
      }
    }
  }

  async handleAddAgent(ws, msg) {
    const { channel, session_id } = msg;
    
    if (!channel || !session_id) {
      throw new Error('Channel and session_id are required');
    }

    const channelFile = join(this.channelsDir, `${channel}.yaml`);
    
    try {
      const content = await fs.readFile(channelFile, 'utf8');
      const channelData = yaml.load(content);
      
      // Add session if not already present
      if (!channelData.spec.sessions.includes(session_id)) {
        channelData.spec.sessions.push(session_id);
        await fs.writeFile(channelFile, yaml.dump(channelData), 'utf8');
      }
      
      ws.send(JSON.stringify({
        type: 'channel:agent_added',
        channel: channel,
        session_id: session_id
      }));
    } catch (err) {
      throw new Error(`Failed to add agent to channel: ${err.message}`);
    }
  }

  async handleRemoveAgent(ws, msg) {
    const { channel, session_id } = msg;
    
    if (!channel || !session_id) {
      throw new Error('Channel and session_id are required');
    }

    const channelFile = join(this.channelsDir, `${channel}.yaml`);
    
    try {
      const content = await fs.readFile(channelFile, 'utf8');
      const channelData = yaml.load(content);
      
      // Remove session
      channelData.spec.sessions = channelData.spec.sessions.filter(id => id !== session_id);
      await fs.writeFile(channelFile, yaml.dump(channelData), 'utf8');
      
      ws.send(JSON.stringify({
        type: 'channel:agent_removed',
        channel: channel,
        session_id: session_id
      }));
    } catch (err) {
      throw new Error(`Failed to remove agent from channel: ${err.message}`);
    }
  }
}
