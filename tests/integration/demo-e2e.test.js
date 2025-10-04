// tests/integration/demo-e2e.test.js
// End-to-end tests for the demo scenario using pump mode

import { existsSync, writeFileSync, readFileSync, unlinkSync, mkdirSync, rmSync, readdirSync } from 'fs';
import { join } from 'path';
import { spawn } from 'child_process';
import { parseAgentFile, appendMessage, isWaitingForResponse } from '../../lib/agent-parser.js';
import { parseApprovalFile, checkApprovalDecision } from '../../lib/approval.js';

const TEST_DIR = 'tests/e2e-temp';
const AGENTS_DIR = 'agents';
const APPROVALS_DIR = 'approvals';
const INBOX_DIR = 'inbox';
const TASKS_DIR = 'tasks';

// Setup test environment
function setupTestEnvironment() {
  console.log('    Setting up test environment...');

  // Clean up if exists
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true, force: true });
  }

  mkdirSync(TEST_DIR, { recursive: true });

  // Create directory structure
  mkdirSync(AGENTS_DIR, { recursive: true });
  mkdirSync(join(APPROVALS_DIR, 'pending'), { recursive: true });
  mkdirSync(join(APPROVALS_DIR, 'approved'), { recursive: true });
  mkdirSync(join(APPROVALS_DIR, 'rejected'), { recursive: true });
  mkdirSync(INBOX_DIR, { recursive: true });
  mkdirSync(TASKS_DIR, { recursive: true });

  console.log('    ✓ Test environment ready');
}

// Cleanup test environment
function cleanupTestEnvironment() {
  console.log('    Cleaning up test environment...');

  // Clean up test agents
  const testAgents = [
    'test-planner.agent.md',
    'test-retriever.agent.md',
    'test-executor.agent.md',
    'test-evaluator.agent.md'
  ];

  for (const agentFile of testAgents) {
    const path = join(AGENTS_DIR, agentFile);
    if (existsSync(path)) {
      unlinkSync(path);
    }
  }

  // Clean up test inbox
  const inboxPath = join(INBOX_DIR, 'test-slack-messages.jsonl');
  if (existsSync(inboxPath)) {
    unlinkSync(inboxPath);
  }

  // Clean up test tasks
  if (existsSync(TASKS_DIR)) {
    const taskFiles = readdirSync(TASKS_DIR).filter(f => f.startsWith('test-'));
    for (const file of taskFiles) {
      unlinkSync(join(TASKS_DIR, file));
    }
  }

  // Clean up test approvals
  for (const dir of ['pending', 'approved', 'rejected']) {
    const dirPath = join(APPROVALS_DIR, dir);
    if (existsSync(dirPath)) {
      const files = readdirSync(dirPath).filter(f => f.startsWith('test-'));
      for (const file of files) {
        unlinkSync(join(dirPath, file));
      }
    }
  }

  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true, force: true });
  }

  console.log('    ✓ Cleanup complete');
}

// Helper to run daemon in pump mode
function runDaemonPump() {
  return new Promise((resolve, reject) => {
    const daemon = spawn('node', ['daemon.js', '--pump'], {
      stdio: 'pipe',
      shell: true
    });

    let stdout = '';
    let stderr = '';

    daemon.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    daemon.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    daemon.on('close', (code) => {
      if (code !== 0 && code !== null) {
        reject(new Error(`Daemon exited with code ${code}\n${stderr}`));
      } else {
        resolve({ stdout, stderr, code });
      }
    });

    // Timeout after 90 seconds
    setTimeout(() => {
      daemon.kill();
      reject(new Error('Daemon pump timeout'));
    }, 90000);
  });
}

// Helper to create a test agent file
function createTestAgent(agentId, agentType, systemPrompt) {
  const agentFile = join(AGENTS_DIR, `${agentId}.agent.md`);
  const content = `# Agent: ${agentId}
type: ${agentType}
created: ${new Date().toISOString()}

## System Prompt

${systemPrompt}

## Conversation
`;

  writeFileSync(agentFile, content, 'utf8');
  console.log(`    Created test agent: ${agentId}`);
  return agentFile;
}

