#!/usr/bin/env node
/**
 * demo-pump.js
 * 
 * Step-by-step demo using pump mode to demonstrate the multi-agent workflow
 * This is a simpler, more controllable version of the demo
 */

import { writeFileSync, unlinkSync, existsSync, mkdirSync, rmSync, readdirSync } from 'fs';
import { join } from 'path';
import { spawn } from 'child_process';
import { appendMessage } from './lib/agent-parser.js';

const AGENTS_DIR = 'agents';
const INBOX_DIR = 'inbox';
const APPROVALS_DIR = 'approvals';

// Colors for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  blue: '\x1b[34m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function section(title) {
  console.log();
  log('━'.repeat(60), 'cyan');
  log(`  ${title}`, 'bright');
  log('━'.repeat(60), 'cyan');
  console.log();
}

// Helper to run daemon in pump mode
function runDaemonPump() {
  return new Promise((resolve, reject) => {
    log('Running daemon pump...', 'yellow');

    const daemon = spawn('node', ['daemon.js', '--pump'], {
      stdio: 'inherit', // Show daemon output
      shell: true
    });

    daemon.on('close', (code) => {
      if (code !== 0 && code !== null) {
        reject(new Error(`Daemon exited with code ${code}`));
      } else {
        log('✓ Pump completed\n', 'green');
        resolve(code);
      }
    });

    // Timeout after 90 seconds
    setTimeout(() => {
      daemon.kill();
      reject(new Error('Daemon pump timeout'));
    }, 90000);
  });
}

// Helper to create agent file
function createDemoAgent(agentId, agentType, systemPrompt) {
  const agentFile = join(AGENTS_DIR, `${agentId}.agent.md`);
  const content = `# Agent: ${agentId}
type: ${agentType}
created: ${new Date().toISOString()}

## System Prompt

${systemPrompt}

## Conversation
`;

  writeFileSync(agentFile, content, 'utf8');
  log(`✓ Created agent: ${agentId}`, 'green');
  return agentFile;
}

// Cleanup demo files
function cleanup() {
  log('\nCleaning up demo files...', 'yellow');

  // Remove demo agents
  const demoAgents = ['demo-simple', 'demo-planner', 'demo-executor'];
  for (const agentId of demoAgents) {
    const file = join(AGENTS_DIR, `${agentId}.agent.md`);
    if (existsSync(file)) {
      unlinkSync(file);
      log(`  ✓ Removed ${file}`, 'green');
    }
  }

  // Remove demo inbox
  const inboxFile = join(INBOX_DIR, 'demo-messages.jsonl');
  if (existsSync(inboxFile)) {
    unlinkSync(inboxFile);
    log(`  ✓ Removed ${inboxFile}`, 'green');
  }

  log('✓ Cleanup complete\n', 'green');
}

