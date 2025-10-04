// tests/unit/agent-parser.test.js
// Tests for agent file parsing and manipulation

import { readFileSync, writeFileSync, existsSync, unlinkSync, mkdirSync } from 'fs';
import { join } from 'path';
import {
  parseAgentFile,
  serializeAgentFile,
  appendMessage,
  getMessagesForAPI,
  createAgentFile,
  getLastMessage,
  isWaitingForResponse
} from '../../lib/agent-parser.js';

const FIXTURES_DIR = 'tests/fixtures';
const TEMP_DIR = 'tests/temp';

// Ensure temp directory exists
if (!existsSync(TEMP_DIR)) {
  mkdirSync(TEMP_DIR, { recursive: true });
}

describe('Agent Parser', () => {

  test('parseAgentFile - parses agent metadata', () => {
    const agent = parseAgentFile(join(FIXTURES_DIR, 'test-agent.md'));

    expect(agent.id).toBe('test-agent-001');
    expect(agent.type).toBe('test');
    expect(agent.created).toBeInstanceOf(Date);
  });

  test('parseAgentFile - parses system prompt', () => {
    const agent = parseAgentFile(join(FIXTURES_DIR, 'test-agent.md'));

    expect(agent.systemPrompt).toContain('You are a test agent');
  });

  test('parseAgentFile - parses messages', () => {
    const agent = parseAgentFile(join(FIXTURES_DIR, 'test-agent.md'));

    expect(agent.messages.length).toBeGreaterThan(0);
    expect(agent.messages[0].role).toBe('user');
    expect(agent.messages[0].content).toContain('Test message 1');
  });

  test('parseAgentFile - throws on missing file', () => {
    expect(() => {
      parseAgentFile('nonexistent.md');
    }).toThrow('Agent file not found');
  });

  test('serializeAgentFile - creates valid markdown', () => {
    const agent = {
      id: 'serialize-test',
      type: 'test',
      created: new Date('2025-10-04T10:00:00Z'),
      systemPrompt: 'Test prompt',
      messages: [
        {
          timestamp: new Date('2025-10-04T10:00:00Z'),
          role: 'user',
          content: 'Test message'
        }
      ],
      metadata: {}
    };

    const serialized = serializeAgentFile(agent);

    expect(serialized).toContain('# Agent: serialize-test');
    expect(serialized).toContain('type: test');
    expect(serialized).toContain('## System Prompt');
    expect(serialized).toContain('Test prompt');
    expect(serialized).toContain('## Conversation');
    expect(serialized).toContain('### 2025-10-04 10:00:00 | user');
    expect(serialized).toContain('Test message');
  });

  test('createAgentFile - creates new agent file', () => {
    const testFile = join(TEMP_DIR, 'created-agent.md');

    // Clean up if exists
    if (existsSync(testFile)) {
      unlinkSync(testFile);
    }

    const agent = createAgentFile(testFile, {
      id: 'created-001',
      type: 'test',
      systemPrompt: 'Created test agent'
    });

    expect(existsSync(testFile)).toBe(true);
    expect(agent.id).toBe('created-001');
    expect(agent.type).toBe('test');

    // Clean up
    unlinkSync(testFile);
  });

  test('appendMessage - adds message to agent file', () => {
    const testFile = join(TEMP_DIR, 'append-test.md');

    // Create initial file
    createAgentFile(testFile, {
      id: 'append-001',
      type: 'test',
      systemPrompt: 'Test'
    });

    // Append message
    appendMessage(testFile, {
      role: 'user',
      content: 'New message'
    });

    // Verify
    const agent = parseAgentFile(testFile);
    expect(agent.messages.length).toBe(1);
    expect(agent.messages[0].content).toBe('New message');

    // Clean up
    unlinkSync(testFile);
  });

  test('getMessagesForAPI - converts to OpenAI format', () => {
    const agent = parseAgentFile(join(FIXTURES_DIR, 'test-agent.md'));
    const messages = getMessagesForAPI(agent);

    expect(messages.length).toBeGreaterThan(0);
    expect(messages[0].role).toBe('system');
    expect(messages[0].content).toContain('test agent');
  });

  test('getLastMessage - returns last message', () => {
    const testFile = join(TEMP_DIR, 'last-msg-test.md');

    createAgentFile(testFile, {
      id: 'last-001',
      type: 'test',
      systemPrompt: 'Test'
    });

    appendMessage(testFile, { role: 'user', content: 'First' });
    appendMessage(testFile, { role: 'assistant', content: 'Second' });

    const lastMsg = getLastMessage(testFile);
    expect(lastMsg.content).toBe('Second');
    expect(lastMsg.role).toBe('assistant');

    // Clean up
    unlinkSync(testFile);
  });

  test('isWaitingForResponse - detects user message', () => {
    const testFile = join(TEMP_DIR, 'waiting-test.md');

    createAgentFile(testFile, {
      id: 'wait-001',
      type: 'test',
      systemPrompt: 'Test'
    });

    appendMessage(testFile, { role: 'user', content: 'Question?' });
    expect(isWaitingForResponse(testFile)).toBe(true);

    appendMessage(testFile, { role: 'assistant', content: 'Answer' });
    expect(isWaitingForResponse(testFile)).toBe(false);

    // Clean up
    unlinkSync(testFile);
  });

  test('round-trip - parse and serialize maintains data', () => {
    const original = parseAgentFile(join(FIXTURES_DIR, 'test-agent.md'));
    const serialized = serializeAgentFile(original);

    const testFile = join(TEMP_DIR, 'roundtrip-test.md');
    writeFileSync(testFile, serialized, 'utf8');

    const reparsed = parseAgentFile(testFile);

    expect(reparsed.id).toBe(original.id);
    expect(reparsed.type).toBe(original.type);
    expect(reparsed.messages.length).toBe(original.messages.length);

    // Clean up
    unlinkSync(testFile);
  });
});
