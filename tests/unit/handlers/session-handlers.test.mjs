import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, rmSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { mkdirSync, writeFileSync, readFileSync } from 'fs';
import yaml from 'js-yaml';
import { SessionHandlers } from '../../../src/observability/handlers/session-handlers.mjs';

// Mock channel manager
class MockChannelManager {
  constructor() {
    this.emissions = [];
  }

  emit(eventType, data) {
    this.emissions.push({ eventType, data });
  }

  getLastEmission() {
    return this.emissions[this.emissions.length - 1];
  }

  clearEmissions() {
    this.emissions = [];
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

describe('SessionHandlers', () => {
  let tempDir;
  let channelManager;
  let handlers;
  let ws;

  beforeEach(() => {
    // Create temporary directory for test
    tempDir = mkdtempSync(join(tmpdir(), 'daemon-test-'));
    
    // Create mock channel manager
    channelManager = new MockChannelManager();
    
    // Create handlers
    handlers = new SessionHandlers(channelManager, tempDir);
    
    // Create sessions directory
    const sessionsDir = join(tempDir, 'agents', 'sessions');
    mkdirSync(sessionsDir, { recursive: true });
    
    // Create mock WebSocket
    ws = new MockWebSocket();
  });

  afterEach(() => {
    // Clean up temp directory
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('handleUpdate', () => {
    test('updates a session with valid YAML', async () => {
      const sessionId = 123;
      const originalYaml = yaml.dump({
        metadata: {
          name: 'test-agent',
          session_id: sessionId,
          created: '2024-01-01T00:00:00.000Z'
        },
        spec: {
          messages: [
            { ts: '2024-01-01T00:00:00.000Z', role: 'user', content: 'Hello' }
          ]
        }
      });

      // Create original session file
      const sessionPath = join(tempDir, 'agents', 'sessions', `${sessionId}.yaml`);
      writeFileSync(sessionPath, originalYaml);

      // Update with new YAML
      const updatedYaml = yaml.dump({
        metadata: {
          name: 'test-agent',
          session_id: sessionId,
          created: '2024-01-01T00:00:00.000Z'
        },
        spec: {
          messages: [
            { ts: '2024-01-01T00:00:00.000Z', role: 'user', content: 'Hello' },
            { ts: '2024-01-01T00:01:00.000Z', role: 'assistant', content: 'Hi there!' }
          ]
        }
      });

      await handlers.handleUpdate(ws, {
        session_id: sessionId,
        yaml: updatedYaml
      });

      // Verify response
      const lastMessage = ws.getLastMessage();
      expect(lastMessage.type).toBe('session:updated');
      expect(lastMessage.session_id).toBe(sessionId);

      // Verify file was updated
      const fileContent = readFileSync(sessionPath, 'utf8');
      expect(fileContent).toBe(updatedYaml);

      // Verify emission
      const emission = channelManager.getLastEmission();
      expect(emission.eventType).toBe('session:updated');
      expect(emission.data.session_id).toBe(sessionId);
    });

    test('throws error when session_id is missing', async () => {
      await expect(handlers.handleUpdate(ws, {
        yaml: 'metadata:\n  name: test'
      })).rejects.toThrow('Session ID and YAML content are required');
    });

    test('throws error when yaml content is missing', async () => {
      await expect(handlers.handleUpdate(ws, {
        session_id: 123
      })).rejects.toThrow('Session ID and YAML content are required');
    });

    test('throws error when YAML is invalid', async () => {
      await expect(handlers.handleUpdate(ws, {
        session_id: 123,
        yaml: 'invalid: yaml: content: [unclosed'
      })).rejects.toThrow('Invalid YAML');
    });

    test('creates session file if it does not exist', async () => {
      const sessionId = 456;
      const sessionPath = join(tempDir, 'agents', 'sessions', `${sessionId}.yaml`);

      // Verify file doesn't exist yet
      expect(existsSync(sessionPath)).toBe(false);

      const newYaml = yaml.dump({
        metadata: { name: 'new-agent', session_id: sessionId },
        spec: { messages: [] }
      });

      await handlers.handleUpdate(ws, {
        session_id: sessionId,
        yaml: newYaml
      });

      // Verify file was created
      expect(existsSync(sessionPath)).toBe(true);
      expect(readFileSync(sessionPath, 'utf8')).toBe(newYaml);
    });

    test('handles empty YAML content', async () => {
      const sessionId = 789;
      const emptyYaml = '';

      // Empty YAML should be treated as null/undefined by yaml.load
      // This should throw an invalid YAML error or handle gracefully
      await expect(handlers.handleUpdate(ws, {
        session_id: sessionId,
        yaml: emptyYaml
      })).rejects.toThrow();
    });

    test('preserves exact YAML formatting', async () => {
      const sessionId = 111;
      const sessionPath = join(tempDir, 'agents', 'sessions', `${sessionId}.yaml`);

      // Use specific YAML formatting
      const formattedYaml = `metadata:
  name: test
  session_id: ${sessionId}
spec:
  messages:
    - ts: "2024-01-01T00:00:00.000Z"
      role: user
      content: Hello
`;

      await handlers.handleUpdate(ws, {
        session_id: sessionId,
        yaml: formattedYaml
      });

      // File should have exact same content
      const fileContent = readFileSync(sessionPath, 'utf8');
      expect(fileContent).toBe(formattedYaml);
    });

    test('handles complex nested YAML structures', async () => {
      const sessionId = 222;
      const complexYaml = yaml.dump({
        metadata: {
          name: 'complex-agent',
          session_id: sessionId,
          tags: ['tag1', 'tag2'],
          config: {
            nested: {
              deep: {
                value: 'test'
              }
            }
          }
        },
        spec: {
          messages: [],
          tools: [
            { name: 'tool1', enabled: true },
            { name: 'tool2', enabled: false }
          ]
        }
      });

      await handlers.handleUpdate(ws, {
        session_id: sessionId,
        yaml: complexYaml
      });

      const sessionPath = join(tempDir, 'agents', 'sessions', `${sessionId}.yaml`);
      const fileContent = readFileSync(sessionPath, 'utf8');
      const parsed = yaml.load(fileContent);

      expect(parsed.metadata.config.nested.deep.value).toBe('test');
      expect(parsed.spec.tools.length).toBe(2);
    });
  });
});
