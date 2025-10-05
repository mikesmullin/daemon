// tests/unit/agent-parser-yaml.test.js
// Unit tests for YAML-based agent parser

import { existsSync, unlinkSync, mkdirSync, rmSync, readdirSync } from 'fs';
import { join } from 'path';
import {
  parseAgentTemplate,
  parseSession,
  serializeAgentTemplate,
  serializeSession,
  createAgentTemplate,
  createSession,
  appendMessage,
  getMessagesForAPI,
  getLastMessage,
  isWaitingForResponse,
  updateSessionStatus,
  ensureAgentDirs
} from '../../lib/agent-parser-yaml.js';

const TEST_DIR = 'tests/yaml-unit-temp';
const TEMPLATES_DIR = 'templates';
const SESSIONS_DIR = 'sessions';

// Setup
function setupTestDirs() {
  if (!existsSync(TEMPLATES_DIR)) {
    mkdirSync(TEMPLATES_DIR, { recursive: true });
  }
  if (!existsSync(SESSIONS_DIR)) {
    mkdirSync(SESSIONS_DIR, { recursive: true });
  }
}

// Cleanup
function cleanupTestDirs() {
  // Clean up test templates
  if (existsSync(TEMPLATES_DIR)) {
    const files = readdirSync(TEMPLATES_DIR).filter(f => f.startsWith('test-'));
    for (const file of files) {
      unlinkSync(join(TEMPLATES_DIR, file));
    }
  }

  // Clean up test sessions
  if (existsSync(SESSIONS_DIR)) {
    const files = readdirSync(SESSIONS_DIR).filter(f => f.startsWith('test-'));
    for (const file of files) {
      unlinkSync(join(SESSIONS_DIR, file));
    }
  }
}

describe('YAML Agent Parser - Templates', () => {

  test('ensureAgentDirs - creates directories', () => {
    ensureAgentDirs();
    expect(existsSync(TEMPLATES_DIR)).toBe(true);
    expect(existsSync(SESSIONS_DIR)).toBe(true);
  });

  test('createAgentTemplate - creates template file', () => {
    setupTestDirs();

    const templatePath = createAgentTemplate('test-agent', {
      type: 'test',
      systemPrompt: 'You are a test agent.',
      capabilities: ['read', 'write'],
      metadata: { version: '1.0' }
    });

    expect(existsSync(templatePath)).toBe(true);

    const template = parseAgentTemplate(templatePath);
    expect(template.id).toBe('test-agent');
    expect(template.type).toBe('test');
    expect(template.systemPrompt).toBe('You are a test agent.');
    expect(template.capabilities).toEqual(['read', 'write']);
    expect(template.metadata.version).toBe('1.0');

    cleanupTestDirs();
  });

  test('serializeAgentTemplate - creates valid YAML', () => {
    const template = {
      id: 'test-serialize',
      type: 'test',
      model: 'gpt-4',
      systemPrompt: 'Test prompt',
      capabilities: ['test'],
      metadata: {}
    };

    const yaml = serializeAgentTemplate(template);
    expect(yaml).toContain('id: test-serialize');
    expect(yaml).toContain('type: test');
    expect(yaml).toContain('system_prompt: Test prompt');
  });

});

