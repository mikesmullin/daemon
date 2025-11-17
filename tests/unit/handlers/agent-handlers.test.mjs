import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, rmSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { mkdirSync, writeFileSync, readFileSync } from 'fs';
import yaml from 'js-yaml';
import { AgentHandlers } from '../../../src/observability/handlers/agent-handlers.mjs';

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

describe('AgentHandlers', () => {
  let tempDir;
  let server;
  let handlers;
  let ws;

  beforeEach(() => {
    // Create temporary directory for test
    tempDir = mkdtempSync(join(tmpdir(), 'daemon-test-'));
    
    // Create mock server and handlers
    server = new MockServer();
    handlers = new AgentHandlers(server);
    
    // Override directories to use temp dir
    handlers.workspaceRoot = tempDir;
    handlers.sessionsDir = join(tempDir, 'agents', 'sessions');
    handlers.channelsDir = join(tempDir, 'agents', 'channels');
    handlers.templatesDir = join(tempDir, 'agents', 'templates');
    handlers.procDir = join(tempDir, 'agents', 'proc');
    
    // Create directories
    mkdirSync(handlers.sessionsDir, { recursive: true });
    mkdirSync(handlers.channelsDir, { recursive: true });
    mkdirSync(handlers.templatesDir, { recursive: true });
    mkdirSync(handlers.procDir, { recursive: true });
    
    // Create mock WebSocket
    ws = new MockWebSocket();
  });

  afterEach(() => {
    // Clean up temp directory
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('handleInvite', () => {
    test('invites a new agent to a channel', async () => {
      // Create a test channel first
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

      await handlers.handleInvite(ws, {
        channel: 'test-channel',
        template: 'solo',
        prompt: 'Hello agent'
      });

      const lastMessage = ws.getLastMessage();
      expect(lastMessage.type).toBe('agent:invited');
      expect(lastMessage.channel).toBe('test-channel');
      expect(lastMessage.agent).toBe('solo');
      expect(lastMessage.session_id).toBeDefined();

      // Check that session file was created
      const sessionId = lastMessage.session_id;
      const sessionPath = join(handlers.sessionsDir, `${sessionId}.yaml`);
      expect(existsSync(sessionPath)).toBe(true);

      // Verify session content
      const sessionContent = readFileSync(sessionPath, 'utf8');
      const sessionData = yaml.load(sessionContent);
      expect(sessionData.metadata.name).toBe('solo');
      expect(sessionData.metadata.channel).toBe('test-channel');
      expect(sessionData.spec.messages[0].content).toBe('Hello agent');

      // Check that proc file was created
      const procPath = join(handlers.procDir, String(sessionId));
      expect(existsSync(procPath)).toBe(true);
      expect(readFileSync(procPath, 'utf8')).toBe('pending');

      // Verify channel was updated
      const updatedChannelContent = readFileSync(channelPath, 'utf8');
      const updatedChannelData = yaml.load(updatedChannelContent);
      expect(updatedChannelData.spec.sessions).toContain(sessionId);

      // Check broadcast
      const broadcast = server.getLastBroadcast();
      expect(broadcast.type).toBe('agent:invited');
      expect(broadcast.session_id).toBe(sessionId);
    });

    test('uses default prompt when not provided', async () => {
      const channelData = {
        metadata: { name: 'test-channel', created: new Date().toISOString() },
        spec: { sessions: [] }
      };
      writeFileSync(join(handlers.channelsDir, 'test-channel.yaml'), yaml.dump(channelData));

      await handlers.handleInvite(ws, {
        channel: 'test-channel',
        template: 'solo'
      });

      const lastMessage = ws.getLastMessage();
      const sessionId = lastMessage.session_id;
      const sessionPath = join(handlers.sessionsDir, `${sessionId}.yaml`);
      const sessionData = yaml.load(readFileSync(sessionPath, 'utf8'));
      
      expect(sessionData.spec.messages[0].content).toBe('You have been invited to the channel');
    });

    test('throws error when channel is missing', async () => {
      await expect(handlers.handleInvite(ws, {
        template: 'solo'
      })).rejects.toThrow('Channel and template are required');
    });

    test('throws error when template is missing', async () => {
      await expect(handlers.handleInvite(ws, {
        channel: 'test-channel'
      })).rejects.toThrow('Channel and template are required');
    });

    test('handles non-existent channel gracefully', async () => {
      // Should still create session even if channel file doesn't exist
      await handlers.handleInvite(ws, {
        channel: 'non-existent',
        template: 'solo',
        prompt: 'Test'
      });

      const lastMessage = ws.getLastMessage();
      expect(lastMessage.type).toBe('agent:invited');
      expect(lastMessage.session_id).toBeDefined();
    });
  });

  describe('handlePause', () => {
    test('pauses an agent session', async () => {
      const sessionId = 123;
      
      await handlers.handlePause(ws, { session_id: sessionId });

      const lastMessage = ws.getLastMessage();
      expect(lastMessage.type).toBe('agent:paused');
      expect(lastMessage.session_id).toBe(sessionId);

      // Check proc file was updated
      const procPath = join(handlers.procDir, String(sessionId));
      expect(existsSync(procPath)).toBe(true);
      expect(readFileSync(procPath, 'utf8')).toBe('paused');

      // Check broadcast
      const broadcast = server.getLastBroadcast();
      expect(broadcast.type).toBe('agent:paused');
      expect(broadcast.session_id).toBe(sessionId);
    });

    test('throws error when session_id is missing', async () => {
      await expect(handlers.handlePause(ws, {})).rejects.toThrow('Session ID is required');
    });
  });

  describe('handleResume', () => {
    test('resumes a paused agent session', async () => {
      const sessionId = 123;
      
      // First pause it
      writeFileSync(join(handlers.procDir, String(sessionId)), 'paused');

      await handlers.handleResume(ws, { session_id: sessionId });

      const lastMessage = ws.getLastMessage();
      expect(lastMessage.type).toBe('agent:resumed');
      expect(lastMessage.session_id).toBe(sessionId);

      // Check proc file was updated to pending
      const procPath = join(handlers.procDir, String(sessionId));
      expect(readFileSync(procPath, 'utf8')).toBe('pending');

      // Check broadcast
      const broadcast = server.getLastBroadcast();
      expect(broadcast.type).toBe('agent:resumed');
      expect(broadcast.session_id).toBe(sessionId);
    });

    test('throws error when session_id is missing', async () => {
      await expect(handlers.handleResume(ws, {})).rejects.toThrow('Session ID is required');
    });
  });

  describe('handleStop', () => {
    test('stops an agent session', async () => {
      const sessionId = 123;
      
      // Create proc file first
      writeFileSync(join(handlers.procDir, String(sessionId)), 'pending');

      await handlers.handleStop(ws, { session_id: sessionId });

      const lastMessage = ws.getLastMessage();
      expect(lastMessage.type).toBe('agent:stopped');
      expect(lastMessage.session_id).toBe(sessionId);

      // Check proc file was removed
      const procPath = join(handlers.procDir, String(sessionId));
      expect(existsSync(procPath)).toBe(false);

      // Check broadcast
      const broadcast = server.getLastBroadcast();
      expect(broadcast.type).toBe('agent:stopped');
      expect(broadcast.session_id).toBe(sessionId);
    });

    test('handles non-existent proc file gracefully', async () => {
      const sessionId = 999;
      
      // Don't create proc file - should still succeed
      await handlers.handleStop(ws, { session_id: sessionId });

      const lastMessage = ws.getLastMessage();
      expect(lastMessage.type).toBe('agent:stopped');
    });

    test('throws error when session_id is missing', async () => {
      await expect(handlers.handleStop(ws, {})).rejects.toThrow('Session ID is required');
    });
  });
});
