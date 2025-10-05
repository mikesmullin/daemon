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
  ensureAgentDirs,
  createSession
} from './lib/agent-parser-yaml.js';
import { getToolDefinitions, executeTool, requiresApproval } from './lib/tools.js';
import {
  checkApprovalDecision,
  archiveApproval,
  requestToolApproval,
  ensureApprovalDirs
} from './lib/approval-tasks.js';
import { existsSync, readdirSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import yaml from 'js-yaml';

// Configuration
const SESSIONS_DIR = 'sessions';
const TASKS_DIR = 'tasks';
const STORAGE_DIR = 'storage';
const APPROVALS_TASK_FILE = join(TASKS_DIR, 'approvals.task.md');
const PLANNER_CHECKIN_FILE = join(STORAGE_DIR, 'planner-checkin.yaml');

// Default check-in interval (60 seconds, configurable)
const DEFAULT_CHECKIN_INTERVAL = 60;

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
 * Check if planner needs a check-in and trigger it if necessary
 */
async function checkPlannerCheckin() {
  try {
    // Load check-in configuration
    let checkinConfig = {
      last_checkin: null,
      interval_seconds: DEFAULT_CHECKIN_INTERVAL,
      planner_session: null,
      checkin_count: 0
    };

    if (existsSync(PLANNER_CHECKIN_FILE)) {
      const content = readFileSync(PLANNER_CHECKIN_FILE, 'utf8');
      const loadedConfig = yaml.load(content);
      // Only update interval_seconds if it wasn't set in the file, preserve existing value if present
      checkinConfig = {
        ...checkinConfig,
        ...loadedConfig,
        interval_seconds: loadedConfig.interval_seconds || DEFAULT_CHECKIN_INTERVAL
      };
    }

    const now = new Date();
    const lastCheckin = checkinConfig.last_checkin ? new Date(checkinConfig.last_checkin) : null;
    const intervalMs = checkinConfig.interval_seconds * 1000;

    // If no last check-in timestamp exists, this is the first run - set baseline but don't trigger check-in
    if (!lastCheckin) {
      console.log('⏰ First run detected - establishing check-in baseline (no check-in triggered)');

      // Set the baseline timestamp
      checkinConfig.last_checkin = now.toISOString();
      checkinConfig.last_reason = 'Baseline timestamp established on first run';
      checkinConfig.checkin_count = 0;

      // Ensure storage directory exists
      if (!existsSync(STORAGE_DIR)) {
        mkdirSync(STORAGE_DIR, { recursive: true });
      }

      // Save updated config
      writeFileSync(PLANNER_CHECKIN_FILE, yaml.dump(checkinConfig, {
        lineWidth: 120,
        noRefs: true,
        quotingType: '"',
        forceQuotes: false
      }));

      console.log(`✓ Check-in baseline established\n`);
      return; // Exit without triggering check-in
    }

    // Check if it's time for a check-in (interval has passed)
    if ((now - lastCheckin) >= intervalMs) {
      const timeSinceLastCheckin = Math.floor((now - lastCheckin) / 1000);
      const reason = `${timeSinceLastCheckin}s since last check-in (threshold: ${checkinConfig.interval_seconds}s)`;

      console.log(`⏰ Planner check-in triggered: ${reason}`);

      // Find or create planner session
      let plannerSessionFile = null;

      // First, try to find any existing planner-001 session in the sessions directory
      if (existsSync(SESSIONS_DIR)) {
        const sessionFiles = readdirSync(SESSIONS_DIR)
          .filter(f => f.startsWith('planner-001-') && f.endsWith('.session.yaml'))
          .sort(); // Use the earliest (lexicographically first) session

        if (sessionFiles.length > 0) {
          plannerSessionFile = join(SESSIONS_DIR, sessionFiles[0]);
          console.log(`📋 Using existing planner session: ${sessionFiles[0]}`);
        }
      }

      // If no existing session found, create a new one
      if (!plannerSessionFile) {
        console.log('📝 Creating new planner session for check-in...');
        plannerSessionFile = createSession('planner-001');
        checkinConfig.planner_session = plannerSessionFile.split('/').pop(); // Get just the filename
      } else {
        // Update config to track the session we're using
        checkinConfig.planner_session = plannerSessionFile.split('/').pop();
      }

      // Add check-in message to planner session
      appendMessage(plannerSessionFile, {
        role: 'user',
        content: 'Check-in with running agents to ensure progress'
      });

      // Update check-in config
      checkinConfig.last_checkin = now.toISOString();
      checkinConfig.last_reason = reason;
      checkinConfig.checkin_count = (checkinConfig.checkin_count || 0) + 1;

      // Ensure storage directory exists
      if (!existsSync(STORAGE_DIR)) {
        mkdirSync(STORAGE_DIR, { recursive: true });
      }

      // Save updated config
      writeFileSync(PLANNER_CHECKIN_FILE, yaml.dump(checkinConfig, {
        lineWidth: 120,
        noRefs: true,
        quotingType: '"',
        forceQuotes: false
      }));

      console.log(`✓ Planner check-in scheduled (count: ${checkinConfig.checkin_count})\n`);
    }
  } catch (error) {
    console.error('❌ Error in planner check-in:', error.message);
  }
}

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
    await checkPlannerCheckin();
    await scanTasks();
    await scanSessions();
    await rebuildApprovalQueue();
    await handleApprovalFileChange(APPROVALS_TASK_FILE);
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
  await checkPlannerCheckin();
  await scanSessions();
  console.log('✓ Initial scan complete\n');

  console.log('━'.repeat(60));
  console.log('✅ Daemon is running. Press Ctrl+C to stop.\n');

  // Keep process alive with periodic health check and planner check-in
  setInterval(async () => {
    try {
      await checkPlannerCheckin();
    } catch (error) {
      console.error('❌ Error during periodic planner check-in:', error.message);
    }
  }, 5000); // Check every 5 seconds
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

    // Determine tool_choice strategy:
    // - Default: 'auto' (let agent decide whether to use tools or not)
    // - If last message is 'tool_result': check if we should continue
    //   - For create_task results: don't auto-continue (task created, work done)
    //   - For other tool results: allow auto (agent can respond or use more tools)
    const lastMsg = session.messages[session.messages.length - 1];
    let toolChoice = 'auto';
    if (lastMsg.role === 'tool_result') {
      // Check if this was a create_task result - if so, don't auto-continue
      const prevMsg = session.messages[session.messages.length - 2];
      if (prevMsg && prevMsg.toolCalls) {
        const hasCreateTask = prevMsg.toolCalls.some(tc => tc.function.name === 'create_task');
        if (hasCreateTask && lastMsg.content.success) {
          // create_task succeeded - agent has completed its work, don't auto-continue
          console.log(`💭 Agent completed create_task successfully - not auto-continuing`);
          return;
        }
      }
    }

    // Call Copilot API
    console.log(`🤖 Calling Copilot API (model: ${session.model})...`);
    const response = await state.client.chat.completions.create({
      model: session.model,
      messages: messages,
      tools: tools,
      tool_choice: toolChoice
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

    // Store pending action in approval queue
    // The tool_result will be added only after approval/rejection
    state.approvalQueue.set(taskId, {
      sessionFile,
      toolCall,
      taskId
    });

    // Do not append tool_result message here - wait for approval

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

  // Handle arguments that may be already parsed (from YAML) or JSON string
  let toolArgs;
  if (typeof toolCall.function.arguments === 'string') {
    toolArgs = JSON.parse(toolCall.function.arguments);
  } else {
    toolArgs = toolCall.function.arguments;
  }

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
      content: result,
      toolCallId: toolCall.id
    });

  } catch (error) {
    console.error(`  ❌ Tool execution failed:`, error.message);

    appendMessage(sessionFile, {
      role: 'tool_result',
      content: {
        success: false,
        error: error.message
      },
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
 * Rebuild approval queue from approved tasks that need execution
 */
async function rebuildApprovalQueue() {
  if (!existsSync(APPROVALS_TASK_FILE)) return;

  try {
    // Find approved but not yet executed approval requests
    const { execSync } = await import('child_process');
    const result = execSync(`todo query "SELECT * FROM ${APPROVALS_TASK_FILE} WHERE type = 'approval_request' AND completed = true" --format json`, { encoding: 'utf8' });
    const approvedTasks = JSON.parse(result);

    for (const task of approvedTasks) {
      const agentId = task.agent;
      const taskId = task.id;

      // Find the matching session file
      const sessionFile = join(SESSIONS_DIR, `${agentId}.session.yaml`);

      if (!existsSync(sessionFile)) {
        console.log(`   ⚠️  Session file not found for approved task ${taskId}: ${sessionFile}`);
        continue;
      }

      // Read the session to find the pending tool call
      const sessionContent = readFileSync(sessionFile, 'utf8');
      const session = yaml.load(sessionContent);

      // Find the last assistant message with tool_calls
      const lastMessage = session.messages[session.messages.length - 1];
      if (lastMessage && lastMessage.role === 'assistant' && lastMessage.tool_calls) {
        // Find a tool call that matches the approval
        for (const toolCall of lastMessage.tool_calls) {
          if (toolCall.function.name === 'execute_command') {
            const command = toolCall.function.arguments.command;

            // Check if this command matches the approval description
            if (task.description && task.description.includes(command)) {
              console.log(`   🔄 Rebuilding approval queue for ${taskId}`);

              // Add to approval queue
              state.approvalQueue.set(taskId, {
                sessionFile,
                toolCall,
                taskId
              });
              break;
            }
          }
        }
      }
    }

    console.log(`   Found ${state.approvalQueue.size} approved tasks in queue`);
  } catch (error) {
    console.error('Error rebuilding approval queue:', error);
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
 * Scan tasks for agent assignments and create sessions
 */
async function scanTasks() {
  if (!existsSync(APPROVALS_TASK_FILE)) return;

  console.log(`   Checking task file for agent assignments...`);

  try {
    // Use todo CLI to query tasks
    const { spawn } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(spawn);

    const child = spawn('npx', ['todo', 'query', `SELECT * FROM ${APPROVALS_TASK_FILE}`, '-o', 'json'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: process.cwd()
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    await new Promise((resolve, reject) => {
      child.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Command failed: ${stderr}`));
        }
      });
      child.on('error', reject);
    });

    // Parse JSON output
    const tasks = JSON.parse(stdout);

    for (const task of tasks) {
      if (task.stakeholders && task.stakeholders.length > 0) {
        for (const stakeholder of task.stakeholders) {
          // Stakeholder is already the agent ID (without @)
          const agentId = stakeholder;

          // Skip non-agent stakeholders (like "human")
          if (agentId === 'human') {
            continue;
          }

          // Check if session already exists for this task
          const sessionFile = join(SESSIONS_DIR, `${agentId}-${task.id}.session.yaml`);
          if (!existsSync(sessionFile)) {
            console.log(`   📝 Creating session for ${agentId} on task ${task.id}`);

            // Create session for agent
            const sessionPath = createSession(agentId, `${agentId}-${task.id}`);

            // Add initial message with task details (just the description/prompt)
            appendMessage(sessionPath, {
              role: 'user',
              content: task.description || task.prompt || `Task: ${task.title}`
            });
          }
        }
      }
    }
  } catch (error) {
    console.log(`   ⚠️  Error scanning tasks: ${error.message}`);
  }
}

/**
 * Scan for pending approvals and populate the queue
 */
async function scanPendingApprovals() {
  if (!existsSync(APPROVALS_TASK_FILE)) return;

  console.log(`   Checking for pending approvals...`);

  try {
    // Use todo CLI to query pending approvals
    const { spawn } = await import('child_process');
    const { promisify } = await import('util');

    const child = spawn('npx', ['todo', 'query', `SELECT * FROM ${APPROVALS_TASK_FILE} WHERE completed = false`, '-o', 'json'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: process.cwd()
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    await new Promise((resolve, reject) => {
      child.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Command failed: ${stderr}`));
        }
      });
      child.on('error', reject);
    });

    // Parse JSON output
    const tasks = JSON.parse(stdout);

    for (const task of tasks) {
      if (task.type === 'approval_request' && task.status === 'pending') {
        // This is a pending approval, but we don't have the original pending action
        // For now, skip - the queue needs to be persisted
        console.log(`   ⏳ Found pending approval: ${task.id}`);
      }
    }
  } catch (error) {
    console.log(`   ⚠️  Error scanning approvals: ${error.message}`);
  }
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
