import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, rmSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { mkdirSync, writeFileSync } from 'fs';
import yaml from 'js-yaml';
import { Session } from '../../../src/lib/session.mjs';
import { _G } from '../../../src/lib/globals.mjs';

describe('Session', () => {
  let tempDir;
  let originalSessionsDir;

  beforeEach(() => {
    // Create temporary directory for test
    tempDir = mkdtempSync(join(tmpdir(), 'daemon-test-'));
    mkdirSync(join(tempDir, 'agents', 'sessions'), { recursive: true });

    // Override global sessions directory
    originalSessionsDir = _G.SESSIONS_DIR;
    _G.SESSIONS_DIR = join(tempDir, 'agents', 'sessions');
  });

  afterEach(() => {
    // Restore original sessions directory
    _G.SESSIONS_DIR = originalSessionsDir;

    // Clean up temp directory
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });



  describe('FSM state management', () => {
    test('sets FSM state for session', async () => {
      // Create a test session
      const sessionData = {
        metadata: { created_at: new Date().toISOString() },
        messages: []
      };
      const sessionPath = join(_G.SESSIONS_DIR, '1.yaml');
      writeFileSync(sessionPath, yaml.dump(sessionData));

      await Session.setFSMState(1, 'running', { timestamp: '2025-11-16T12:00:00Z' });

      const content = await Session.load(1);
      expect(content.metadata.fsm_state).toBe('running');
      expect(content.metadata.fsm_state_data.timestamp).toBe('2025-11-16T12:00:00Z');
    });

    test('gets FSM state for session', async () => {
      // Create a test session with FSM state
      const sessionData = {
        metadata: {
          created_at: new Date().toISOString(),
          fsm_state: 'tool_exec',
          fsm_state_data: { tool: 'execute_shell' }
        },
        messages: []
      };
      const sessionPath = join(_G.SESSIONS_DIR, '1.yaml');
      writeFileSync(sessionPath, yaml.dump(sessionData));

      const fsmState = await Session.getFSMState(1);

      expect(fsmState.state).toBe('tool_exec');
      expect(fsmState.data.tool).toBe('execute_shell');
    });
  });

  describe('session CRUD operations', () => {
    test('creates a new session', async () => {
      const result = await Session.new('test-agent', 'Hello, world!');
      expect(result).toBeDefined();
      expect(result.session_id).toBeDefined();
      const sessionId = result.session_id;
      expect(typeof sessionId).toBe('string');
      const sessionPath = join(_G.SESSIONS_DIR, `${sessionId}.yaml`);
      expect(existsSync(sessionPath)).toBe(true);
      const content = await Session.load(sessionId);
      expect(content.spec.messages.length).toBe(1);
      expect(content.spec.messages[0].role).toBe('user');
      expect(content.spec.messages[0].content).toBe('Hello, world!');
    });

    test('loads an existing session', async () => {
      // Create a test session
      const sessionData = {
        apiVersion: 'daemon/v1',
        kind: 'Agent',
        metadata: {
          created_at: new Date().toISOString(),
          name: 'test-agent'
        },
        spec: {
          messages: [
            { role: 'user', content: 'Hello' }
          ]
        }
      };
      const sessionPath = join(_G.SESSIONS_DIR, '1.yaml');
      writeFileSync(sessionPath, yaml.dump(sessionData));

      const content = await Session.load('1');
      expect(content.metadata.name).toBe('test-agent');
      expect(content.spec.messages.length).toBe(1);
      expect(content.spec.messages[0].content).toBe('Hello');
    });

    test('saves session data', async () => {
      const sessionData = {
        apiVersion: 'daemon/v1',
        kind: 'Agent',
        metadata: {
          created_at: new Date().toISOString(),
          name: 'test-agent'
        },
        spec: {
          messages: []
        }
      };

      await Session.save('1', sessionData);

      const sessionPath = join(_G.SESSIONS_DIR, '1.yaml');
      expect(existsSync(sessionPath)).toBe(true);

      const content = await Session.load('1');
      expect(content.metadata.name).toBe('test-agent');
    });

    test('lists all sessions', async () => {
      // Create multiple test sessions
      for (let i = 1; i <= 3; i++) {
        const sessionData = {
          apiVersion: 'daemon/v1',
          kind: 'Agent',
          metadata: { created_at: new Date().toISOString() },
          spec: {
            messages: []
          }
        };
        const sessionPath = join(_G.SESSIONS_DIR, `${i}.yaml`);
        writeFileSync(sessionPath, yaml.dump(sessionData));
      }

      const sessions = await Session.list();

      expect(sessions.length).toBe(3);
      expect(sessions.map(s => s.session_id)).toContain('1');
      expect(sessions.map(s => s.session_id)).toContain('2');
      expect(sessions.map(s => s.session_id)).toContain('3');
    });
  });

  describe('message operations', () => {
    test('pushes user message to session', async () => {
      // Create a test session
      const result = await Session.new('test-agent');
      const sessionId = result.session_id;
      await Session.push(sessionId, 'Test message');

      const content = await Session.load(sessionId);
      expect(content.spec.messages.length).toBe(1);
      expect(content.spec.messages[0].role).toBe('user');
      expect(content.spec.messages[0].content).toBe('Test message');
    });

    test('prepares messages for API', () => {
      const messages = [
        { ts: '2023-01-01T00:00:00Z', role: 'user', content: 'Hello' },
        { ts: '2023-01-01T00:00:01Z', role: 'assistant', content: 'Hi', tool_calls: [{ id: '1', function: { name: 'test' } }] }
      ];
      const apiMessages = Session.prepareMessagesForAPI(messages);
      expect(apiMessages.length).toBe(2);
      expect(apiMessages[0].role).toBe('user');
      expect(apiMessages[0].content).toBe('Hello');
      expect(apiMessages[0].ts).toBeUndefined();
      expect(apiMessages[1].tool_calls).toBeDefined();
      expect(apiMessages[1].ts).toBeUndefined();
    });
  });



  describe('session validation', () => {
    test('throws error when loading non-existent session', async () => {
      await expect(Session.load(9999)).rejects.toThrow();
    });



    test('handles corrupted session YAML gracefully', async () => {
      const sessionPath = join(_G.SESSIONS_DIR, '1.yaml');
      writeFileSync(sessionPath, 'invalid: yaml: content: [unclosed');

      await expect(Session.load(1)).rejects.toThrow();
    });
  });
});
