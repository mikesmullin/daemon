// tests/unit/tools.test.js
// Tests for tool execution system

import { existsSync, writeFileSync, unlinkSync, mkdirSync, readFileSync, rmSync } from 'fs';
import { join } from 'path';
import {
  tools,
  getToolDefinitions,
  executeTool,
  requiresApproval
} from '../../lib/tools.js';

const TEMP_DIR = 'tests/temp';

// Ensure temp directory exists
if (!existsSync(TEMP_DIR)) {
  mkdirSync(TEMP_DIR, { recursive: true });
}

describe('Tools System', () => {

  test('getToolDefinitions - returns all tool definitions', () => {
    const definitions = getToolDefinitions();

    expect(definitions.length).toBeGreaterThan(0);
    expect(definitions[0].type).toBe('function');
    expect(definitions[0].function).toHaveProperty('name');
    expect(definitions[0].function).toHaveProperty('description');
    expect(definitions[0].function).toHaveProperty('parameters');
  });

  test('tools registry - contains expected tools', () => {
    expect(tools).toHaveProperty('read_file');
    expect(tools).toHaveProperty('write_file');
    expect(tools).toHaveProperty('list_directory');
    expect(tools).toHaveProperty('create_directory');
    expect(tools).toHaveProperty('execute_command');
    expect(tools).toHaveProperty('query_tasks');
    expect(tools).toHaveProperty('create_task');
    expect(tools).toHaveProperty('update_task');
    expect(tools).toHaveProperty('send_message');
    expect(tools).toHaveProperty('slack_send');
    expect(tools).toHaveProperty('slack_read');
  });
});

describe('File Operations Tools', () => {

  testAsync('read_file - reads existing file', async () => {
    const testFile = join(TEMP_DIR, 'read-test.txt');
    writeFileSync(testFile, 'test content', 'utf8');

    const result = await executeTool('read_file', { path: testFile });

    expect(result.success).toBe(true);
    expect(result.content).toBe('test content');

    unlinkSync(testFile);
  });

  testAsync('read_file - fails on missing file', async () => {
    const result = await executeTool('read_file', { path: 'nonexistent.txt' });

    expect(result.success).toBe(false);
    expect(result.error).toContain('not found');
  });

  testAsync('write_file - creates new file', async () => {
    const testFile = join(TEMP_DIR, 'write-test.txt');

    if (existsSync(testFile)) {
      unlinkSync(testFile);
    }

    const result = await executeTool('write_file', {
      path: testFile,
      content: 'written content'
    });

    expect(result.success).toBe(true);
    expect(existsSync(testFile)).toBe(true);

    const content = readFileSync(testFile, 'utf8');
    expect(content).toBe('written content');

    unlinkSync(testFile);
  });

  testAsync('write_file - creates parent directories', async () => {
    const testFile = join(TEMP_DIR, 'nested', 'deep', 'write-test.txt');

    const result = await executeTool('write_file', {
      path: testFile,
      content: 'nested content'
    });

    expect(result.success).toBe(true);
    expect(existsSync(testFile)).toBe(true);

    // Clean up
    unlinkSync(testFile);
  });

  testAsync('list_directory - lists files', async () => {
    const result = await executeTool('list_directory', { path: TEMP_DIR });

    expect(result.success).toBe(true);
    expect(result.entries).toBeInstanceOf(Array);

    if (result.entries.length > 0) {
      expect(result.entries[0]).toHaveProperty('name');
      expect(result.entries[0]).toHaveProperty('type');
    }
  });

  testAsync('create_directory - creates directory', async () => {
    const testDir = join(TEMP_DIR, 'new-dir');

    if (existsSync(testDir)) {
      // Clean up first
      rmSync(testDir, { recursive: true, force: true });
    }

    const result = await executeTool('create_directory', { path: testDir });

    expect(result.success).toBe(true);
    expect(existsSync(testDir)).toBe(true);

    // Clean up
    rmSync(testDir, { recursive: true, force: true });
  });
});