describe('YAML Agent Parser - Sessions', () => {

  test('createSession - creates session from template', () => {
    setupTestDirs();

    // First create a template
    createAgentTemplate('test-session-agent', {
      type: 'test',
      systemPrompt: 'Test system prompt',
      capabilities: []
    });

    // Create session
    const sessionPath = createSession('test-session-agent', 'test-session-1');
    expect(existsSync(sessionPath)).toBe(true);

    const session = parseSession(sessionPath);
    expect(session.sessionId).toBe('test-session-1');
    expect(session.agentId).toBe('test-session-agent');
    expect(session.agentType).toBe('test');
    expect(session.systemPrompt).toBe('Test system prompt');
    expect(session.status).toBe('active');
    expect(session.messages).toHaveLength(0);

    cleanupTestDirs();
  });

  test('appendMessage - adds message to session', () => {
    setupTestDirs();

    createAgentTemplate('test-append', {
      type: 'test',
      systemPrompt: 'Test'
    });

    const sessionPath = createSession('test-append', 'test-append-session');

    // Append user message
    appendMessage(sessionPath, {
      role: 'user',
      content: 'Hello'
    });

    const session = parseSession(sessionPath);
    expect(session.messages).toHaveLength(1);
    expect(session.messages[0].role).toBe('user');
    expect(session.messages[0].content).toBe('Hello');

    // Append assistant message
    appendMessage(sessionPath, {
      role: 'assistant',
      content: 'Hi there!'
    });

    const session2 = parseSession(sessionPath);
    expect(session2.messages).toHaveLength(2);

    cleanupTestDirs();
  });

  test('getMessagesForAPI - converts to OpenAI format', () => {
    setupTestDirs();

    createAgentTemplate('test-api', {
      type: 'test',
      systemPrompt: 'You are helpful.'
    });

    const sessionPath = createSession('test-api', 'test-api-session');

    appendMessage(sessionPath, {
      role: 'user',
      content: 'What is 2+2?'
    });

    appendMessage(sessionPath, {
      role: 'assistant',
      content: '4'
    });

    const session = parseSession(sessionPath);
    const apiMessages = getMessagesForAPI(session);

    expect(apiMessages.length).toBeGreaterThan(0);
    expect(apiMessages[0].role).toBe('system');
    expect(apiMessages[0].content).toBe('You are helpful.');
    expect(apiMessages[1].role).toBe('user');
    expect(apiMessages[2].role).toBe('assistant');

    cleanupTestDirs();
  });

  test('isWaitingForResponse - detects user message', () => {
    setupTestDirs();

    createAgentTemplate('test-waiting', {
      type: 'test',
      systemPrompt: 'Test'
    });

    const sessionPath = createSession('test-waiting', 'test-waiting-session');

    // Initially no messages, not waiting
    expect(isWaitingForResponse(sessionPath)).toBe(false);

    // Add user message
    appendMessage(sessionPath, {
      role: 'user',
      content: 'Hello'
    });

    // Now waiting
    expect(isWaitingForResponse(sessionPath)).toBe(true);

    // Add assistant response
    appendMessage(sessionPath, {
      role: 'assistant',
      content: 'Hi'
    });

    // Not waiting anymore
    expect(isWaitingForResponse(sessionPath)).toBe(false);

    cleanupTestDirs();
  });

  test('updateSessionStatus - changes session status', () => {
    setupTestDirs();

    createAgentTemplate('test-status', {
      type: 'test',
      systemPrompt: 'Test'
    });

    const sessionPath = createSession('test-status', 'test-status-session');

    // Initial status
    let session = parseSession(sessionPath);
    expect(session.status).toBe('active');

    // Update to sleeping
    updateSessionStatus(sessionPath, 'sleeping');
    session = parseSession(sessionPath);
    expect(session.status).toBe('sleeping');

    // Update to completed
    updateSessionStatus(sessionPath, 'completed');
    session = parseSession(sessionPath);
    expect(session.status).toBe('completed');

    cleanupTestDirs();
  });

  test('getLastMessage - returns last message', () => {
    setupTestDirs();

    createAgentTemplate('test-last', {
      type: 'test',
      systemPrompt: 'Test'
    });

    const sessionPath = createSession('test-last', 'test-last-session');

    // No messages
    expect(getLastMessage(sessionPath)).toBeNull();

    // Add messages
    appendMessage(sessionPath, { role: 'user', content: 'First' });
    appendMessage(sessionPath, { role: 'assistant', content: 'Second' });
    appendMessage(sessionPath, { role: 'user', content: 'Third' });

    const last = getLastMessage(sessionPath);
    expect(last.content).toBe('Third');
    expect(last.role).toBe('user');

    cleanupTestDirs();
  });

  test('serializeSession - creates valid YAML', () => {
    const session = {
      sessionId: 'test',
      agentId: 'agent-1',
      agentType: 'test',
      model: 'gpt-4',
      systemPrompt: 'Test',
      created: new Date(),
      updated: new Date(),
      status: 'active',
      messages: [
        {
          timestamp: new Date(),
          role: 'user',
          content: 'Hello',
          toolCalls: null,
          toolCallId: null
        }
      ],
      metadata: {}
    };

    const yaml = serializeSession(session);
    expect(yaml).toContain('session_id: test');
    expect(yaml).toContain('agent_id: agent-1');
    expect(yaml).toContain('status: active');
    expect(yaml).toContain('role: user');
    expect(yaml).toContain('content: Hello');
  });

});

describe('YAML Agent Parser - Tool Calls', () => {

  test('handles tool calls in messages', () => {
    setupTestDirs();

    createAgentTemplate('test-tools', {
      type: 'test',
      systemPrompt: 'Test'
    });

    const sessionPath = createSession('test-tools', 'test-tools-session');

    // Add message with tool calls
    appendMessage(sessionPath, {
      role: 'assistant',
      content: '',
      toolCalls: [
        {
          id: 'call_123',
          type: 'function',
          function: {
            name: 'test_tool',
            arguments: '{"arg":"value"}'
          }
        }
      ]
    });

    // Add tool result
    appendMessage(sessionPath, {
      role: 'tool_result',
      content: '{"success": true}',
      toolCallId: 'call_123'
    });

    const session = parseSession(sessionPath);
    expect(session.messages).toHaveLength(2);
    expect(session.messages[0].toolCalls).toHaveLength(1);
    expect(session.messages[1].toolCallId).toBe('call_123');

    cleanupTestDirs();
  });

});
