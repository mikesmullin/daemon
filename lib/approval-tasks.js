/**
 * lib/approval.js
 * 
 * Human approval system using task format from tmp6-todo
 * Approvals are tracked as tasks in tasks/*.task.md files
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';
import crypto from 'crypto';

const TASKS_DIR = 'tasks';
const APPROVALS_TASK_FILE = join(TASKS_DIR, 'approvals.task.md');

/**
 * Ensure tasks directory exists
 */
export function ensureApprovalDirs() {
  if (!existsSync(TASKS_DIR)) {
    mkdirSync(TASKS_DIR, { recursive: true });
  }

  // Initialize approvals.task.md if it doesn't exist
  if (!existsSync(APPROVALS_TASK_FILE)) {
    const initialContent = `# Approval Tasks

All approval requests are tracked here using the todo task format.

## TODO

`;
    writeFileSync(APPROVALS_TASK_FILE, initialContent, 'utf8');
  }
}

/**
 * Create an approval request as a task
 * @param {Object} request - Approval request details
 * @returns {string} Task ID for the approval
 */
export function createApprovalRequest(request) {
  ensureApprovalDirs();

  const taskId = `approval-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;

  // Build task title based on type
  let title = '';
  if (request.type === 'terminal_command') {
    title = `Approve command: ${request.command?.substring(0, 50) || 'unknown'}`;
  } else if (request.type === 'file_write') {
    title = `Approve file write: ${request.path || 'unknown'}`;
  } else if (request.type === 'slack_send') {
    title = `Approve Slack message`;
  } else {
    title = `Approve ${request.type}`;
  }

  // Assess risk level
  const risk = assessRisk(request);

  // Build task description with all details
  const description = formatApprovalDescription(request, risk);

  // Create task in todo format
  const taskLine = `- [_] A @human #approval \`${title}\`
  id: ${taskId}
  type: approval_request
  approval_type: ${request.type}
  agent: ${request.agent || 'unknown'}
  created: ${new Date().toISOString()}
  risk: ${risk.level}
  status: pending
  description: |
${description.split('\n').map(line => '    ' + line).join('\n')}
`;

  // Append task to approvals file
  appendTaskToFile(APPROVALS_TASK_FILE, taskLine);

  return taskId;
}

/**
 * Format approval description with all details
 */
function formatApprovalDescription(request, risk) {
  const lines = [];

  lines.push(`Approval Request: ${request.type}`);
  lines.push(`Risk Level: ${risk.level}`);

  if (risk.reasons.length > 0) {
    lines.push('Risk Factors:');
    for (const reason of risk.reasons) {
      lines.push(`  - ${reason}`);
    }
  }

  lines.push('');
  lines.push('Details:');

  if (request.command) {
    lines.push(`  Command: ${request.command}`);
  }
  if (request.path) {
    lines.push(`  Path: ${request.path}`);
  }
  if (request.content) {
    lines.push(`  Content: ${request.content.substring(0, 100)}${request.content.length > 100 ? '...' : ''}`);
  }
  if (request.message) {
    lines.push(`  Message: ${request.message.substring(0, 100)}${request.message.length > 100 ? '...' : ''}`);
  }
  if (request.channel) {
    lines.push(`  Channel: ${request.channel}`);
  }

  lines.push('');
  lines.push('To approve: Update this task:');
  lines.push('  1. Change [_] to [x]');
  lines.push('  2. Add: approved_by: <your-name>');
  lines.push('  3. Add: approved_at: <timestamp>');
  lines.push('');
  lines.push('To reject: Update this task:');
  lines.push('  1. Change [_] to [-]');
  lines.push('  2. Add: rejected_by: <your-name>');
  lines.push('  3. Add: rejection_reason: <reason>');

  return lines.join('\n');
}

/**
 * Append task to file (under ## TODO section)
 */
function appendTaskToFile(filePath, taskContent) {
  let content = readFileSync(filePath, 'utf8');

  // Find ## TODO section
  const todoMatch = content.match(/^## TODO\s*$/m);
  if (!todoMatch) {
    // Add TODO section if missing
    content += '\n## TODO\n\n';
  }

  // Append task after TODO heading
  const todoIndex = content.indexOf('## TODO');
  const afterHeading = content.indexOf('\n', todoIndex) + 1;

  content = content.substring(0, afterHeading) + '\n' + taskContent + '\n' + content.substring(afterHeading);

  writeFileSync(filePath, content, 'utf8');
}

/**
 * Request tool approval (convenience wrapper)
 */
export function requestToolApproval(agentId, toolName, toolArgs, options = {}) {
  const request = {
    agent: agentId,
    type: getToolApprovalType(toolName),
    description: options.description || `${agentId} wants to use ${toolName}`,
    ...extractToolDetails(toolName, toolArgs)
  };

  return createApprovalRequest(request);
}

/**
 * Get approval type from tool name
 */
function getToolApprovalType(toolName) {
  const typeMap = {
    'execute_command': 'terminal_command',
    'run_command': 'terminal_command',
    'write_file': 'file_write',
    'slack_send': 'slack_send',
    'slack_message': 'slack_send'
  };
  return typeMap[toolName] || toolName;
}

/**
 * Extract details from tool args
 */
function extractToolDetails(toolName, args) {
  const details = {};

  if (toolName === 'execute_command' || toolName === 'run_command') {
    details.command = args.command || args.cmd;
  } else if (toolName === 'write_file') {
    details.path = args.path || args.file;
    details.content = args.content;
  } else if (toolName === 'slack_send' || toolName === 'slack_message') {
    details.message = args.message || args.text;
    details.channel = args.channel;
  }

  return details;
}

/**
 * Check approval decision by querying the task file with todo CLI
 * @param {string} taskId - Task ID for the approval
 * @returns {Object|null} Decision object or null if pending
 */
export function checkApprovalDecision(taskId) {
  if (!existsSync(APPROVALS_TASK_FILE)) {
    return null;
  }

  try {
    // Use todo CLI to check the completion status
    const query = `SELECT * FROM ${APPROVALS_TASK_FILE} WHERE id = '${taskId}'`;
    const result = execSync(`todo query "${query}" --format json`, { encoding: 'utf8' });
    const tasks = JSON.parse(result);

    if (tasks.length === 0) {
      return null; // Task not found
    }

    const task = tasks[0];

    if (task.completed === true) {
      return {
        approved: true,
        approvedBy: task.approved_by || 'unknown',
        approvedAt: task.approved_at || new Date().toISOString(),
        notes: task.description || ''
      };
    } else if (task.completed === false) {
      return {
        approved: false,
        rejectedBy: task.rejected_by || 'unknown',
        rejectionReason: task.rejection_reason || 'No reason provided',
        notes: task.description || 'No reason provided'
      };
    }

    // Still pending (completed = null)
    return null;
  } catch (error) {
    console.error('Error checking approval decision with todo CLI:', error);

    // Fallback to original regex parsing if todo CLI fails
    const content = readFileSync(APPROVALS_TASK_FILE, 'utf8');

    // Find the task with this ID
    const taskMatch = content.match(new RegExp(`id: ${taskId}[\\s\\S]*?(?=\\n- |\\n## |$)`, 'm'));
    if (!taskMatch) {
      return null;
    }

    const taskContent = taskMatch[0];

    // Check completion status
    const isCompleted = /^\s*- \[x\]/m.test(taskContent);
    const isSkipped = /^\s*- \[-\]/m.test(taskContent);

    if (isCompleted) {
      // Extract approval details
      const approvedBy = taskContent.match(/approved_by:\s*(.+)/)?.[1]?.trim() || 'unknown';
      const approvedAt = taskContent.match(/approved_at:\s*(.+)/)?.[1]?.trim() || new Date().toISOString();
      const notes = taskContent.match(/notes:\s*\|\s*\n([\s\S]*?)(?=\n\s{0,2}\S|\n\s*$)/)?.[1]?.trim() || '';

      return {
        approved: true,
        approvedBy,
        approvedAt,
        notes
      };
    } else if (isSkipped) {
      // Extract rejection details
      const rejectedBy = taskContent.match(/rejected_by:\s*(.+)/)?.[1]?.trim() || 'unknown';
      const rejectionReason = taskContent.match(/rejection_reason:\s*(.+)/)?.[1]?.trim() || 'No reason provided';

      return {
        approved: false,
        rejectedBy,
        rejectionReason,
        notes: rejectionReason
      };
    }

    // Still pending
    return null;
  }
}