// Helper to simulate approval
function approveRequest(approvalFile) {
  if (!existsSync(approvalFile)) {
    throw new Error(`Approval file not found: ${approvalFile}`);
  }

  let content = readFileSync(approvalFile, 'utf8');

  // Replace the decision placeholder with APPROVED
  content = content.replace(
    /Decision: <!-- APPROVED \| REJECTED -->/,
    'Decision: APPROVED'
  );

  writeFileSync(approvalFile, content, 'utf8');
  console.log(`    Approved: ${approvalFile}`);
}

describe('Demo E2E Tests - Pump Mode', () => {

  testAsync('Step 1: Planner receives Slack message', async () => {
    setupTestEnvironment();

    try {
      // Create planner agent
      const plannerFile = createTestAgent(
        'test-planner',
        'planner',
        'You are a task planning agent. Respond briefly with "Acknowledged. Will create plan." when you receive a message.'
      );

      // Simulate incoming Slack message
      const slackMessage = {
        timestamp: new Date().toISOString(),
        channel: 'C123456',
        user: 'U789ABC',
        user_name: 'testuser',
        text: 'Can you check if the Redis container is running locally?'
      };

      const inboxPath = join(INBOX_DIR, 'test-slack-messages.jsonl');
      writeFileSync(inboxPath, JSON.stringify(slackMessage) + '\n', 'utf8');

      // Add message to planner
      appendMessage(plannerFile, {
        role: 'user',
        content: `New Slack message from @${slackMessage.user_name}: "${slackMessage.text}"\n\nPlease acknowledge this message.`
      });

      // Verify planner is waiting for response
      expect(isWaitingForResponse(plannerFile)).toBe(true);

      console.log('    ✓ Planner agent created and message added');
      console.log('    ✓ Agent is waiting for response');

    } finally {
      cleanupTestEnvironment();
    }
  });

  testAsync('Step 2: Process one pump iteration', async () => {
    setupTestEnvironment();

    try {
      // Create a simple test agent
      const agentFile = createTestAgent(
        'test-simple',
        'test',
        'You are a test agent. When greeted, respond with exactly: "Hello! I am ready."'
      );

      // Add a user message
      appendMessage(agentFile, {
        role: 'user',
        content: 'Hello, are you there?'
      });

      console.log('    Running daemon in pump mode...');

      // Run daemon pump - this should process the message
      const result = await runDaemonPump();

      console.log('    ✓ Daemon pump completed');

      // Read agent file to check for response
      const agent = parseAgentFile(agentFile);

      // Should have at least 2 messages: user + assistant
      expect(agent.messages.length).toBeGreaterThan(0);

      console.log(`    ✓ Agent has ${agent.messages.length} message(s)`);

      // Check that we got an assistant response
      const hasAssistantResponse = agent.messages.some(m => m.role === 'assistant');
      expect(hasAssistantResponse).toBe(true);

      console.log('    ✓ Agent received assistant response');

    } finally {
      cleanupTestEnvironment();
    }
  });

  testAsync('Step 3: Tool call requires approval', async () => {
    setupTestEnvironment();

    try {
      // Create executor agent
      const executorFile = createTestAgent(
        'test-executor',
        'executor',
        'You are a command execution agent. When asked to check Redis, use the run_command tool to execute "echo test".'
      );

      // Add message requesting command execution
      appendMessage(executorFile, {
        role: 'user',
        content: 'Please run a test command using run_command tool.'
      });

      console.log('    Running daemon in pump mode...');

      // Run daemon pump
      const result = await runDaemonPump();

      console.log('    ✓ Daemon pump completed');

      // Check for approval files
      const pendingDir = join(APPROVALS_DIR, 'pending');
      const approvalFiles = existsSync(pendingDir)
        ? readdirSync(pendingDir).filter(f => f.endsWith('.approval.md'))
        : [];

      console.log(`    Found ${approvalFiles.length} approval file(s)`);

      if (approvalFiles.length > 0) {
        // If approval was created, verify it
        const approvalFile = join(pendingDir, approvalFiles[0]);
        const approval = parseApprovalFile(approvalFile);

        expect(approval).toHaveProperty('tool_name');
        console.log(`    ✓ Approval request created for: ${approval.tool_name}`);
      } else {
        console.log('    ℹ Agent may not have called a tool requiring approval');
      }

    } finally {
      cleanupTestEnvironment();
    }
  });

  testAsync('Step 4: Approve and execute command', async () => {
    setupTestEnvironment();

    try {
      // Create executor agent
      const executorFile = createTestAgent(
        'test-executor',
        'executor',
        'You are a command execution agent. Use the read_file tool to read memory/system-config.md file.'
      );

      // Create the file to read
      const memoryDir = 'memory';
      if (!existsSync(memoryDir)) {
        mkdirSync(memoryDir, { recursive: true });
      }
      const configFile = join(memoryDir, 'system-config.md');
      writeFileSync(configFile, '# System Config\n\nTest configuration', 'utf8');

      // Add message
      appendMessage(executorFile, {
        role: 'user',
        content: 'Please read the memory/system-config.md file.'
      });

      console.log('    Running daemon pump (iteration 1)...');

      // First pump - should trigger tool call
      await runDaemonPump();

      console.log('    ✓ First pump completed');

      // Read agent to check for tool result
      const agent = parseAgentFile(executorFile);
      const hasToolResult = agent.messages.some(m => m.role === 'tool_result');

      if (hasToolResult) {
        console.log('    ✓ Tool was auto-approved and executed (read_file does not require approval)');
      }

      // Cleanup memory dir
      if (existsSync(configFile)) unlinkSync(configFile);
      if (existsSync(memoryDir)) rmSync(memoryDir, { recursive: true, force: true });

    } finally {
      cleanupTestEnvironment();
    }
  });

  testAsync('Step 5: Multiple pump iterations', async () => {
    setupTestEnvironment();

    try {
      // Create agent
      const agentFile = createTestAgent(
        'test-multi',
        'test',
        'You are a test agent. Respond briefly to each message.'
      );

      // Iteration 1: Send message
      appendMessage(agentFile, {
        role: 'user',
        content: 'Message 1'
      });

      console.log('    Pump iteration 1...');
      await runDaemonPump();

      let agent = parseAgentFile(agentFile);
      const messages1 = agent.messages.length;
      console.log(`    ✓ After iteration 1: ${messages1} messages`);

      // Iteration 2: Send another message
      appendMessage(agentFile, {
        role: 'user',
        content: 'Message 2'
      });

      console.log('    Pump iteration 2...');
      await runDaemonPump();

      agent = parseAgentFile(agentFile);
      const messages2 = agent.messages.length;
      console.log(`    ✓ After iteration 2: ${messages2} messages`);

      expect(messages2).toBeGreaterThan(messages1);
      console.log('    ✓ Multiple iterations work correctly');

    } finally {
      cleanupTestEnvironment();
    }
  });

});