// Main demo
async function runDemo() {
  section('Multi-Agent System Demo - Pump Mode');

  log('This demo uses pump mode to demonstrate the multi-agent workflow', 'blue');
  log('with manual control over each iteration.\n', 'blue');

  try {
    // Cleanup any previous demo files
    cleanup();

    // Demo 1: Simple Request/Response
    section('Demo 1: Simple Request/Response');

    log('Creating a simple demo agent...', 'blue');
    const simpleAgent = createDemoAgent(
      'demo-simple',
      'assistant',
      'You are a helpful assistant. When asked about the weather, respond with: "The weather is sunny today!"'
    );

    log('\nAdding a user message...', 'blue');
    appendMessage(simpleAgent, {
      role: 'user',
      content: 'What is the weather like?'
    });

    log('\nProcessing the message (Iteration 1)...', 'blue');
    await runDaemonPump();

    log('✓ Demo 1 Complete!', 'green');
    log('Check agents/demo-simple.agent.md to see the response\n', 'cyan');

    // Pause
    log('Press Enter to continue to Demo 2...', 'magenta');
    await waitForEnter();

    // Demo 2: Tool Usage (Auto-Approved)
    section('Demo 2: Tool Usage (Auto-Approved)');

    log('Creating an executor agent that will use tools...', 'blue');
    const executorAgent = createDemoAgent(
      'demo-executor',
      'executor',
      'You are a file reading agent. When asked to read a file, use the read_file tool.'
    );

    // Create a test file to read
    log('Creating a test file...', 'blue');
    const testFile = 'demo-test.txt';
    writeFileSync(testFile, 'This is a test file for the demo!', 'utf8');
    log(`✓ Created ${testFile}`, 'green');

    log('\nAsking agent to read the file...', 'blue');
    appendMessage(executorAgent, {
      role: 'user',
      content: `Please read the file: ${testFile}`
    });

    log('\nProcessing the request (Iteration 1)...', 'blue');
    await runDaemonPump();

    log('✓ Demo 2 Complete!', 'green');
    log('Check agents/demo-executor.agent.md to see the tool execution\n', 'cyan');

    // Cleanup test file
    if (existsSync(testFile)) {
      unlinkSync(testFile);
      log(`✓ Removed ${testFile}\n`, 'green');
    }

    // Pause
    log('Press Enter to continue to Demo 3...', 'magenta');
    await waitForEnter();

    // Demo 3: Multiple Iterations
    section('Demo 3: Multiple Iterations');

    log('Creating a conversational agent...', 'blue');
    const chatAgent = createDemoAgent(
      'demo-planner',
      'planner',
      'You are a task planner. Respond briefly and helpfully to each message.'
    );

    log('\nIteration 1: Initial greeting...', 'blue');
    appendMessage(chatAgent, {
      role: 'user',
      content: 'Hello! Can you help me plan a project?'
    });
    await runDaemonPump();

    log('Iteration 2: Follow-up question...', 'blue');
    appendMessage(chatAgent, {
      role: 'user',
      content: 'Great! What are the first steps?'
    });
    await runDaemonPump();

    log('✓ Demo 3 Complete!', 'green');
    log('Check agents/demo-planner.agent.md to see the conversation\n', 'cyan');

    // Final summary
    section('Demo Summary');
    log('✓ All demos completed successfully!\n', 'green');
    log('Key Concepts Demonstrated:', 'bright');
    log('  1. Simple request/response with AI agent', 'blue');
    log('  2. Tool execution (read_file - auto-approved)', 'blue');
    log('  3. Multi-turn conversations with state', 'blue');
    log('  4. Manual control via pump mode\n', 'blue');

    log('Next Steps:', 'bright');
    log('  • Inspect the agent files in agents/', 'cyan');
    log('  • Try modifying system prompts', 'cyan');
    log('  • Create your own agents', 'cyan');
    log('  • Run: node daemon.js (normal mode) for automatic processing\n', 'cyan');

    // Cleanup
    log('Clean up demo files? [Y/n] ', 'magenta');
    const shouldClean = await prompt();
    if (shouldClean.toLowerCase() !== 'n') {
      cleanup();
    } else {
      log('\nDemo files preserved for inspection.', 'yellow');
    }

  } catch (error) {
    log(`\n❌ Error: ${error.message}`, 'red');
    log('Cleaning up...', 'yellow');
    cleanup();
    process.exit(1);
  }
}

// Helper for user input
function waitForEnter() {
  return new Promise((resolve) => {
    process.stdin.once('data', () => {
      resolve();
    });
  });
}

function prompt() {
  return new Promise((resolve) => {
    process.stdin.once('data', (data) => {
      resolve(data.toString().trim());
    });
  });
}

// Run the demo
log('\n');
log('━'.repeat(60), 'bright');
log('  GitHub Copilot Multi-Agent System', 'bright');
log('  Interactive Demo with Pump Mode', 'bright');
log('━'.repeat(60), 'bright');
log('\n');

// Make stdin accept input
process.stdin.setRawMode(false);
process.stdin.resume();

runDemo().then(() => {
  process.exit(0);
}).catch(error => {
  log(`\n❌ Fatal error: ${error.message}`, 'red');
  process.exit(1);
});
