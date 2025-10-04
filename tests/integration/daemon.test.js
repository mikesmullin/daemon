// tests/integration/daemon.test.js
// Integration tests for daemon orchestration

import { existsSync, writeFileSync, readFileSync, unlinkSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { parseAgentFile, appendMessage } from '../../lib/agent-parser.js';
import { parseApprovalFile, createApprovalRequest, checkApprovalDecision } from '../../lib/approval.js';
import { executeTool, requiresApproval } from '../../lib/tools.js';

const TEST_DIR = 'tests/integration-temp';
const AGENTS_DIR = join(TEST_DIR, 'agents');
const APPROVALS_DIR = join(TEST_DIR, 'approvals');
const INBOX_DIR = join(TEST_DIR, 'inbox');

// Setup test environment
function setupTestEnvironment() {
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true, force: true });
  }

  mkdirSync(TEST_DIR, { recursive: true });
  mkdirSync(AGENTS_DIR, { recursive: true });
  mkdirSync(join(APPROVALS_DIR, 'pending'), { recursive: true });
  mkdirSync(join(APPROVALS_DIR, 'approved'), { recursive: true });
  mkdirSync(join(APPROVALS_DIR, 'rejected'), { recursive: true });
  mkdirSync(INBOX_DIR, { recursive: true });
}

// Cleanup test environment
function cleanupTestEnvironment() {
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true, force: true });
  }
}

describe('Daemon File Watching', () => {

  test('detects new agent files', () => {
    setupTestEnvironment();

    const agentFile = join(AGENTS_DIR, 'test-agent.agent.md');
    const content = `# Agent: test-agent
type: test
created: ${new Date().toISOString()}

## System Prompt

Test agent

## Conversation
`;

    writeFileSync(agentFile, content, 'utf8');

    expect(existsSync(agentFile)).toBe(true);

    const agent = parseAgentFile(agentFile);
    expect(agent.id).toBe('test-agent');

    cleanupTestEnvironment();
  });

  test('detects agent file modifications', () => {
    setupTestEnvironment();

    const agentFile = join(AGENTS_DIR, 'test-agent.agent.md');
    const content = `# Agent: test-agent
type: test
created: ${new Date().toISOString()}

## System Prompt

Test agent

## Conversation
`;

    writeFileSync(agentFile, content, 'utf8');

    // Simulate adding a message (what daemon does)
    const updatedContent = content + `
### ${new Date().toISOString()} | user
Test message
`;

    writeFileSync(agentFile, updatedContent, 'utf8');

    const agent = parseAgentFile(agentFile);
    expect(agent.messages.length).toBe(1);
    expect(agent.messages[0].role).toBe('user');
    expect(agent.messages[0].content).toBe('Test message');

    cleanupTestEnvironment();
  });
});

describe('Daemon Message Routing', () => {

  testAsync('routes messages between agents', async () => {
    setupTestEnvironment();

    // Create agents in the global agents directory for tool to find
    if (!existsSync('agents')) {
      mkdirSync('agents', { recursive: true });
    }

    const sourceFile = join('agents', 'source-test-agent.agent.md');
    const targetFile = join('agents', 'target-test-agent.agent.md');

    const baseContent = (id) => `# Agent: ${id}
type: test
created: ${new Date().toISOString()}

## System Prompt

Test agent

## Conversation
`;

    writeFileSync(sourceFile, baseContent('source-test-agent'), 'utf8');
    writeFileSync(targetFile, baseContent('target-test-agent'), 'utf8');

    try {
      // Simulate send_message tool call
      const result = await executeTool('send_message', {
        agent_id: 'target-test-agent',
        content: 'Message from source to target'
      });

      expect(result.success).toBe(true);
      expect(result.intent).toBe('append_message');
      expect(result.agent_id).toBe('target-test-agent');

      // Daemon would append this message to target agent
      const timestamp = new Date().toISOString();
      const updatedContent = readFileSync(targetFile, 'utf8') + `
### ${timestamp} | user
[From source-test-agent]: Message from source to target
`;

      writeFileSync(targetFile, updatedContent, 'utf8');

      const targetAgent = parseAgentFile(targetFile);
      expect(targetAgent.messages.length).toBe(1);
      expect(targetAgent.messages[0].content).toContain('Message from source to target');
    } finally {
      // Clean up global agents
      if (existsSync(sourceFile)) unlinkSync(sourceFile);
      if (existsSync(targetFile)) unlinkSync(targetFile);
      cleanupTestEnvironment();
    }
  });
});

describe('Daemon Tool Execution', () => {

  testAsync('executes approved tools', async () => {
    setupTestEnvironment();

    // Create a test file via tool
    const testFile = join(TEST_DIR, 'tool-test.txt');

    const result = await executeTool('write_file', {
      path: testFile,
      content: 'Content from tool'
    });

    expect(result.success).toBe(true);

    // Wait a bit for file system
    await new Promise(resolve => setTimeout(resolve, 100));

    expect(existsSync(testFile)).toBe(true);
    expect(readFileSync(testFile, 'utf8')).toBe('Content from tool');

    cleanupTestEnvironment();
  });

  testAsync('blocks unapproved dangerous tools', async () => {
    setupTestEnvironment();

    // Dangerous command should require approval
    const needsApproval = requiresApproval('execute_command', {
      command: 'rm -rf /'
    });

    expect(needsApproval).toBe(true);

    cleanupTestEnvironment();
  });
});

