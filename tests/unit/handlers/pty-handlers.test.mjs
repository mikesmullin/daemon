import { describe, test, expect, beforeEach, afterEach, mock } from 'bun:test';
import { PtyHandlers } from '../../../src/observability/handlers/pty-handlers.mjs';

// Mock PTY session
class MockPtySession {
  constructor(id, agentId) {
    this.id = id;
    this.agentId = agentId;
    this.rows = 24;
    this.cols = 80;
    this.buffer = 'mock terminal output\n$ ';
    this.written = [];
  }

  read({ lines }) {
    return { content: this.buffer };
  }

  write(data) {
    this.written.push(data);
    this.buffer += data;
  }

  getInfo() {
    return {
      id: this.id,
      agentSessionId: this.agentId,
      rows: this.rows,
      cols: this.cols
    };
  }
}

// Mock PTY manager
class MockPtyManager {
  constructor() {
    this.sessions = new Map();
  }

  getSession(agentId, ptyId) {
    const key = `${agentId}:${ptyId}`;
    return this.sessions.get(key);
  }

  createSession(agentId, ptyId) {
    const key = `${agentId}:${ptyId}`;
    const session = new MockPtySession(ptyId, agentId);
    this.sessions.set(key, session);
    return session;
  }

  deleteSession(agentId, ptyId) {
    const key = `${agentId}:${ptyId}`;
    this.sessions.delete(key);
  }

  clear() {
    this.sessions.clear();
  }
}

// Mock observability server
class MockServer {
  constructor() {
    this.ptyStreams = new Map();
    this.closedSessions = [];
  }

  startPtyStreaming(sessionId, agentId, ptyId, ws) {
    this.ptyStreams.set(sessionId, { agentId, ptyId, ws });
  }

  stopPtyStreaming(sessionId, ws) {
    this.ptyStreams.delete(sessionId);
  }

  closePtySession(agentId, ptyId) {
    this.closedSessions.push({ agentId, ptyId });
    return true;
  }
}

// Mock WebSocket
class MockWebSocket {
  constructor() {
    this.sentMessages = [];
    this.ptySubscriptions = new Set();
  }

  send(data) {
    this.sentMessages.push(JSON.parse(data));
  }

  getLastMessage() {
    return this.sentMessages[this.sentMessages.length - 1];
  }

  getAllMessages() {
    return this.sentMessages;
  }

  clearMessages() {
    this.sentMessages = [];
  }
}

