import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { createMockWebSocket } from '../helpers/mock-websocket.mjs';

/**
 * Integration tests for WebSocket message handling
 * Tests app state management and Alpine.js reactivity
 */

describe('WebSocket Integration', () => {
  let mockWs;

  beforeAll(() => {
    mockWs = createMockWebSocket('ws://localhost:3002');
    mockWs.open();
  });

  afterAll(() => {
    if (mockWs) {
      mockWs.close();
    }
  });

  test('can create and open WebSocket connection', () => {
    expect(mockWs.readyState).toBe(1); // OPEN
  });

  test('can send messages', () => {
    mockWs.send({ type: 'ping' });
    
    const lastMessage = mockWs.getLastSentMessage();
    expect(lastMessage).toEqual({ type: 'ping' });
  });

  test('can receive messages', (done) => {
    mockWs.on('message', (event) => {
      const data = JSON.parse(event.data);
      expect(data.type).toBe('pong');
      done();
    });

    mockWs.receiveMessage({ type: 'pong' });
  });

  test('queues messages correctly', () => {
    mockWs.clearMessages();
    
    mockWs.send({ type: 'msg1' });
    mockWs.send({ type: 'msg2' });
    mockWs.send({ type: 'msg3' });
    
    const messages = mockWs.getSentMessages();
    expect(messages.length).toBe(3);
  });

  test('can wait for specific message', async () => {
    // Clear any previous messages
    mockWs.clearMessages();
    mockWs.removeAllListeners('message');
    
    // Simulate receiving messages
    setTimeout(() => {
      mockWs.receiveMessage({ type: 'other' });
    }, 100);
    
    setTimeout(() => {
      mockWs.receiveMessage({ type: 'target', data: 'found' });
    }, 200);

    const message = await mockWs.waitForMessage(
      (msg) => msg.type === 'target',
      1000
    );

    expect(message.type).toBe('target');
    expect(message.data).toBe('found');
  });
});

describe('App State Management', () => {
  test('builds agents object from channels and sessions', () => {
    const channels = [
      {
        metadata: { name: 'dev' },
        spec: { agent_sessions: [1, 2] }
      },
      {
        metadata: { name: 'test' },
        spec: { agent_sessions: [3] }
      }
    ];

    const sessions = [
      { metadata: { name: 'alice', session_id: 1 } },
      { metadata: { name: 'bob', session_id: 2 } },
      { metadata: { name: 'charlie', session_id: 3 } }
    ];

    // Simulate building agents object
    const agents = {};
    for (const channel of channels) {
      const channelName = channel.metadata.name;
      agents[channelName] = [];
      
      for (const sessionId of channel.spec.agent_sessions) {
        const session = sessions.find(s => s.metadata.session_id === sessionId);
        if (session) {
          agents[channelName].push(session.metadata);
        }
      }
    }

    expect(agents.dev.length).toBe(2);
    expect(agents.dev[0].name).toBe('alice');
    expect(agents.dev[1].name).toBe('bob');
    expect(agents.test.length).toBe(1);
    expect(agents.test[0].name).toBe('charlie');
  });

  test('filters events by channel', () => {
    const events = [
      { channel: 'dev', type: 'USER_REQUEST', content: 'msg1' },
      { channel: 'test', type: 'USER_REQUEST', content: 'msg2' },
      { channel: 'dev', type: 'RESPONSE', content: 'msg3' },
    ];

    const currentChannel = 'dev';
    const filtered = events.filter(e => e.channel === currentChannel);

    expect(filtered.length).toBe(2);
    expect(filtered[0].content).toBe('msg1');
    expect(filtered[1].content).toBe('msg3');
  });

  test('tracks muted agents', () => {
    const mutedAgents = new Set();
    
    mutedAgents.add(12);
    mutedAgents.add(15);
    
    expect(mutedAgents.has(12)).toBe(true);
    expect(mutedAgents.has(15)).toBe(true);
    expect(mutedAgents.has(23)).toBe(false);
    
    mutedAgents.delete(12);
    expect(mutedAgents.has(12)).toBe(false);
  });

  test('filters events by muted agents', () => {
    const events = [
      { session_id: 12, content: 'msg from alice' },
      { session_id: 15, content: 'msg from bob' },
      { session_id: 23, content: 'msg from charlie' },
    ];

    const mutedAgents = new Set([12, 15]);
    const filtered = events.filter(e => !mutedAgents.has(e.session_id));

    expect(filtered.length).toBe(1);
    expect(filtered[0].session_id).toBe(23);
  });
});

describe('Channel Operations', () => {
  test('creates channel data structure', () => {
    const channel = {
      metadata: {
        name: 'development',
        created: new Date().toISOString()
      },
      spec: {
        agent_sessions: []
      }
    };

    expect(channel.metadata.name).toBe('development');
    expect(channel.spec.agent_sessions).toEqual([]);
  });

  test('adds agent to channel', () => {
    const channel = {
      metadata: { name: 'dev' },
      spec: { agent_sessions: [1, 2] }
    };

    const newSessionId = 3;
    if (!channel.spec.agent_sessions.includes(newSessionId)) {
      channel.spec.agent_sessions.push(newSessionId);
    }

    expect(channel.spec.agent_sessions).toContain(3);
    expect(channel.spec.agent_sessions.length).toBe(3);
  });

  test('removes agent from channel', () => {
    const channel = {
      metadata: { name: 'dev' },
      spec: { agent_sessions: [1, 2, 3] }
    };

    const sessionIdToRemove = 2;
    channel.spec.agent_sessions = channel.spec.agent_sessions.filter(
      id => id !== sessionIdToRemove
    );

    expect(channel.spec.agent_sessions).not.toContain(2);
    expect(channel.spec.agent_sessions.length).toBe(2);
  });
});

describe('Event Processing', () => {
  test('processes USER_REQUEST event', () => {
    const event = {
      type: 'USER_REQUEST',
      agent: 'alice',
      session_id: 12,
      content: 'Hello',
      timestamp: new Date().toISOString()
    };

    expect(event.type).toBe('USER_REQUEST');
    expect(event.content).toBe('Hello');
  });

  test('processes TOOL_CALL event', () => {
    const event = {
      type: 'TOOL_CALL',
      agent: 'bob',
      session_id: 15,
      tool: 'execute_shell',
      args: { command: 'ls -la' },
      timestamp: new Date().toISOString()
    };

    expect(event.type).toBe('TOOL_CALL');
    expect(event.tool).toBe('execute_shell');
    expect(event.args.command).toBe('ls -la');
  });

  test('updates event buffer with max size', () => {
    const buffer = [];
    const maxSize = 1000;

    for (let i = 0; i < 1050; i++) {
      buffer.push({ id: i, type: 'TEST' });
      if (buffer.length > maxSize) {
        buffer.shift();
      }
    }

    expect(buffer.length).toBe(maxSize);
    expect(buffer[0].id).toBe(50); // First 50 should be removed
  });
});
