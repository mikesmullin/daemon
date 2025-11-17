// Channel Manager - Orchestrates all channels and sessions for v3.0
import fs from 'fs/promises';
import yaml from 'js-yaml';
import { join } from 'path';
import { existsSync } from 'fs';
import { log } from './utils.mjs';

export class Channel {
  constructor(data) {
    this.name = data.name;
    this.createdAt = data.created_at || new Date().toISOString();
    this.updatedAt = data.updated_at || new Date().toISOString();
    this.description = data.description || '';
    this.labels = data.labels || [];
    this.agentSessions = data.agent_sessions || [];
  }

  toYAML() {
    return {
      metadata: {
        name: this.name,
        created_at: this.createdAt,
        updated_at: this.updatedAt
      },
      spec: {
        agent_sessions: this.agentSessions,
        description: this.description,
        labels: this.labels
      }
    };
  }

  addSession(sessionId) {
    if (!this.agentSessions.includes(sessionId)) {
      this.agentSessions.push(sessionId);
      this.updatedAt = new Date().toISOString();
    }
  }

  removeSession(sessionId) {
    const index = this.agentSessions.indexOf(sessionId);
    if (index !== -1) {
      this.agentSessions.splice(index, 1);
      this.updatedAt = new Date().toISOString();
    }
  }
}

export class ChannelManager {
  constructor(baseDir) {
    this.baseDir = baseDir || process.cwd();
    this.channelsDir = join(this.baseDir, 'agents', 'channels');
    this.sessionsDir = join(this.baseDir, 'agents', 'sessions');
    
    this.channels = new Map(); // name → Channel
    this.sessions = new Map(); // session_id → Session metadata
    this.wsClients = new Set(); // WebSocket connections
    this.sessionToChannel = new Map(); // session_id → channel_name
  }

  async initialize() {
    // Ensure directories exist
    await fs.mkdir(this.channelsDir, { recursive: true });
    await fs.mkdir(this.sessionsDir, { recursive: true });

    // Load existing channels
    await this.loadChannels();
    
    log('info', `📡 Channel Manager initialized with ${this.channels.size} channels`);
  }

  async loadChannels() {
    try {
      if (!existsSync(this.channelsDir)) {
        return;
      }

      const files = await fs.readdir(this.channelsDir);
      
      for (const file of files) {
        if (file.endsWith('.yaml') || file.endsWith('.yml')) {
          const filePath = join(this.channelsDir, file);
          const content = await fs.readFile(filePath, 'utf8');
          const data = yaml.load(content);
          
          if (data && data.metadata && data.spec) {
            const channel = new Channel({
              name: data.metadata.name,
              created_at: data.metadata.created_at,
              updated_at: data.metadata.updated_at,
              description: data.spec.description,
              labels: data.spec.labels,
              agent_sessions: data.spec.agent_sessions || []
            });

            this.channels.set(channel.name, channel);

            // Build session → channel mapping
            for (const sessionId of channel.agentSessions) {
              this.sessionToChannel.set(String(sessionId), channel.name);
            }
            
            log('debug', `📂 Loaded channel: ${channel.name} with ${channel.agentSessions.length} sessions`);
          }
        }
      }
    } catch (error) {
      log('error', `Failed to load channels: ${error.message}`);
    }
  }

  async saveChannel(channel) {
    try {
      const filePath = join(this.channelsDir, `${channel.name}.yaml`);
      const yamlData = channel.toYAML();
      const yamlContent = yaml.dump(yamlData, { lineWidth: -1, noRefs: true });
      await fs.writeFile(filePath, yamlContent, 'utf8');
      log('debug', `💾 Saved channel: ${channel.name}`);
    } catch (error) {
      log('error', `Failed to save channel ${channel.name}: ${error.message}`);
      throw error;
    }
  }

  async createChannel(name, description = '') {
    if (this.channels.has(name)) {
      throw new Error(`Channel '${name}' already exists`);
    }

    const channel = new Channel({
      name,
      description,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      agent_sessions: []
    });

    this.channels.set(name, channel);
    await this.saveChannel(channel);

    this.emit('channel:created', { channel: channel.toYAML() });
    
    log('info', `✨ Created channel: ${name}`);
    return channel;
  }

  async deleteChannel(name) {
    const channel = this.channels.get(name);
    if (!channel) {
      throw new Error(`Channel '${name}' does not exist`);
    }

    // Remove session → channel mappings
    for (const sessionId of channel.agentSessions) {
      this.sessionToChannel.delete(String(sessionId));
    }

    // Delete channel file
    const filePath = join(this.channelsDir, `${name}.yaml`);
    if (existsSync(filePath)) {
      await fs.unlink(filePath);
    }

    this.channels.delete(name);
    
    this.emit('channel:deleted', { channel: name });
    
    log('info', `🗑️  Deleted channel: ${name}`);
  }

  getChannel(name) {
    return this.channels.get(name);
  }

  getChannelForSession(sessionId) {
    return this.sessionToChannel.get(String(sessionId));
  }

  async addSessionToChannel(channelName, sessionId) {
    const channel = this.channels.get(channelName);
    if (!channel) {
      throw new Error(`Channel '${channelName}' does not exist`);
    }

    channel.addSession(sessionId);
    this.sessionToChannel.set(String(sessionId), channelName);
    await this.saveChannel(channel);

    this.emit('session:added', { channel: channelName, session_id: sessionId });
    
    log('debug', `➕ Added session ${sessionId} to channel ${channelName}`);
  }

  async removeSessionFromChannel(channelName, sessionId) {
    const channel = this.channels.get(channelName);
    if (!channel) {
      throw new Error(`Channel '${channelName}' does not exist`);
    }

    channel.removeSession(sessionId);
    this.sessionToChannel.delete(String(sessionId));
    await this.saveChannel(channel);

    this.emit('session:removed', { channel: channelName, session_id: sessionId });
    
    log('debug', `➖ Removed session ${sessionId} from channel ${channelName}`);
  }

  // WebSocket client management
  addClient(ws) {
    this.wsClients.add(ws);
    log('debug', `🔌 WebSocket client connected (total: ${this.wsClients.size})`);
  }

  removeClient(ws) {
    this.wsClients.delete(ws);
    log('debug', `🔌 WebSocket client disconnected (total: ${this.wsClients.size})`);
  }

  // Event emission
  emit(eventType, data) {
    // Determine which channel this event belongs to (if applicable)
    let channelName = null;
    
    if (data.session_id) {
      channelName = this.getChannelForSession(data.session_id);
    }

    const message = {
      type: eventType,
      channel: channelName,
      data: data,
      timestamp: new Date().toISOString()
    };

    this.broadcast(message);
  }

  broadcast(message) {
    const json = JSON.stringify(message);
    
    for (const client of this.wsClients) {
      try {
        if (client.readyState === 1) { // WebSocket.OPEN
          client.send(json);
        }
      } catch (err) {
        log('error', `Failed to send to client: ${err.message}`);
        this.wsClients.delete(client);
      }
    }
  }

  // Get all channels as array
  getAllChannels() {
    return Array.from(this.channels.values()).map(c => c.toYAML());
  }

  // Get all sessions (simplified metadata)
  getAllSessions() {
    return Array.from(this.sessions.values());
  }

  // Session metadata tracking (lightweight, not full session data)
  registerSession(sessionId, metadata) {
    this.sessions.set(String(sessionId), {
      id: sessionId,
      ...metadata
    });
  }

  unregisterSession(sessionId) {
    this.sessions.delete(String(sessionId));
  }
}
