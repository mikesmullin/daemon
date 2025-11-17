import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, rmSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { mkdirSync, writeFileSync, readFileSync } from 'fs';
import yaml from 'js-yaml';
import { ChannelHandlers } from '../../../src/observability/handlers/channel-handlers.mjs';

// Mock server
class MockServer {
  constructor() {
    this.broadcasts = [];
  }

  broadcast(data) {
    this.broadcasts.push(data);
  }

  getLastBroadcast() {
    return this.broadcasts[this.broadcasts.length - 1];
  }

  clearBroadcasts() {
    this.broadcasts = [];
  }
}

// Mock WebSocket
class MockWebSocket {
  constructor() {
    this.sentMessages = [];
  }

  send(data) {
    this.sentMessages.push(JSON.parse(data));
  }

  getLastMessage() {
    return this.sentMessages[this.sentMessages.length - 1];
  }

  clearMessages() {
    this.sentMessages = [];
  }
}

describe('ChannelHandlers', () => {
  let tempDir;
  let server;
  let handlers;
  let ws;

  beforeEach(() => {
    // Create temporary directory for test
    tempDir = mkdtempSync(join(tmpdir(), 'daemon-test-'));
    
    // Create mock server and handlers
    server = new MockServer();
    handlers = new ChannelHandlers(server);
    
    // Override channels directory to use temp dir
    handlers.channelsDir = join(tempDir, 'agents', 'channels');
    mkdirSync(handlers.channelsDir, { recursive: true });
    
    // Create mock WebSocket
    ws = new MockWebSocket();
  });

  afterEach(() => {
    // Clean up temp directory
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('handleCreate', () => {
    test('creates a new channel', async () => {
      await handlers.handleCreate(ws, {
        name: 'test-channel',
        description: 'Test channel'
      });

      const channelPath = join(handlers.channelsDir, 'test-channel.yaml');
      expect(existsSync(channelPath)).toBe(true);

      const lastMessage = ws.getLastMessage();
      expect(lastMessage.type).toBe('channel:created');
      expect(lastMessage.channel.metadata.name).toBe('test-channel');
    });

    test('throws error when name is missing', async () => {
      await expect(handlers.handleCreate(ws, {})).rejects.toThrow('Channel name is required');
    });

    test('returns existing channel if it already exists', async () => {
      // Create channel first
      const channelData = {
        metadata: {
          name: 'existing-channel',
          description: 'Existing',
          created: new Date().toISOString()
        },
        spec: {
          sessions: [1, 2]
        }
      };
      const channelPath = join(handlers.channelsDir, 'existing-channel.yaml');
      writeFileSync(channelPath, yaml.dump(channelData));

      await handlers.handleCreate(ws, {
        name: 'existing-channel'
      });

      const lastMessage = ws.getLastMessage();
      expect(lastMessage.type).toBe('channel:joined');
      expect(lastMessage.channel.spec.sessions).toEqual([1, 2]);
    });

    test('broadcasts channel creation to all clients', async () => {
      await handlers.handleCreate(ws, {
        name: 'broadcast-test',
        description: 'Broadcast test'
      });

      const broadcast = server.getLastBroadcast();
      expect(broadcast.type).toBe('channel:created');
      expect(broadcast.channel.metadata.name).toBe('broadcast-test');
    });
  });

  describe('handleDelete', () => {
    test('deletes an existing channel', async () => {
      // Create channel first
      const channelData = {
        metadata: {
          name: 'to-delete',
          created: new Date().toISOString()
        },
        spec: {
          sessions: []
        }
      };
      const channelPath = join(handlers.channelsDir, 'to-delete.yaml');
      writeFileSync(channelPath, yaml.dump(channelData));

      await handlers.handleDelete(ws, { name: 'to-delete' });

      expect(existsSync(channelPath)).toBe(false);

      const lastMessage = ws.getLastMessage();
      expect(lastMessage.type).toBe('channel:deleted');
    });

    test('throws error when name is missing', async () => {
      await expect(handlers.handleDelete(ws, {})).rejects.toThrow('Channel name is required');
    });

    test('broadcasts channel deletion to all clients', async () => {
      // Create channel first
      const channelData = {
        metadata: {
          name: 'to-delete',
          created: new Date().toISOString()
        },
        spec: {
          sessions: []
        }
      };
      const channelPath = join(handlers.channelsDir, 'to-delete.yaml');
      writeFileSync(channelPath, yaml.dump(channelData));

      await handlers.handleDelete(ws, { name: 'to-delete' });

      const broadcast = server.getLastBroadcast();
      expect(broadcast.type).toBe('channel:deleted');
      expect(broadcast.channel).toBe('to-delete');
    });
  });

  describe('handleList', () => {
    test('lists all channels', async () => {
      // Create multiple channels
      for (let i = 1; i <= 3; i++) {
        const channelData = {
          metadata: {
            name: `channel-${i}`,
            created: new Date().toISOString()
          },
          spec: {
            sessions: []
          }
        };
        const channelPath = join(handlers.channelsDir, `channel-${i}.yaml`);
        writeFileSync(channelPath, yaml.dump(channelData));
      }

      await handlers.handleList(ws, {});

      const lastMessage = ws.getLastMessage();
      expect(lastMessage.type).toBe('channel:list:response');
      expect(lastMessage.channels.length).toBeGreaterThanOrEqual(3);
      expect(lastMessage.channels.some(c => c.metadata.name === 'channel-1')).toBe(true);
    });

    test('returns empty array when no channels exist', async () => {
      await handlers.handleList(ws, {});

      const lastMessage = ws.getLastMessage();
      expect(lastMessage.type).toBe('channel:list:response');
      expect(lastMessage.channels).toEqual([]);
    });
  });

  describe('handleGet', () => {
    test('gets a specific channel', async () => {
      // Create channel
      const channelData = {
        metadata: {
          name: 'test-channel',
          description: 'Test',
          created: new Date().toISOString()
        },
        spec: {
          sessions: [1, 2, 3]
        }
      };
      const channelPath = join(handlers.channelsDir, 'test-channel.yaml');
      writeFileSync(channelPath, yaml.dump(channelData));

      await handlers.handleGet(ws, { name: 'test-channel' });

      const lastMessage = ws.getLastMessage();
      expect(lastMessage.type).toBe('channel:get');
      expect(lastMessage.channel.metadata.name).toBe('test-channel');
      expect(lastMessage.channel.spec.sessions).toEqual([1, 2, 3]);
    });

    test('throws error when channel not found', async () => {
      await expect(handlers.handleGet(ws, { name: 'non-existent' })).rejects.toThrow();
    });

    test('throws error when name is missing', async () => {
      await expect(handlers.handleGet(ws, {})).rejects.toThrow('Channel name is required');
    });
  });

  describe('handleAddAgent', () => {
    test('adds session to channel', async () => {
      // Create channel
      const channelData = {
        metadata: {
          name: 'test-channel',
          created: new Date().toISOString()
        },
        spec: {
          sessions: []
        }
      };
      const channelPath = join(handlers.channelsDir, 'test-channel.yaml');
      writeFileSync(channelPath, yaml.dump(channelData));

      await handlers.handleAddAgent(ws, {
        channel: 'test-channel',
        session_id: 123
      });

      // Read channel file and verify session was added
      const content = readFileSync(channelPath, 'utf8');
      const updatedChannel = yaml.load(content);
      expect(updatedChannel.spec.sessions).toContain(123);
    });

    test('does not add duplicate sessions', async () => {
      // Create channel with existing session
      const channelData = {
        metadata: {
          name: 'test-channel',
          created: new Date().toISOString()
        },
        spec: {
          sessions: [123]
        }
      };
      const channelPath = join(handlers.channelsDir, 'test-channel.yaml');
      writeFileSync(channelPath, yaml.dump(channelData));

      await handlers.handleAddAgent(ws, {
        channel: 'test-channel',
        session_id: 123
      });

      const content = readFileSync(channelPath, 'utf8');
      const updatedChannel = yaml.load(content);
      expect(updatedChannel.spec.sessions).toEqual([123]);
    });
  });

  describe('handleRemoveAgent', () => {
    test('removes session from channel', async () => {
      // Create channel with sessions
      const channelData = {
        metadata: {
          name: 'test-channel',
          created: new Date().toISOString()
        },
        spec: {
          sessions: [1, 2, 3]
        }
      };
      const channelPath = join(handlers.channelsDir, 'test-channel.yaml');
      writeFileSync(channelPath, yaml.dump(channelData));

      await handlers.handleRemoveAgent(ws, {
        channel: 'test-channel',
        session_id: 2
      });

      const content = readFileSync(channelPath, 'utf8');
      const updatedChannel = yaml.load(content);
      expect(updatedChannel.spec.sessions).toEqual([1, 3]);
    });

    test('does nothing when removing non-existent session', async () => {
      // Create channel
      const channelData = {
        metadata: {
          name: 'test-channel',
          created: new Date().toISOString()
        },
        spec: {
          sessions: [1, 2]
        }
      };
      const channelPath = join(handlers.channelsDir, 'test-channel.yaml');
      writeFileSync(channelPath, yaml.dump(channelData));

      await handlers.handleRemoveAgent(ws, {
        channel: 'test-channel',
        session_id: 999
      });

      const content = readFileSync(channelPath, 'utf8');
      const updatedChannel = yaml.load(content);
      expect(updatedChannel.spec.sessions).toEqual([1, 2]);
    });
  });
});
