import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { mkdirSync, writeFileSync } from 'fs';
import yaml from 'js-yaml';
import { ChannelManager, Channel } from '../../../src/observability/channel-manager.mjs';

describe('Channel', () => {
  test('creates a new channel with default values', () => {
    const channel = new Channel({ name: 'test' });
    
    expect(channel.name).toBe('test');
    expect(channel.description).toBe('');
    expect(channel.labels).toEqual([]);
    expect(channel.agentSessions).toEqual([]);
    expect(channel.createdAt).toBeDefined();
    expect(channel.updatedAt).toBeDefined();
  });

  test('creates a channel with custom values', () => {
    const channel = new Channel({
      name: 'dev',
      description: 'Development channel',
      labels: ['dev', 'testing'],
      agent_sessions: [1, 2, 3]
    });

    expect(channel.name).toBe('dev');
    expect(channel.description).toBe('Development channel');
    expect(channel.labels).toEqual(['dev', 'testing']);
    expect(channel.agentSessions).toEqual([1, 2, 3]);
  });

  test('converts to YAML format correctly', () => {
    const channel = new Channel({
      name: 'test',
      description: 'Test channel',
      labels: ['test'],
      agent_sessions: [1, 2]
    });

    const yamlData = channel.toYAML();

    expect(yamlData.metadata.name).toBe('test');
    expect(yamlData.spec.description).toBe('Test channel');
    expect(yamlData.spec.labels).toEqual(['test']);
    expect(yamlData.spec.agent_sessions).toEqual([1, 2]);
  });

  test('adds session to channel', async () => {
    const channel = new Channel({ name: 'test' });
    const initialUpdatedAt = channel.updatedAt;

    // Wait a bit to ensure timestamp changes
    await new Promise(resolve => setTimeout(resolve, 10));
    channel.addSession(1);

    expect(channel.agentSessions).toContain(1);
    expect(channel.updatedAt).not.toBe(initialUpdatedAt);
  });

  test('does not add duplicate sessions', () => {
    const channel = new Channel({ name: 'test' });

    channel.addSession(1);
    channel.addSession(1);

    expect(channel.agentSessions).toEqual([1]);
  });

  test('removes session from channel', () => {
    const channel = new Channel({
      name: 'test',
      agent_sessions: [1, 2, 3]
    });

    channel.removeSession(2);

    expect(channel.agentSessions).toEqual([1, 3]);
  });

  test('does nothing when removing non-existent session', () => {
    const channel = new Channel({
      name: 'test',
      agent_sessions: [1, 2]
    });

    channel.removeSession(99);

    expect(channel.agentSessions).toEqual([1, 2]);
  });
});