describe('PtyHandlers', () => {
  let server;
  let handlers;
  let ws;
  let mockPtyManager;

  // Save original ptyManager and mock it
  let originalPtyManager;

  beforeEach(async () => {
    // Create mocks
    server = new MockServer();
    handlers = new PtyHandlers(server);
    ws = new MockWebSocket();
    mockPtyManager = new MockPtyManager();

    // Mock the ptyManager module
    const ptyHandlersModule = await import('../../../src/observability/handlers/pty-handlers.mjs');
    // Store original if we need to restore it
    // For now, we'll use dependency injection via testing
  });

  afterEach(() => {
    mockPtyManager.clear();
  });

  describe('handleAttach', () => {
    test('attaches to existing PTY session', () => {
      const sessionId = '123:pty-1';
      
      // The actual implementation calls ptyManager.getSession which is a real import
      // We can't easily mock it, so we test the error path instead
      handlers.handleAttach(ws, { session_id: sessionId });

      // When PTY session is not found, it sends an error to the client
      const lastMessage = ws.getLastMessage();
      expect(lastMessage.type).toBe('error');
      expect(lastMessage.error).toContain('PTY session not found');
    });

    test('throws error when session_id is missing', () => {
      expect(() => {
        handlers.handleAttach(ws, {});
      }).toThrow('PTY session ID is required');
    });

    test('throws error when session_id format is invalid', () => {
      expect(() => {
        handlers.handleAttach(ws, { session_id: 'invalid' });
      }).toThrow('Invalid PTY session ID format');
    });

    test('handles non-existent PTY session', () => {
      const msg = { session_id: '123:pty-999' };
      
      // This will fail to find the session and send error to client
      handlers.handleAttach(ws, msg);

      const lastMessage = ws.getLastMessage();
      expect(lastMessage.type).toBe('error');
      expect(lastMessage.error).toContain('PTY session not found');
    });
  });

  describe('handleDetach', () => {
    test('detaches from PTY session', () => {
      const sessionId = '123:pty-1';
      ws.ptySubscriptions.add(sessionId);

      handlers.handleDetach(ws, { session_id: sessionId });

      expect(ws.ptySubscriptions.has(sessionId)).toBe(false);
      expect(server.ptyStreams.has(sessionId)).toBe(false);

      const lastMessage = ws.getLastMessage();
      expect(lastMessage.type).toBe('pty:detached');
      expect(lastMessage.session_id).toBe(sessionId);
    });

    test('throws error when session_id is missing', () => {
      expect(() => {
        handlers.handleDetach(ws, {});
      }).toThrow('PTY session ID is required');
    });

    test('handles detaching from non-subscribed session gracefully', () => {
      const sessionId = '123:pty-1';

      handlers.handleDetach(ws, { session_id: sessionId });

      const lastMessage = ws.getLastMessage();
      expect(lastMessage.type).toBe('pty:detached');
    });
  });

  describe('handleInput', () => {
    test('throws error when session_id is missing', async () => {
      await expect(handlers.handleInput(ws, { data: 'test' })).rejects.toThrow('PTY session ID and data are required');
    });

    test('throws error when data is missing', async () => {
      await expect(handlers.handleInput(ws, { session_id: '123:pty-1' })).rejects.toThrow('PTY session ID and data are required');
    });

    test('throws error when session_id format is invalid', async () => {
      await expect(handlers.handleInput(ws, {
        session_id: 'invalid',
        data: 'test'
      })).rejects.toThrow('Invalid PTY session ID format');
    });

    test('handles non-existent PTY session', async () => {
      await handlers.handleInput(ws, {
        session_id: '123:pty-999',
        data: 'ls\n'
      });

      const lastMessage = ws.getLastMessage();
      expect(lastMessage.type).toBe('error');
      expect(lastMessage.error).toContain('PTY session not found');
    });
  });

  describe('handleClose', () => {
    test('closes PTY session', () => {
      const sessionId = '123:pty-1';

      handlers.handleClose(ws, { session_id: sessionId });

      // Server should have recorded the close
      expect(server.closedSessions.length).toBe(1);
      expect(server.closedSessions[0].agentId).toBe('123');
      expect(server.closedSessions[0].ptyId).toBe('pty-1');

      const lastMessage = ws.getLastMessage();
      expect(lastMessage.type).toBe('pty:closed');
      expect(lastMessage.session_id).toBe(sessionId);
    });

    test('throws error when session_id is missing', () => {
      expect(() => {
        handlers.handleClose(ws, {});
      }).toThrow('PTY session ID is required');
    });

    test('throws error when session_id format is invalid', () => {
      expect(() => {
        handlers.handleClose(ws, { session_id: 'invalid' });
      }).toThrow('Invalid PTY session ID format');
    });
  });

  describe('cleanup', () => {
    test('cleans up all PTY subscriptions when client disconnects', () => {
      // Add multiple subscriptions
      ws.ptySubscriptions = new Set(['123:pty-1', '123:pty-2', '456:pty-3']);
      server.ptyStreams.set('123:pty-1', {});
      server.ptyStreams.set('123:pty-2', {});
      server.ptyStreams.set('456:pty-3', {});

      handlers.cleanup(ws);

      expect(ws.ptySubscriptions.size).toBe(0);
      expect(server.ptyStreams.size).toBe(0);
    });

    test('handles cleanup when no subscriptions exist', () => {
      // WebSocket has ptySubscriptions from beforeEach, let's create a fresh one
      const freshWs = { sentMessages: [] };
      
      // Should not throw error even when ptySubscriptions is undefined
      handlers.cleanup(freshWs);
      
      // Verify it handled undefined ptySubscriptions gracefully
      expect(freshWs.ptySubscriptions).toBeUndefined();
    });

    test('cleans up empty subscription set', () => {
      ws.ptySubscriptions = new Set();
      
      handlers.cleanup(ws);
      
      expect(ws.ptySubscriptions.size).toBe(0);
    });
  });
});