describe('Task Management Tools', () => {

  testAsync('create_task - creates task in file', async () => {
    const taskFile = join(TEMP_DIR, 'test-tasks.task.md');

    if (existsSync(taskFile)) {
      unlinkSync(taskFile);
    }

    const result = await executeTool('create_task', {
      file: taskFile,
      content: '- [ ] Test task @test-agent #test'
    });

    expect(result.success).toBe(true);
    expect(existsSync(taskFile)).toBe(true);

    const content = readFileSync(taskFile, 'utf8');
    expect(content).toContain('## TODO');
    expect(content).toContain('Test task');

    unlinkSync(taskFile);
  });

  testAsync('create_task - appends to existing file', async () => {
    const taskFile = join(TEMP_DIR, 'append-tasks.task.md');

    writeFileSync(taskFile, '## TODO\n\n- [x] Existing task\n', 'utf8');

    const result = await executeTool('create_task', {
      file: taskFile,
      content: '- [ ] New task'
    });

    expect(result.success).toBe(true);

    const content = readFileSync(taskFile, 'utf8');
    expect(content).toContain('Existing task');
    expect(content).toContain('New task');

    unlinkSync(taskFile);
  });
});

describe('Agent Communication Tools', () => {

  testAsync('send_message - returns intent to append', async () => {
    // Create a target agent file first
    const agentDir = 'agents';
    if (!existsSync(agentDir)) {
      mkdirSync(agentDir, { recursive: true });
    }

    const agentFile = join(agentDir, 'target-agent.agent.md');
    writeFileSync(agentFile, '# Agent: target-agent\ntype: test\ncreated: 2025-10-04T10:00:00Z\n\n## System Prompt\nTest\n\n## Conversation\n', 'utf8');

    const result = await executeTool('send_message', {
      agent_id: 'target-agent',
      content: 'Test message to agent'
    });

    expect(result.success).toBe(true);
    expect(result.intent).toBe('append_message');
    expect(result.agent_id).toBe('target-agent');
    expect(result.content).toBe('Test message to agent');

    unlinkSync(agentFile);
  });
});

describe('Tool Approval Requirements', () => {

  test('requiresApproval - identifies approval-required tools', () => {
    expect(requiresApproval('write_file', {})).toBe(true);
    expect(requiresApproval('execute_command', {})).toBe(true);
    expect(requiresApproval('slack_send', {})).toBe(true);
  });

  test('requiresApproval - identifies auto-approved tools', () => {
    expect(requiresApproval('read_file', {})).toBe(false);
    expect(requiresApproval('list_directory', {})).toBe(false);
    expect(requiresApproval('create_directory', {})).toBe(false);
  });

  test('requiresApproval - handles unknown tools safely', () => {
    expect(requiresApproval('unknown_tool', {})).toBe(true);
  });
});

describe('Tool Definitions', () => {

  test('all tools have valid definitions', () => {
    const definitions = getToolDefinitions();

    definitions.forEach(def => {
      expect(def.type).toBe('function');
      expect(def.function).toHaveProperty('name');
      expect(def.function).toHaveProperty('description');
      expect(def.function.parameters).toHaveProperty('type');
      expect(def.function.parameters).toHaveProperty('properties');
    });
  });

  test('all tools have execute functions', () => {
    Object.entries(tools).forEach(([name, tool]) => {
      expect(tool).toHaveProperty('execute');
      expect(typeof tool.execute).toBe('function');
      expect(tool).toHaveProperty('definition');
      expect(tool).toHaveProperty('requiresApproval');
    });
  });
});

describe('External Integration Tools', () => {

  testAsync('slack_read - reads from inbox', async () => {
    const inboxFile = 'inbox/slack-messages.jsonl';

    // Create inbox if doesn't exist
    if (!existsSync('inbox')) {
      mkdirSync('inbox', { recursive: true });
    }

    // Create test inbox
    const testMessages = [
      JSON.stringify({ timestamp: '2025-10-04T10:00:00Z', text: 'Message 1' }),
      JSON.stringify({ timestamp: '2025-10-04T10:00:01Z', text: 'Message 2' })
    ].join('\n');

    writeFileSync(inboxFile, testMessages + '\n', 'utf8');

    const result = await executeTool('slack_read', { limit: 10 });

    expect(result.success).toBe(true);
    expect(result.messages).toBeInstanceOf(Array);
    expect(result.messages.length).toBeGreaterThan(0);

    // Clean up
    unlinkSync(inboxFile);
  });

  testAsync('slack_send - queues message for delivery', async () => {
    const outboxFile = 'inbox/slack-outbox.jsonl';

    if (existsSync(outboxFile)) {
      unlinkSync(outboxFile);
    }

    const result = await executeTool('slack_send', {
      channel: 'test-channel',
      message: 'Test message'
    });

    expect(result.success).toBe(true);
    expect(existsSync(outboxFile)).toBe(true);

    const content = readFileSync(outboxFile, 'utf8');
    expect(content).toContain('test-channel');
    expect(content).toContain('Test message');

    // Clean up
    unlinkSync(outboxFile);
  });
});