describe('ChannelManager', () => {
  let tempDir;
  let manager;

  beforeEach(async () => {
    // Create temporary directory for test
    tempDir = mkdtempSync(join(tmpdir(), 'daemon-test-'));
    mkdirSync(join(tempDir, 'agents', 'channels'), { recursive: true });
    mkdirSync(join(tempDir, 'agents', 'sessions'), { recursive: true });

    // Create manager instance
    manager = new ChannelManager(tempDir);
    await manager.initialize();
  });

  afterEach(() => {
    // Clean up temp directory
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('initialization', () => {
    test('creates necessary directories', async () => {
      const newTempDir = mkdtempSync(join(tmpdir(), 'daemon-test-'));
      const newManager = new ChannelManager(newTempDir);
      
      await newManager.initialize();

      const { existsSync } = await import('fs');
      expect(existsSync(join(newTempDir, 'agents', 'channels'))).toBe(true);
      expect(existsSync(join(newTempDir, 'agents', 'sessions'))).toBe(true);

      rmSync(newTempDir, { recursive: true, force: true });
    });

    test('loads existing channels from disk', async () => {
      // Create a channel file on disk
      const channelData = {
        metadata: {
          name: 'existing-channel',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        },
        spec: {
          agent_sessions: [1, 2],
          description: 'Existing channel',
          labels: ['test']
        }
      };

      const channelPath = join(tempDir, 'agents', 'channels', 'existing-channel.yaml');
      writeFileSync(channelPath, yaml.dump(channelData));

      // Create new manager to load the channel
      const newManager = new ChannelManager(tempDir);
      await newManager.initialize();

      const channel = newManager.getChannel('existing-channel');
      expect(channel).toBeDefined();
      expect(channel.name).toBe('existing-channel');
      expect(channel.agentSessions).toEqual([1, 2]);
    });
  });

  describe('channel CRUD operations', () => {
    test('creates a new channel', async () => {
      const channel = await manager.createChannel('dev', 'Development channel');

      expect(channel.name).toBe('dev');
      expect(channel.description).toBe('Development channel');
      expect(manager.channels.has('dev')).toBe(true);
    });

    test('throws error when creating duplicate channel', async () => {
      await manager.createChannel('dev');

      await expect(manager.createChannel('dev')).rejects.toThrow("Channel 'dev' already exists");
    });

    test('gets an existing channel', async () => {
      await manager.createChannel('test');

      const channel = manager.getChannel('test');

      expect(channel).toBeDefined();
      expect(channel.name).toBe('test');
    });

    test('returns undefined for non-existent channel', () => {
      const channel = manager.getChannel('non-existent');

      expect(channel).toBeUndefined();
    });

    test('deletes a channel', async () => {
      await manager.createChannel('temp');

      await manager.deleteChannel('temp');

      expect(manager.channels.has('temp')).toBe(false);
    });

    test('throws error when deleting non-existent channel', async () => {
      await expect(manager.deleteChannel('non-existent')).rejects.toThrow("Channel 'non-existent' does not exist");
    });

    test('saves channel to disk', async () => {
      const channel = await manager.createChannel('persistent');

      // Check that file was created
      const { existsSync } = await import('fs');
      const channelPath = join(tempDir, 'agents', 'channels', 'persistent.yaml');
      expect(existsSync(channelPath)).toBe(true);
    });
  });

  describe('session management', () => {
    test('adds session to channel', async () => {
      await manager.createChannel('dev');
      await manager.addSessionToChannel('dev', 123);

      const channel = manager.getChannel('dev');
      expect(channel.agentSessions).toContain(123);
    });

    test('throws error when adding session to non-existent channel', async () => {
      await expect(manager.addSessionToChannel('non-existent', 123)).rejects.toThrow("Channel 'non-existent' does not exist");
    });

    test('removes session from channel', async () => {
      await manager.createChannel('dev');
      await manager.addSessionToChannel('dev', 123);
      await manager.removeSessionFromChannel('dev', 123);

      const channel = manager.getChannel('dev');
      expect(channel.agentSessions).not.toContain(123);
    });

    test('throws error when removing session from non-existent channel', async () => {
      await expect(manager.removeSessionFromChannel('non-existent', 123)).rejects.toThrow("Channel 'non-existent' does not exist");
    });

    test('tracks session to channel mapping', async () => {
      await manager.createChannel('dev');
      await manager.addSessionToChannel('dev', 123);

      const channelName = manager.getChannelForSession(123);

      expect(channelName).toBe('dev');
    });

    test('removes session to channel mapping on delete', async () => {
      await manager.createChannel('dev');
      await manager.addSessionToChannel('dev', 123);
      await manager.deleteChannel('dev');

      const channelName = manager.getChannelForSession(123);

      expect(channelName).toBeUndefined();
    });
  });

  describe('WebSocket client management', () => {
    test('adds WebSocket client', () => {
      const mockClient = { id: 'client1', readyState: 1 };
      manager.addClient(mockClient);

      expect(manager.wsClients.has(mockClient)).toBe(true);
    });

    test('removes WebSocket client', () => {
      const mockClient = { id: 'client1', readyState: 1 };
      manager.addClient(mockClient);
      manager.removeClient(mockClient);

      expect(manager.wsClients.has(mockClient)).toBe(false);
    });
  });

  describe('event emission', () => {
    test('emits events to all WebSocket clients', () => {
      const sentMessages = [];
      const mockClient = {
        readyState: 1, // OPEN
        send: (data) => sentMessages.push(data)
      };

      manager.addClient(mockClient);
      manager.emit('test:event', { data: 'test' });

      expect(sentMessages.length).toBe(1);
      const message = JSON.parse(sentMessages[0]);
      expect(message.type).toBe('test:event');
      expect(message.data.data).toBe('test');
    });

    test('does not send to closed clients', () => {
      const sentMessages = [];
      const mockClient = {
        readyState: 3, // CLOSED
        send: (data) => sentMessages.push(data)
      };

      manager.addClient(mockClient);
      manager.emit('test:event', { data: 'test' });

      expect(sentMessages.length).toBe(0);
    });
  });

  describe('getAllSessions', () => {
    test('returns sessions from all channels', async () => {
      await manager.createChannel('dev');
      await manager.createChannel('prod');
      
      // Register sessions with the manager
      manager.registerSession(1, { channelName: 'dev' });
      manager.registerSession(2, { channelName: 'dev' });
      manager.registerSession(3, { channelName: 'prod' });

      const sessions = manager.getAllSessions();

      expect(sessions.length).toBe(3);
      expect(sessions.some(s => s.id === 1)).toBe(true);
      expect(sessions.some(s => s.id === 2)).toBe(true);
      expect(sessions.some(s => s.id === 3)).toBe(true);
    });

    test('returns empty array when no sessions registered', () => {
      const sessions = manager.getAllSessions();

      expect(sessions).toEqual([]);
    });
  });
});