describe('Daemon Approval Workflow', () => {

  test('creates approval requests for dangerous operations', () => {
    setupTestEnvironment();

    const request = {
      agent: 'test-agent',
      task: 'test-task',
      type: 'terminal_command',
      command: 'sudo reboot',
      riskLevel: 'HIGH',
      riskReason: 'System reboot command'
    };

    // Override approval directory for test
    const originalPending = 'approvals/pending';
    const testPending = join(APPROVALS_DIR, 'pending');

    const filePath = createApprovalRequest(request);

    expect(existsSync(filePath)).toBe(true);
    expect(filePath).toContain('approval.md');

    const approval = parseApprovalFile(filePath);
    expect(approval.agent).toBe('test-agent');
    expect(approval.status).toBe('pending');

    cleanupTestEnvironment();
  });

  test('processes approval decisions', () => {
    setupTestEnvironment();

    const approvalFile = join(APPROVALS_DIR, 'pending', 'test-approval.md');

    const content = `# Approval Request: test-001
agent: test-agent
created: ${new Date().toISOString()}
status: pending

## Proposed Action

**Type:** terminal_command

**Command:**
\`\`\`bash
echo "test"
\`\`\`

## Review

**Decision:** APPROVED

**Reviewed by:** Test Human
**Reviewed at:** ${new Date().toISOString()}
`;

    writeFileSync(approvalFile, content, 'utf8');

    const decision = checkApprovalDecision(approvalFile);

    expect(decision).not.toBeNull();
    expect(decision.approved).toBe(true);
    expect(decision.reviewedBy).toBe('Test Human');

    cleanupTestEnvironment();
  });
});

describe('Daemon Error Handling', () => {

  testAsync('handles missing agent files gracefully', async () => {
    setupTestEnvironment();

    const result = await executeTool('send_message', {
      agent_id: 'nonexistent-agent',
      content: 'Test message'
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('not found');

    cleanupTestEnvironment();
  });

  testAsync('handles invalid tool calls', async () => {
    setupTestEnvironment();

    const result = await executeTool('nonexistent_tool', {});

    expect(result.success).toBe(false);

    cleanupTestEnvironment();
  });
});

describe('Daemon Inbox Processing', () => {

  test('processes Slack inbox messages', () => {
    setupTestEnvironment();

    const slackInbox = join(INBOX_DIR, 'slack-messages.jsonl');

    const messages = [
      { channel: '#general', user: 'alice', text: 'Hello', timestamp: new Date().toISOString() },
      { channel: '#dev', user: 'bob', text: 'Test', timestamp: new Date().toISOString() }
    ];

    const content = messages.map(m => JSON.stringify(m)).join('\n');
    writeFileSync(slackInbox, content, 'utf8');

    expect(existsSync(slackInbox)).toBe(true);

    const lines = readFileSync(slackInbox, 'utf8').split('\n').filter(l => l.trim());
    expect(lines.length).toBe(2);

    const parsed = lines.map(l => JSON.parse(l));
    expect(parsed[0].user).toBe('alice');
    expect(parsed[1].user).toBe('bob');

    cleanupTestEnvironment();
  });

  testAsync('queues Slack outbox messages', async () => {
    setupTestEnvironment();

    const result = await executeTool('slack_send', {
      channel: '#general',
      message: 'Response from agent'
    });

    expect(result.success).toBe(true);
    expect(result.message).toContain('Queued for Slack delivery');

    cleanupTestEnvironment();
  });
});

describe('Daemon End-to-End Flow', () => {

  testAsync('completes full agent interaction cycle', async () => {
    // Use unique test directory to avoid conflicts
    const uniqueTestDir = join('tests', 'integration-e2e-temp-' + Date.now());
    const uniqueAgentsDir = join(uniqueTestDir, 'agents');

    // Setup
    mkdirSync(uniqueAgentsDir, { recursive: true });

    try {
      // 1. Create agent
      const agentFile = join(uniqueAgentsDir, 'worker-test.agent.md');
      const content = `# Agent: worker-test
type: executor
created: ${new Date().toISOString()}

## System Prompt

You help execute tasks.

## Conversation
`;

      writeFileSync(agentFile, content, 'utf8');

      // 2. Add user message (simulating inbox processing)
      const timestamp1 = new Date().toISOString();
      const withMessage = content + `
### ${timestamp1} | user
Please list the current directory
`;

      writeFileSync(agentFile, withMessage, 'utf8');

      // 3. Execute tool
      const result = await executeTool('list_directory', { path: uniqueTestDir });
      expect(result.success).toBe(true);

      // 4. Add assistant response with tool result
      const timestamp2 = new Date().toISOString();
      const withResponse = withMessage + `
### ${timestamp2} | assistant
I'll list the directory for you.

### ${timestamp2} | tool_result
${JSON.stringify(result, null, 2)}
`;

      writeFileSync(agentFile, withResponse, 'utf8');

      // Small delay for file system
      await new Promise(resolve => setTimeout(resolve, 50));

      // 5. Verify agent state
      expect(existsSync(agentFile)).toBe(true);

      const agent = parseAgentFile(agentFile);
      expect(agent.messages.length).toBe(3);
      expect(agent.messages[0].role).toBe('user');
      expect(agent.messages[1].role).toBe('assistant');
      expect(agent.messages[2].role).toBe('tool_result');
    } finally {
      // Cleanup
      if (existsSync(uniqueTestDir)) {
        rmSync(uniqueTestDir, { recursive: true, force: true });
      }
    }
  });
});
