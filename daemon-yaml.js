/**
 * daemon-yaml.js
 * 
 * Multi-agent orchestrator daemon (YAML-based version)
 * Watches file system, routes messages, executes tools, manages approvals
 */

import chokidar from 'chokidar';
import OpenAI from 'openai';
import { getSession, getOpenAIConfig } from './lib/session.js';
import {
  parseSession,
  appendMessage,
  getMessagesForAPI,
  isWaitingForResponse,
  updateSessionStatus,
  saveSession,
  ensureAgentDirs
} from './lib/agent-parser-yaml.js';
import { getToolDefinitions, executeTool, requiresApproval } from './lib/tools.js';
import {
  checkApprovalDecision,
  archiveApproval,
  requestToolApproval,
  ensureApprovalDirs
} from './lib/approval-tasks.js';
import { existsSync, readdirSync } from 'fs';
import { join } from 'path';

// Configuration
const SESSIONS_DIR = 'sessions';
const TASKS_DIR = 'tasks';
const APPROVALS_TASK_FILE = join(TASKS_DIR, 'approvals.task.md');

// Parse command line arguments
const args = process.argv.slice(2);
const PUMP_MODE = args.includes('--pump');

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
  console.log('🚀 Multi-Agent Orchestrator Daemon Starting (YAML Mode)...\n');
  if (PUMP_MODE) {
    console.log('⚙️  PUMP MODE: Will run one iteration and exit\n');
  }
  console.log('━'.repeat(60));

  // Ensure directories exist
  ensureAgentDirs();
  ensureApprovalDirs();

  // Get authenticated session
  console.log('🔐 Authenticating with GitHub Copilot...');
  state.session = await getSession();
  const config = getOpenAIConfig(state.session);
  state.client = new OpenAI(config);
  console.log('✓ Authentication successful\n');

  if (PUMP_MODE) {
    // Pump mode: process once and exit
    console.log('🔍 Processing pending work (pump mode)...');
    await scanSessions();
    await scanApprovals();
    console.log('✓ Pump iteration complete\n');
    console.log('━'.repeat(60));
    console.log('✅ Pump mode finished. Exiting.\n');
    return;
  }

  // Normal daemon mode: continuous watching
  console.log('👀 Starting file watchers...');
  startSessionWatcher();
  startApprovalWatcher();
  console.log('✓ File watchers active\n');

  // Initial scan
  console.log('🔍 Scanning for pending work...');
  await scanSessions();
  console.log('✓ Initial scan complete\n');

  console.log('━'.repeat(60));
  console.log('✅ Daemon is running. Press Ctrl+C to stop.\n');

  // Keep process alive
  setInterval(() => {
    // Periodic health check
  }, 60000);
}

/**
 * Watch session files for changes
 */
function startSessionWatcher() {
  const watcher = chokidar.watch(`${SESSIONS_DIR}/*.session.yaml`, {
    persistent: true,
    ignoreInitial: false,
    awaitWriteFinish: {
      stabilityThreshold: 500,
      pollInterval: 100
    }
  });

  watcher.on('change', async (filePath) => {
    await handleSessionFileChange(filePath);
  });

  watcher.on('add', async (filePath) => {
    console.log(`📝 New session detected: ${filePath}`);
    await handleSessionFileChange(filePath);
  });

  state.watchers.push(watcher);
}

/**
 * Watch approval task file for human decisions
 */
function startApprovalWatcher() {
  const watcher = chokidar.watch(APPROVALS_TASK_FILE, {
    persistent: true,
    ignoreInitial: false,
    awaitWriteFinish: {
      stabilityThreshold: 500,
      pollInterval: 100
    }
  });

  watcher.on('change', async (filePath) => {
    await handleApprovalFileChange(filePath);
  });

  state.watchers.push(watcher);
}

/**
 * Handle session file modification
 */
