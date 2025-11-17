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

  describe('BT state management', () => {
    test('validates valid BT states', () => {
      expect(Session._isValidBtState('pending')).toBe(true);
      expect(Session._isValidBtState('running')).toBe(true);
      expect(Session._isValidBtState('fail')).toBe(true);
      expect(Session._isValidBtState('success')).toBe(true);
    });

    test('rejects invalid BT states', () => {
      expect(Session._isValidBtState('invalid')).toBe(false);
      expect(Session._isValidBtState('RUNNING')).toBe(false);
      expect(Session._isValidBtState('')).toBe(false);
    });

    test('sets BT state for session', async () => {
      // Create a test session
      const sessionData = {
        metadata: { created_at: new Date().toISOString() },
        messages: []
      };
      const sessionPath = join(_G.SESSIONS_DIR, '1.yaml');
      writeFileSync(sessionPath, yaml.dump(sessionData));

      await Session.setState(1, 'running');

      const content = await Session.load(1);
      expect(content.metadata.bt_state).toBe('running');
    });

    test('gets BT state for session', async () => {
      // Create a test session with BT state
      const sessionData = {
        metadata: {
          created_at: new Date().toISOString(),
          bt_state: 'success'
        },
        messages: []
      };
      const sessionPath = join(_G.SESSIONS_DIR, '1.yaml');
      writeFileSync(sessionPath, yaml.dump(sessionData));

      const state = await Session.getState(1);

      expect(state).toBe('success');
    });

    test('returns pending as default BT state', async () => {
      // Create a test session without BT state
      const sessionData = {
        metadata: { created_at: new Date().toISOString() },
        messages: []
      };
      const sessionPath = join(_G.SESSIONS_DIR, '1.yaml');
      writeFileSync(sessionPath, yaml.dump(sessionData));

      const state = await Session.getState(1);

      expect(state).toBe('pending');
    });

    test('throws error for invalid BT state value', async () => {
      // Create a test session
      const sessionData = {
        metadata: { created_at: new Date().toISOString() },
        messages: []
      };
      const sessionPath = join(_G.SESSIONS_DIR, '1.yaml');
      writeFileSync(sessionPath, yaml.dump(sessionData));

      await expect(Session.setState(1, 'invalid')).rejects.toThrow();
    });
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
      const sessionId = await Session.create({
        template: 'test-agent',
        prompt: 'Hello, world!'
      });

      expect(sessionId).toBeDefined();
      expect(typeof sessionId).toBe('number');

      const sessionPath = join(_G.SESSIONS_DIR, `${sessionId}.yaml`);
      expect(existsSync(sessionPath)).toBe(true);
    });

    test('loads an existing session', async () => {
      // Create a test session
      const sessionData = {
        metadata: {
          created_at: new Date().toISOString(),
          template: 'test-agent'
        },
        messages: [
          { type: 'USER_REQUEST', content: 'Hello' }
        ]
      };
      const sessionPath = join(_G.SESSIONS_DIR, '1.yaml');
      writeFileSync(sessionPath, yaml.dump(sessionData));

      const content = await Session.load(1);

      expect(content.metadata.template).toBe('test-agent');
      expect(content.messages.length).toBe(1);
      expect(content.messages[0].content).toBe('Hello');
    });

    test('saves session data', async () => {
      const sessionData = {
        metadata: {
          created_at: new Date().toISOString(),
          template: 'test-agent'
        },
        messages: []
      };

      await Session.save(1, sessionData);

      const sessionPath = join(_G.SESSIONS_DIR, '1.yaml');
      expect(existsSync(sessionPath)).toBe(true);

      const content = await Session.load(1);
      expect(content.metadata.template).toBe('test-agent');
    });

    test('deletes a session', async () => {
      // Create a test session
      const sessionData = {
        metadata: { created_at: new Date().toISOString() },
        messages: []
      };
      const sessionPath = join(_G.SESSIONS_DIR, '1.yaml');
      writeFileSync(sessionPath, yaml.dump(sessionData));

      await Session.delete(1);

      expect(existsSync(sessionPath)).toBe(false);
    });

    test('lists all sessions', async () => {
      // Create multiple test sessions
      for (let i = 1; i <= 3; i++) {
        const sessionData = {
          metadata: { created_at: new Date().toISOString() },
          messages: []
        };
        const sessionPath = join(_G.SESSIONS_DIR, `${i}.yaml`);
        writeFileSync(sessionPath, yaml.dump(sessionData));
      }

      const sessions = await Session.list();

      expect(sessions.length).toBeGreaterThanOrEqual(3);
      expect(sessions).toContain('1');
      expect(sessions).toContain('2');
      expect(sessions).toContain('3');
    });
  });

  describe('message operations', () => {
    test('appends message to session', async () => {
      // Create a test session
      const sessionData = {
        metadata: { created_at: new Date().toISOString() },
        messages: []
      };
      const sessionPath = join(_G.SESSIONS_DIR, '1.yaml');
      writeFileSync(sessionPath, yaml.dump(sessionData));

      await Session.appendMessage(1, {
        type: 'USER_REQUEST',
        content: 'Test message'
      });

      const content = await Session.load(1);
      expect(content.messages.length).toBe(1);
      expect(content.messages[0].type).toBe('USER_REQUEST');
      expect(content.messages[0].content).toBe('Test message');
    });

    test('gets all messages from session', async () => {
      // Create a test session with messages
      const sessionData = {
        metadata: { created_at: new Date().toISOString() },
        messages: [
          { type: 'USER_REQUEST', content: 'Message 1' },
          { type: 'RESPONSE', content: 'Message 2' }
        ]
      };
      const sessionPath = join(_G.SESSIONS_DIR, '1.yaml');
      writeFileSync(sessionPath, yaml.dump(sessionData));

      const messages = await Session.getMessages(1);

      expect(messages.length).toBe(2);
      expect(messages[0].content).toBe('Message 1');
      expect(messages[1].content).toBe('Message 2');
    });

    test('transforms messages for API', async () => {
      // Create a test session with messages
      const sessionData = {
        metadata: { created_at: new Date().toISOString() },
        messages: [
          { type: 'USER_REQUEST', content: 'Hello' },
          { type: 'RESPONSE', content: 'Hi there!' },
          { type: 'TOOL_CALL', name: 'execute_shell', arguments: { command: 'ls' } },
          { type: 'TOOL_RESPONSE', result: 'file1.txt\nfile2.txt' }
        ]
      };
      const sessionPath = join(_G.SESSIONS_DIR, '1.yaml');
      writeFileSync(sessionPath, yaml.dump(sessionData));

      const apiMessages = await Session.transformMessagesForAPI(1);

      expect(apiMessages.length).toBeGreaterThan(0);
      // Should include user and assistant messages
      expect(apiMessages.some(m => m.role === 'user')).toBe(true);
    });
  });

  describe('session metadata', () => {
    test('updates session metadata', async () => {
      // Create a test session
      const sessionData = {
        metadata: {
          created_at: new Date().toISOString(),
          template: 'test-agent'
        },
        messages: []
      };
      const sessionPath = join(_G.SESSIONS_DIR, '1.yaml');
      writeFileSync(sessionPath, yaml.dump(sessionData));

      await Session.updateMetadata(1, {
        custom_field: 'custom_value'
      });

      const content = await Session.load(1);
      expect(content.metadata.custom_field).toBe('custom_value');
      expect(content.metadata.template).toBe('test-agent'); // Should preserve existing metadata
    });

    test('gets session metadata', async () => {
      // Create a test session
      const sessionData = {
        metadata: {
          created_at: new Date().toISOString(),
          template: 'test-agent',
          custom_field: 'test'
        },
        messages: []
      };
      const sessionPath = join(_G.SESSIONS_DIR, '1.yaml');
      writeFileSync(sessionPath, yaml.dump(sessionData));

      const metadata = await Session.getMetadata(1);

      expect(metadata.template).toBe('test-agent');
      expect(metadata.custom_field).toBe('test');
    });
  });

  describe('session validation', () => {
    test('throws error when loading non-existent session', async () => {
      await expect(Session.load(9999)).rejects.toThrow();
    });

    test('throws error when deleting non-existent session', async () => {
      await expect(Session.delete(9999)).rejects.toThrow();
    });

    test('handles corrupted session YAML gracefully', async () => {
      const sessionPath = join(_G.SESSIONS_DIR, '1.yaml');
      writeFileSync(sessionPath, 'invalid: yaml: content: [unclosed');

      await expect(Session.load(1)).rejects.toThrow();
    });
  });
});
