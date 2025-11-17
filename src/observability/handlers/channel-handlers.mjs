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

    try {
      // Use ChannelManager for consistent channel management
      const channel = await this.server.channelManager.createChannel(name, description || '');
      
      // Response sent via ChannelManager.emit()
    } catch (err) {
      if (err.message.includes('already exists')) {
        // Channel exists, just return it
        const existingChannel = this.server.channelManager.getChannel(name);
        ws.send(JSON.stringify({
          type: 'channel:joined',
          channel: existingChannel.toYAML()
        }));
      } else {
        throw err;
      }
    }
  }

  async handleDelete(ws, msg) {
    const { name } = msg;
    
    if (!name) {
      throw new Error('Channel name is required');
    }

    try {
      // Use ChannelManager for consistent channel management
      await this.server.channelManager.deleteChannel(name);
      
      // Response sent via ChannelManager.emit()
    } catch (err) {
      throw err;
    }
  }

  async handleList(ws) {
    try {
      // Use ChannelManager for consistent channel management
      const channels = this.server.channelManager.getAllChannels();
      
      ws.send(JSON.stringify({
        type: 'channel:list:response',
        channels
      }));
    } catch (err) {
      throw err;
    }
  }

  async handleGet(ws, msg) {
    const { name } = msg;
    
    if (!name) {
      throw new Error('Channel name is required');
    }

    try {
      // Use ChannelManager for consistent channel management
      const channel = this.server.channelManager.getChannel(name);
      if (!channel) {
        throw new Error(`Channel "${name}" not found`);
      }
      
      ws.send(JSON.stringify({
        type: 'channel:get',
        channel: channel.toYAML()
      }));
    } catch (err) {
      throw err;
    }
  }

  async handleAddAgent(ws, msg) {
    const { channel, session_id } = msg;
    
    if (!channel || !session_id) {
      throw new Error('Channel and session_id are required');
    }

    try {
      // Use ChannelManager for consistent channel management
      await this.server.channelManager.addSessionToChannel(channel, session_id);
      
      ws.send(JSON.stringify({
        type: 'channel:agent_added',
        channel: channel,
        session_id: session_id
      }));
      
      // Broadcast is handled by ChannelManager.emit()
    } catch (err) {
      throw new Error(`Failed to add agent to channel: ${err.message}`);
    }
  }

  async handleRemoveAgent(ws, msg) {
    const { channel, session_id } = msg;
    
    if (!channel || !session_id) {
      throw new Error('Channel and session_id are required');
    }

    try {
      // Use ChannelManager for consistent channel management
      await this.server.channelManager.removeSessionFromChannel(channel, session_id);
      
      ws.send(JSON.stringify({
        type: 'channel:agent_removed',
        channel: channel,
        session_id: session_id
      }));
      
      // Broadcast is handled by ChannelManager.emit()
    } catch (err) {
      throw new Error(`Failed to remove agent from channel: ${err.message}`);
    }
  }
}