/**
 * Archive approval (mark as completed/rejected in the file)
 * In task format, this is already handled by the task completion status
 * We can optionally move completed tasks to a separate section
 */
export function archiveApproval(taskId, approved) {
  // In task format, the status is already in the file
  // We could implement archiving to a different section or file if needed
  // For now, the [x] or [-] status is sufficient
  console.log(`   ℹ️  Approval ${taskId} ${approved ? 'approved' : 'rejected'} (tracked in ${APPROVALS_TASK_FILE})`);
}

/**
 * Parse approval file (legacy compatibility - now reads from task format)
 */
export function parseApprovalFile(taskId) {
  const decision = checkApprovalDecision(taskId);
  if (!decision) {
    return {
      id: taskId,
      status: 'pending',
      agent: 'unknown',
      type: 'unknown'
    };
  }

  return {
    id: taskId,
    status: decision.approved ? 'approved' : 'rejected',
    agent: decision.approvedBy || decision.rejectedBy,
    type: 'approval',
    ...decision
  };
}

/**
 * Assess risk level for an approval request
 */
export function assessRisk(request) {
  const risk = {
    level: 'LOW',
    reasons: []
  };

  // Terminal commands
  if (request.type === 'terminal_command' && request.command) {
    const cmd = request.command.toLowerCase();

    // HIGH risk commands
    const highRisk = [
      'rm ', 'rm -rf', 'sudo', 'chmod', 'chown',
      'reboot', 'shutdown', 'halt', 'poweroff',
      'dd ', 'mkfs', 'fdisk', 'parted',
      'iptables', 'ufw ', 'firewall',
      'kill ', 'killall', 'pkill'
    ];

    for (const pattern of highRisk) {
      if (cmd.includes(pattern)) {
        risk.level = 'HIGH';
        risk.reasons.push(`Dangerous command: ${pattern}`);
      }
    }

    // MEDIUM risk commands
    if (risk.level !== 'HIGH') {
      const mediumRisk = [
        'npm install', 'pip install', 'apt install', 'yum install',
        'git push', 'git force', 'git reset --hard',
        'docker ', 'kubectl ', 'systemctl'
      ];

      for (const pattern of mediumRisk) {
        if (cmd.includes(pattern)) {
          risk.level = 'MEDIUM';
          risk.reasons.push(`System-modifying command: ${pattern}`);
        }
      }
    }
  }

  // File writes
  if (request.type === 'file_write' && request.path) {
    const path = request.path.toLowerCase();

    // HIGH risk paths
    const criticalPaths = [
      '/etc/', '.ssh/', '.aws/', '.env',
      'config.json', 'secrets', 'password'
    ];

    for (const pattern of criticalPaths) {
      if (path.includes(pattern)) {
        risk.level = 'HIGH';
        risk.reasons.push(`Critical file: ${pattern}`);
      }
    }

    if (risk.level !== 'HIGH') {
      risk.level = 'MEDIUM';
      risk.reasons.push('File modification');
    }
  }

  // Slack messages
  if (request.type === 'slack_send') {
    risk.level = 'MEDIUM';
    risk.reasons.push('External communication');
  }

  return risk;
}
