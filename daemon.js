/**
 * daemon.js
 * 
 * Multi-agent orchestrator daemon
 * Watches file system, routes messages, executes tools, manages approvals
 */

import chokidar from 'chokidar';
import OpenAI from 'openai';
import { getSession, getOpenAIConfig } from './lib/session.js';
import { parseAgentFile, appendMessage, getMessagesForAPI, isWaitingForResponse } from './lib/agent-parser.js';
import { getToolDefinitions, executeTool, requiresApproval } from './lib/tools.js';
import {
  createApprovalRequest,
  checkApprovalDecision,
  archiveApproval,
  requestToolApproval,
  ensureApprovalDirs
} from './lib/approval.js';
import { existsSync, readdirSync, readFileSync } from 'fs';
import { join } from 'path';

// Configuration
const AGENTS_DIR = 'agents';
const APPROVALS_DIR = 'approvals/pending';
const POLL_INTERVAL = 2000; // 2 seconds

/**
 * Daemon state
 */
const state = {
  client: null,
  session: null,
  watchers: [],
  processing: new Set(), // Track files currently being processed
  approvalQueue: new Map() // Map approval file to pending action
};

/**
 * Initialize the daemon
 */
export async function initDaemon() {
  console.log('🚀 Multi-Agent Orchestrator Daemon Starting...\n');
  console.log('━'.repeat(60));

  // Ensure directories exist
  ensureApprovalDirs();
  if (!existsSync(AGENTS_DIR)) {
    console.error(`❌ Error: ${AGENTS_DIR}/ directory not found`);
    console.log('Please create agent files in the agents/ directory');
    process.exit(1);
  }

  // Get authenticated session
  console.log('🔐 Authenticating with GitHub Copilot...');
  state.session = await getSession();
  const config = getOpenAIConfig(state.session);
  state.client = new OpenAI(config);
  console.log('✓ Authentication successful\n');

  // Start file watchers
  console.log('👀 Starting file watchers...');
  startAgentWatcher();
  startApprovalWatcher();
  console.log('✓ File watchers active\n');

  // Initial scan
  console.log('🔍 Scanning for pending work...');
  await scanAgents();
  console.log('✓ Initial scan complete\n');

  console.log('━'.repeat(60));
  console.log('✅ Daemon is running. Press Ctrl+C to stop.\n');

  // Keep process alive
  setInterval(() => {
    // Periodic health check
  }, 60000);
}

/**
 * Watch agent files for changes
 */
function startAgentWatcher() {
  const watcher = chokidar.watch(`${AGENTS_DIR}/*.agent.md`, {
    persistent: true,
    ignoreInitial: false,
    awaitWriteFinish: {
      stabilityThreshold: 500,
      pollInterval: 100
    }
  });

  watcher.on('change', async (filePath) => {
    await handleAgentFileChange(filePath);
  });

  watcher.on('add', async (filePath) => {
    console.log(`📝 New agent detected: ${filePath}`);
    await handleAgentFileChange(filePath);
  });

  state.watchers.push(watcher);
}

/**
 * Watch approval files for human decisions
 */
function startApprovalWatcher() {
  const watcher = chokidar.watch(`${APPROVALS_DIR}/*.approval.md`, {
    persistent: true,
    ignoreInitial: false,
    awaitWriteFinish: {
      stabilityThreshold: 500,
      pollInterval: 100
    }
  });

  watcher.on('change', async (filePath) => {
    await handleApprovalChange(filePath);
  });

  state.watchers.push(watcher);
}

/**
 * Handle agent file modification
 */
async function handleAgentFileChange(filePath) {
  // Prevent concurrent processing of same file
  if (state.processing.has(filePath)) {
    return;
  }

  try {
    state.processing.add(filePath);

    // Check if agent is waiting for a response
    if (!isWaitingForResponse(filePath)) {
      return;
    }

    const agent = parseAgentFile(filePath);
    console.log(`\n💬 Agent ${agent.id} has new message, processing...`);

    // Get messages in API format
    const messages = getMessagesForAPI(agent);

    // Get tool definitions
    const tools = getToolDefinitions();

    // Call Copilot API
    console.log(`🤖 Calling Copilot API (model: claude-sonnet-4.5)...`);
    const response = await state.client.chat.completions.create({
      model: 'claude-sonnet-4.5',
      messages: messages,
      tools: tools,
      tool_choice: 'auto'
    });

    const assistantMessage = response.choices[0].message;

    // Handle tool calls
    if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
      console.log(`🔧 Agent requested ${assistantMessage.tool_calls.length} tool call(s)`);

      for (const toolCall of assistantMessage.tool_calls) {
        await handleToolCall(agent.id, filePath, toolCall);
      }
    } else if (assistantMessage.content) {
      // Regular assistant response
      console.log(`💭 Agent response: ${assistantMessage.content.substring(0, 100)}...`);

      appendMessage(filePath, {
        role: 'assistant',
        content: assistantMessage.content
      });
    }

  } catch (error) {
    console.error(`❌ Error processing agent ${filePath}:`, error.message);
  } finally {
    state.processing.delete(filePath);
  }
}

/**
 * Handle tool call from agent
 */