async function handleSessionFileChange(filePath) {
  // Prevent concurrent processing of same file
  if (state.processing.has(filePath)) {
    return;
  }

  try {
    state.processing.add(filePath);

    // Check if session is waiting for a response
    if (!isWaitingForResponse(filePath)) {
      return;
    }

    const session = parseSession(filePath);
    console.log(`\n💬 Session ${session.sessionId} (${session.agentType}) has new message, processing...`);

    // Get messages in API format
    const messages = getMessagesForAPI(session);

    // Get tool definitions
    const tools = getToolDefinitions();

    // Call Copilot API
    console.log(`🤖 Calling Copilot API (model: ${session.model})...`);
    const response = await state.client.chat.completions.create({
      model: session.model,
      messages: messages,
      tools: tools,
      tool_choice: 'required'  // Force the model to use a tool
    });

    const assistantMessage = response.choices[0].message;

    // Handle tool calls
    if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
      console.log(`🔧 Agent requested ${assistantMessage.tool_calls.length} tool call(s)`);

      // First, add the assistant message with tool calls
      appendMessage(filePath, {
        role: 'assistant',
        content: assistantMessage.content || '',
        toolCalls: assistantMessage.tool_calls
      });

      // Then process each tool call
      for (const toolCall of assistantMessage.tool_calls) {
        await handleToolCall(session.sessionId, filePath, toolCall);
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
    console.error(`❌ Error processing session ${filePath}:`, error.message);
  } finally {
    state.processing.delete(filePath);
  }
}

/**
 * Handle tool call from agent
 */
async function handleToolCall(sessionId, sessionFile, toolCall) {
  const toolName = toolCall.function.name;
  const toolArgs = JSON.parse(toolCall.function.arguments);

  console.log(`  📌 Tool: ${toolName}`);
  console.log(`  📋 Args:`, JSON.stringify(toolArgs, null, 2));

  // Check if approval required
  if (requiresApproval(toolName, toolArgs)) {
    console.log(`  ⚠️  Requires approval - creating request...`);

    const taskId = requestToolApproval(sessionId, toolName, toolArgs, {
      description: `Session ${sessionId} wants to execute ${toolName}`
    });

    console.log(`  📝 Approval request created as task: ${taskId}`);
    console.log(`     Check: ${APPROVALS_TASK_FILE}`);

    // Store pending action with task ID as key
    state.approvalQueue.set(taskId, {
      sessionId,
      sessionFile,
      toolCall
    });

    // Append pending status
    appendMessage(sessionFile, {
      role: 'tool_result',
      content: JSON.stringify({
        status: 'PENDING_APPROVAL',
        task_id: taskId,
        task_file: APPROVALS_TASK_FILE,
        message: 'Waiting for human approval. Check tasks/approvals.task.md and mark task as [x] to approve or [-] to reject.'
      }),
      toolCallId: toolCall.id
    });

  } else {
    // Execute immediately
    console.log(`  ✅ Auto-approved - executing...`);
    await executeAndLog(sessionFile, toolCall);
  }
}

/**
 * Execute tool and log result
 */
async function executeAndLog(sessionFile, toolCall) {
  const toolName = toolCall.function.name;
  const toolArgs = JSON.parse(toolCall.function.arguments);

  try {
    const result = await executeTool(toolName, toolArgs);

    console.log(`  ✓ Tool executed:`, result.success ? 'SUCCESS' : 'FAILED');

    // Special handling for send_message
    if (toolName === 'send_message' && result.intent === 'append_message') {
      const targetFile = join(SESSIONS_DIR, `${result.agent_id}.session.yaml`);
      if (existsSync(targetFile)) {
        appendMessage(targetFile, {
          role: 'user',
          content: result.content
        });
        console.log(`  📨 Message sent to ${result.agent_id}`);
      } else {
        console.log(`  ⚠️  Target session ${result.agent_id} not found`);
      }
    }

    // Log tool result
    appendMessage(sessionFile, {
      role: 'tool_result',
      content: JSON.stringify(result, null, 2),
      toolCallId: toolCall.id
    });

  } catch (error) {
    console.error(`  ❌ Tool execution failed:`, error.message);

    appendMessage(sessionFile, {
      role: 'tool_result',
      content: JSON.stringify({
        success: false,
        error: error.message
      }),
      toolCallId: toolCall.id
    });
  }
}

/**
 * Handle approval file changes (task file modified)
 */
async function handleApprovalFileChange(filePath) {
  // Check all pending approvals in the queue
  for (const [taskId, pendingAction] of state.approvalQueue.entries()) {
    const decision = checkApprovalDecision(taskId);

    if (!decision) {
      continue; // Still pending
    }

    console.log(`\n📋 Approval decision received: ${decision.approved ? 'APPROVED' : 'REJECTED'}`);
    console.log(`   Task ID: ${taskId}`);

    if (decision.approved) {
      console.log(`   ✅ Executing approved action...`);
      await executeAndLog(pendingAction.sessionFile, pendingAction.toolCall);
    } else {
      console.log(`   ❌ Action rejected by human`);

      // Log rejection
      appendMessage(pendingAction.sessionFile, {
        role: 'tool_result',
        content: JSON.stringify({
          success: false,
          error: 'Action rejected by human operator',
          notes: decision.notes
        }),
        toolCallId: pendingAction.toolCall.id
      });
    }

    // Archive approval and remove from queue
    archiveApproval(taskId, decision.approved);
    state.approvalQueue.delete(taskId);
  }
}

/**
 * Scan all sessions for pending work
 */
async function scanSessions() {
  if (!existsSync(SESSIONS_DIR)) return;

  const files = readdirSync(SESSIONS_DIR).filter(f => f.endsWith('.session.yaml'));

  console.log(`   Found ${files.length} session(s)`);

  for (const file of files) {
    const filePath = join(SESSIONS_DIR, file);

    if (isWaitingForResponse(filePath)) {
      console.log(`   ⏳ ${file} is waiting for response`);
      await handleSessionFileChange(filePath);
    }
  }
}

/**
 * Scan all approvals for pending decisions (pump mode)
 */
async function scanApprovals() {
  if (!existsSync(APPROVALS_TASK_FILE)) return;

  console.log(`   Checking approval task file for decisions...`);

  // Check all pending approvals in the queue
  await handleApprovalFileChange(APPROVALS_TASK_FILE);
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
