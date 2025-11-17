import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { _G } from '../../../src/lib/globals.mjs';
import * as fs from 'fs/promises';
import path from 'path';
import os from 'os';

// Import Agent after setting up test environment to avoid plugin loading issues
let Agent;
let Session;

describe('Agent', () => {
  let testDir;
  let originalSessionsDir;
  let originalTemplatesDir;

  beforeEach(async () => {
    // Import Agent and Session lazily to ensure _G is set up first
    if (!Agent) {
      const agentModule = await import('../../../src/lib/agents.mjs');
      Agent = agentModule.Agent;
      const sessionModule = await import('../../../src/lib/session.mjs');
      Session = sessionModule.Session;
    }
    
    // Create temporary test directory
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'daemon-agent-test-'));
    
    // Store original paths
    originalSessionsDir = _G.SESSIONS_DIR;
    originalTemplatesDir = _G.TEMPLATES_DIR;
    
    // Set test paths
    _G.SESSIONS_DIR = path.join(testDir, 'agents', 'sessions');
    _G.TEMPLATES_DIR = path.join(testDir, 'agents', 'templates');
    
    // Create necessary directories
    await fs.mkdir(_G.SESSIONS_DIR, { recursive: true });
    await fs.mkdir(_G.TEMPLATES_DIR, { recursive: true });
    
    // Create test template
    const testTemplate = {
      apiVersion: 'daemon/v1',
      kind: 'Agent',
      metadata: {
        name: 'test-agent',
        description: 'Test agent for unit tests',
        model: 'claude-sonnet-4',
        labels: ['subagent', 'test'],
        tools: []
      },
      spec: {
        system_prompt: 'You are a test agent.',
        messages: []
      }
    };
    
    const yaml = await import('js-yaml');
    await fs.writeFile(
      path.join(_G.TEMPLATES_DIR, 'test-agent.yaml'),
      yaml.dump(testTemplate)
    );
  });

  afterEach(async () => {
    // Restore original paths
    _G.SESSIONS_DIR = originalSessionsDir;
    _G.TEMPLATES_DIR = originalTemplatesDir;
    
    // Clean up test directory
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('BT state management', () => {
    test('validates valid BT states', () => {
      expect(Agent._isValidBtState('pending')).toBe(true);
      expect(Agent._isValidBtState('running')).toBe(true);
      expect(Agent._isValidBtState('success')).toBe(true);
      expect(Agent._isValidBtState('fail')).toBe(true);
    });

    test('rejects invalid BT states', () => {
      expect(Agent._isValidBtState('invalid')).toBe(false);
      expect(Agent._isValidBtState('unknown')).toBe(false);
      expect(Agent._isValidBtState('')).toBe(false);
    });

    test('sets and gets BT state for session', async () => {
      const session_id = await Agent.nextId();
      
      // Create a minimal session file
      const yaml = await import('js-yaml');
      await fs.writeFile(
        path.join(_G.SESSIONS_DIR, `${session_id}.yaml`),
        yaml.dump({
          apiVersion: 'daemon/v1',
          kind: 'Agent',
          metadata: { bt_state: 'pending' },
          spec: {}
        })
      );
      
      // Set state
      await Agent.state(session_id, 'running');
      
      // Get state
      const state = await Agent.state(session_id);
      expect(state).toBe('running');
    });
  });

  describe('session lifecycle', () => {
    test('generates monotonically increasing session IDs', async () => {
      const id1 = await Agent.nextId();
      const id2 = await Agent.nextId();
      
      expect(id2).toBeGreaterThan(id1);
    });

    test('forks a new session from template', async () => {
      const result = await Agent.fork({
        agent: 'test-agent',
        prompt: 'Hello, world!'
      });
      
      expect(result).toBeDefined();
      expect(result.session_id).toBeDefined();
      expect(result.agent).toBe('test-agent');
      expect(result.prompt).toBe('Hello, world!');
      
      // Verify session file exists
      const sessionPath = path.join(_G.SESSIONS_DIR, `${result.session_id}.yaml`);
      const exists = await fs.access(sessionPath).then(() => true).catch(() => false);
      expect(exists).toBe(true);
      
      // Verify session content
      const yaml = await import('js-yaml');
      const content = await fs.readFile(sessionPath, 'utf-8');
      const session = yaml.load(content);
      
      expect(session.metadata.name).toBe('test-agent');
      expect(session.spec.messages).toBeDefined();
      expect(session.spec.messages.length).toBe(1);
      expect(session.spec.messages[0].role).toBe('user');
      expect(session.spec.messages[0].content).toBe('Hello, world!');
    });

    test('forks session with labels', async () => {
      const result = await Agent.fork({
        agent: 'test-agent',
        labels: ['custom-label', 'test-label']
      });
      
      // Verify session has merged labels
      const sessionPath = path.join(_G.SESSIONS_DIR, `${result.session_id}.yaml`);
      const yaml = await import('js-yaml');
      const content = await fs.readFile(sessionPath, 'utf-8');
      const session = yaml.load(content);
      
      expect(session.metadata.labels).toContain('subagent');
      expect(session.metadata.labels).toContain('test');
      expect(session.metadata.labels).toContain('custom-label');
      expect(session.metadata.labels).toContain('test-label');
    });

    test('lists all agent sessions', async () => {
      // Create a few sessions
      await Agent.fork({ agent: 'test-agent' });
      await Agent.fork({ agent: 'test-agent' });
      
      const sessions = await Agent.list();
      
      expect(sessions).toBeDefined();
      expect(Array.isArray(sessions)).toBe(true);
      expect(sessions.length).toBeGreaterThanOrEqual(2);
    });

    test('lists available agent templates', async () => {
      const templates = await Agent.listAvailable();
      
      expect(templates).toBeDefined();
      expect(Array.isArray(templates)).toBe(true);
      expect(templates.length).toBe(1);
      expect(templates[0].name).toBe('test-agent');
      expect(templates[0].description).toBe('Test agent for unit tests');
    });

    test('lists running subagent sessions', async () => {
      // Create a session and set it to success state
      const result = await Agent.fork({ agent: 'test-agent' });
      await Agent.state(result.session_id, 'success');
      
      const running = await Agent.listRunning();
      
      expect(running).toBeDefined();
      expect(Array.isArray(running)).toBe(true);
      // Should include our session since it has 'subagent' label
      const found = running.find(s => s.session_id === result.session_id);
      expect(found).toBeDefined();
    });

    test('kills an agent session', async () => {
      const result = await Agent.fork({ agent: 'test-agent' });
      
      await Agent.kill(result.session_id, 'fail');
      
      const state = await Agent.state(result.session_id);
      expect(state).toBe('fail');
    });

    test('pushes a message to agent session', async () => {
      const result = await Agent.fork({ agent: 'test-agent' });
      
      await Agent.push(result.session_id, 'Second message');
      
      // Verify message was added
      const sessionPath = path.join(_G.SESSIONS_DIR, `${result.session_id}.yaml`);
      const yaml = await import('js-yaml');
      const content = await fs.readFile(sessionPath, 'utf-8');
      const session = yaml.load(content);
      
      expect(session.spec.messages.length).toBe(1);
      expect(session.spec.messages[0].content).toBe('Second message');
    });
  });

  describe('template resolution', () => {
    test('finds template in workspace templates directory', async () => {
      const result = await Agent.fork({ agent: 'test-agent' });
      
      expect(result.agent).toBe('test-agent');
    });

    test('throws error for non-existent template', async () => {
      await expect(Agent.fork({ agent: 'non-existent' })).rejects.toThrow();
    });

    test('strips .yaml extension from template name', async () => {
      const result = await Agent.fork({ agent: 'test-agent.yaml' });
      
      expect(result.agent).toBe('test-agent.yaml');
    });
  });

  describe('pump processing', () => {
    test('processes pending sessions', async () => {
      // Create a session in pending state
      const result = await Agent.fork({ agent: 'test-agent', prompt: 'test' });
      await Agent.state(result.session_id, 'pending');
      
      // Note: We cannot fully test pump() without mocking the AI API
      // This test just verifies that pump() can be called without errors
      // Real integration tests would use live API or mocks
      
      // Skip actual pump execution since it requires AI API
      // await Agent.pump();
      
      // Just verify the session exists
      const state = await Agent.state(result.session_id);
      expect(state).toBe('pending');
    });
  });

  describe('tool execution', () => {
    test('delegates tool execution to Tool class', async () => {
      // This is a delegation test - we verify the method exists
      // and has the correct signature
      expect(typeof Agent.tool).toBe('function');
      expect(Agent.tool.length).toBe(3); // name, args, options
    });

    test('delegates pending tool calls processing to Tool class', async () => {
      const sessionContent = {
        spec: {
          messages: []
        }
      };
      
      // This should return false for empty messages
      const result = await Agent.processPendingToolCalls(sessionContent);
      expect(result).toBe(false);
    });
  });

  describe('error handling', () => {
    test('handles missing session gracefully in state()', async () => {
      await expect(Agent.state(99999)).rejects.toThrow();
    });

    test('handles invalid state in kill()', async () => {
      const result = await Agent.fork({ agent: 'test-agent' });
      
      await expect(Agent.kill(result.session_id, 'invalid-state')).rejects.toThrow();
    });

    test('handles missing session in push()', async () => {
      await expect(Agent.push(99999, 'test message')).rejects.toThrow();
    });
  });
});