async function handleToolCall(agentId, agentFile, toolCall) {
  const toolName = toolCall.function.name;
  const toolArgs = JSON.parse(toolCall.function.arguments);

  console.log(`  📌 Tool: ${toolName}`);
  console.log(`  📋 Args:`, JSON.stringify(toolArgs, null, 2));

  // Check if approval required
  if (requiresApproval(toolName, toolArgs)) {
    console.log(`  ⚠️  Requires approval - creating request...`);

    const approvalFile = requestToolApproval(agentId, toolName, toolArgs, {
      description: `Agent ${agentId} wants to execute ${toolName}`
    });

    console.log(`  📝 Approval request created: ${approvalFile}`);

    // Store pending action
    state.approvalQueue.set(approvalFile, {
      agentId,
      agentFile,
      toolCall
    });

    // Append tool_call message to agent
    appendMessage(agentFile, {
      role: 'tool_call',
      content: formatToolCall(toolName, toolArgs, 'PENDING_APPROVAL', approvalFile)
    });

  } else {
    // Execute immediately
    console.log(`  ✅ Auto-approved - executing...`);
    await executeAndLog(agentFile, toolCall);
  }
}

/**
 * Execute tool and log result
 */
async function executeAndLog(agentFile, toolCall) {
  const toolName = toolCall.function.name;
  const toolArgs = JSON.parse(toolCall.function.arguments);

  try {
    const result = await executeTool(toolName, toolArgs);

    console.log(`  ✓ Tool executed:`, result.success ? 'SUCCESS' : 'FAILED');

    // Special handling for send_message
    if (toolName === 'send_message' && result.intent === 'append_message') {
      const targetFile = join(AGENTS_DIR, `${result.agent_id}.agent.md`);
      appendMessage(targetFile, {
        role: 'user',
        content: result.content
      });
      console.log(`  📨 Message sent to ${result.agent_id}`);
    }

    // Log tool result
    appendMessage(agentFile, {
      role: 'tool_result',
      content: formatToolResult(toolCall.id, result)
    });

  } catch (error) {
    console.error(`  ❌ Tool execution failed:`, error.message);

    appendMessage(agentFile, {
      role: 'tool_result',
      content: formatToolResult(toolCall.id, {
        success: false,
        error: error.message
      })
    });
  }
}

/**
 * Handle approval file changes (human decision)
 */
async function handleApprovalChange(filePath) {
  const decision = checkApprovalDecision(filePath);

  if (!decision) {
    return; // Not yet reviewed
  }

  console.log(`\n📋 Approval decision received: ${decision.approved ? 'APPROVED' : 'REJECTED'}`);
  console.log(`   File: ${filePath}`);

  const pendingAction = state.approvalQueue.get(filePath);

  if (!pendingAction) {
    console.log(`   ⚠️  No pending action found for this approval`);
    archiveApproval(filePath, decision.approved);
    return;
  }

  if (decision.approved) {
    console.log(`   ✅ Executing approved action...`);
    await executeAndLog(pendingAction.agentFile, pendingAction.toolCall);
  } else {
    console.log(`   ❌ Action rejected by human`);

    // Log rejection to agent
    appendMessage(pendingAction.agentFile, {
      role: 'tool_result',
      content: formatToolResult(pendingAction.toolCall.id, {
        success: false,
        error: 'Action rejected by human operator',
        notes: decision.notes
      })
    });
  }

  // Archive approval and remove from queue
  archiveApproval(filePath, decision.approved);
  state.approvalQueue.delete(filePath);
}

/**
 * Scan all agents for pending work
 */
async function scanAgents() {
  if (!existsSync(AGENTS_DIR)) return;

  const files = readdirSync(AGENTS_DIR).filter(f => f.endsWith('.agent.md'));

  console.log(`   Found ${files.length} agent(s)`);

  for (const file of files) {
    const filePath = join(AGENTS_DIR, file);

    if (isWaitingForResponse(filePath)) {
      console.log(`   ⏳ ${file} is waiting for response`);
      await handleAgentFileChange(filePath);
    }
  }
}

/**
 * Format tool call for agent log
 */
function formatToolCall(toolName, args, status, approvalFile = null) {
  const lines = [
    `name: ${toolName}`,
    'arguments:'
  ];

  for (const [key, value] of Object.entries(args)) {
    if (typeof value === 'string') {
      lines.push(`  ${key}: "${value}"`);
    } else {
      lines.push(`  ${key}: ${JSON.stringify(value)}`);
    }
  }

  lines.push('');
  lines.push(`status: ${status}`);

  if (approvalFile) {
    lines.push(`approval_file: ${approvalFile}`);
  }

  return lines.join('\n');
}

/**
 * Format tool result for agent log
 */
function formatToolResult(toolCallId, result) {
  const lines = [
    `tool_call_id: ${toolCallId}`,
    `success: ${result.success}`,
    ''
  ];

  if (result.success) {
    lines.push('result:');
    lines.push('```json');
    lines.push(JSON.stringify(result, null, 2));
    lines.push('```');
  } else {
    lines.push(`error: ${result.error}`);
    if (result.notes) {
      lines.push('');
      lines.push('notes:');
      lines.push(result.notes);
    }
  }

  return lines.join('\n');
}

/**
 * Graceful shutdown
 */
process.on('SIGINT', () => {
  console.log('\n\n🛑 Shutting down daemon...');

  for (const watcher of state.watchers) {
    watcher.close();
  }

  console.log('✓ Daemon stopped\n');
  process.exit(0);
});

// Start daemon if run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  initDaemon().catch(error => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  });
}