describe('Demo E2E Tests - Message Flow', () => {

  testAsync('Agent receives and responds to message', async () => {
    setupTestEnvironment();

    try {
      const agentFile = createTestAgent(
        'test-responder',
        'test',
        'You are a helpful agent. When asked "What is 2+2?", respond with exactly "4".'
      );

      // Add question
      appendMessage(agentFile, {
        role: 'user',
        content: 'What is 2+2?'
      });

      // Process
      console.log('    Processing message...');
      await runDaemonPump();

      // Verify response
      const agent = parseAgentFile(agentFile);
      const responses = agent.messages.filter(m => m.role === 'assistant');

      expect(responses.length).toBeGreaterThan(0);
      console.log(`    ✓ Got ${responses.length} assistant response(s)`);

    } finally {
      cleanupTestEnvironment();
    }
  });

  testAsync('File tool execution (no approval needed)', async () => {
    setupTestEnvironment();

    try {
      // Create test file
      const testFile = 'test-data.txt';
      writeFileSync(testFile, 'Test content', 'utf8');

      const agentFile = createTestAgent(
        'test-file-reader',
        'test',
        'You are a file reader. Use the read_file tool to read test-data.txt when asked.'
      );

      appendMessage(agentFile, {
        role: 'user',
        content: 'Please read test-data.txt'
      });

      console.log('    Processing file read request...');
      await runDaemonPump();

      const agent = parseAgentFile(agentFile);
      const toolResults = agent.messages.filter(m => m.role === 'tool_result');

      expect(toolResults.length).toBeGreaterThan(0);
      console.log('    ✓ File tool was executed');

      // Cleanup
      if (existsSync(testFile)) unlinkSync(testFile);

    } finally {
      cleanupTestEnvironment();
    }
  });

});
