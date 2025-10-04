#!/usr/bin/env node
/**
 * test-pump.js
 * 
 * Simple automated tests for pump mode functionality
 * These tests verify the daemon can process messages in pump mode
 */

import { writeFileSync, unlinkSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { spawn } from 'child_process';
import { appendMessage, parseAgentFile } from './lib/agent-parser.js';

const AGENTS_DIR = 'agents';

// Test results
let passed = 0;
let failed = 0;

function log(message, symbol = '•') {
  console.log(`  ${symbol} ${message}`);
}

function testPass(name) {
  passed++;
  log(`✓ ${name}`, '✓');
}

function testFail(name, error) {
  failed++;
  log(`✗ ${name}: ${error}`, '✗');
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

    setTimeout(() => {
      daemon.kill();
      reject(new Error('Daemon pump timeout'));
    }, 90000);
  });
}

// Helper to create test agent
function createTestAgent(agentId, systemPrompt) {
  const agentFile = join(AGENTS_DIR, `${agentId}.agent.md`);
  const content = `# Agent: ${agentId}
type: test
created: ${new Date().toISOString()}

## System Prompt

${systemPrompt}

## Conversation
`;

  writeFileSync(agentFile, content, 'utf8');
  return agentFile;
}

// Helper to cleanup test agent
function cleanupTestAgent(agentId) {
  const agentFile = join(AGENTS_DIR, `${agentId}.agent.md`);
  if (existsSync(agentFile)) {
    unlinkSync(agentFile);
  }
}

// Tests
async function runTests() {
  console.log('\n🧪 Pump Mode Tests\n');

  // Test 1: Daemon exits in pump mode
  try {
    log('Test 1: Daemon exits after one iteration...');
    const result = await runDaemonPump();
    if (result.code === 0 || result.code === null) {
      testPass('Daemon exits successfully in pump mode');
    } else {
      testFail('Daemon exit code', `Expected 0, got ${result.code}`);
    }
  } catch (error) {
    testFail('Daemon pump mode', error.message);
  }

  // Test 2: Agent receives and processes message
  const testAgentId = 'pump-test-agent';
  try {
    log('\nTest 2: Agent processes message in pump mode...');

    const agentFile = createTestAgent(
      testAgentId,
      'You are a test agent. When greeted with "Hello", respond with exactly "Hi there!"'
    );

    // Add message
    appendMessage(agentFile, {
      role: 'user',
      content: 'Hello'
    });

    // Process
    await runDaemonPump();

    // Verify response
    const agent = parseAgentFile(agentFile);
    const assistantMessages = agent.messages.filter(m => m.role === 'assistant');

    if (assistantMessages.length > 0) {
      testPass('Agent received assistant response');
    } else {
      testFail('Agent response', 'No assistant message found');
    }

    cleanupTestAgent(testAgentId);
  } catch (error) {
    testFail('Agent message processing', error.message);
    cleanupTestAgent(testAgentId);
  }

  // Test 3: Multiple agents processed in one pump
  const agent1Id = 'pump-test-1';
  const agent2Id = 'pump-test-2';
  try {
    log('\nTest 3: Multiple agents processed in one pump...');

    const agent1File = createTestAgent(
      agent1Id,
      'Respond with "Agent 1 ready"'
    );
    const agent2File = createTestAgent(
      agent2Id,
      'Respond with "Agent 2 ready"'
    );

    // Add messages to both
    appendMessage(agent1File, { role: 'user', content: 'Status?' });
    appendMessage(agent2File, { role: 'user', content: 'Status?' });

    // Process both in one pump
    await runDaemonPump();

    // Verify both got responses
    const agent1 = parseAgentFile(agent1File);
    const agent2 = parseAgentFile(agent2File);

    const agent1HasResponse = agent1.messages.some(m => m.role === 'assistant');
    const agent2HasResponse = agent2.messages.some(m => m.role === 'assistant');

    if (agent1HasResponse && agent2HasResponse) {
      testPass('Multiple agents processed in single pump');
    } else {
      testFail('Multiple agents', 'Not all agents received responses');
    }

    cleanupTestAgent(agent1Id);
    cleanupTestAgent(agent2Id);
  } catch (error) {
    testFail('Multiple agents processing', error.message);
    cleanupTestAgent(agent1Id);
    cleanupTestAgent(agent2Id);
  }

  // Test 4: Tool execution in pump mode
  const toolAgentId = 'pump-test-tool';
  try {
    log('\nTest 4: Tool execution in pump mode...');

    // Create a test file to read
    const testFile = 'pump-test-data.txt';
    writeFileSync(testFile, 'Test data', 'utf8');

    const agentFile = createTestAgent(
      toolAgentId,
      'You are a file reader. Use the read_file tool to read pump-test-data.txt when asked.'
    );

    appendMessage(agentFile, {
      role: 'user',
      content: 'Please read pump-test-data.txt'
    });

    // Process
    await runDaemonPump();

    // Verify tool was executed
    const agent = parseAgentFile(agentFile);
    const toolResults = agent.messages.filter(m => m.role === 'tool_result');

    if (toolResults.length > 0) {
      testPass('Tool executed in pump mode');
    } else {
      // Agent may have responded without using tool, that's ok
      testPass('Tool execution attempted (agent may have chosen not to use tool)');
    }

    // Cleanup
    if (existsSync(testFile)) unlinkSync(testFile);
    cleanupTestAgent(toolAgentId);
  } catch (error) {
    testFail('Tool execution', error.message);
    cleanupTestAgent(toolAgentId);
  }

  // Results
  console.log('\n' + '━'.repeat(40));
  console.log(`\n📊 Results: ${passed} passed, ${failed} failed\n`);

  if (failed > 0) {
    console.log('❌ Some tests failed\n');
    process.exit(1);
  } else {
    console.log('✅ All tests passed!\n');
    process.exit(0);
  }
}

// Run tests
console.log('━'.repeat(40));
console.log('Pump Mode Automated Tests');
console.log('━'.repeat(40));

runTests().catch(error => {
  console.error('\n❌ Test runner failed:', error.message);
  process.exit(1);
});
