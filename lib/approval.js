/**
 * lib/approval.js
 * 
 * Approval workflow for high-risk agent actions
 * Creates approval request files that humans review and approve/reject
 */

import { readFileSync, writeFileSync, existsSync, renameSync, mkdirSync } from 'fs';
import { join } from 'path';
import crypto from 'crypto';

const APPROVAL_DIR = 'approvals';
const PENDING_DIR = join(APPROVAL_DIR, 'pending');
const APPROVED_DIR = join(APPROVAL_DIR, 'approved');
const REJECTED_DIR = join(APPROVAL_DIR, 'rejected');

/**
 * Ensure approval directories exist
 */
export function ensureApprovalDirs() {
  for (const dir of [APPROVAL_DIR, PENDING_DIR, APPROVED_DIR, REJECTED_DIR]) {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }
}

/**
 * Create an approval request file
 * @param {Object} request - Approval request details
 * @returns {string} Path to created approval file
 */
export function createApprovalRequest(request) {
  ensureApprovalDirs();

  const id = `${request.type}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  const filePath = join(PENDING_DIR, `${id}.approval.md`);

  const content = formatApprovalRequest(id, request);
  writeFileSync(filePath, content, 'utf8');

  return filePath;
}

/**
 * Format an approval request as Markdown
 * @param {string} id - Approval request ID
 * @param {Object} request - Request details
 * @returns {string} Formatted Markdown content
 */
function formatApprovalRequest(id, request) {
  const lines = [];

  lines.push(`# Approval Request: ${id}`);
  lines.push(`agent: ${request.agent}`);
  lines.push(`task: ${request.task || 'N/A'}`);
  lines.push(`created: ${new Date().toISOString()}`);
  lines.push(`status: pending`);
  lines.push('');

  lines.push('## Proposed Action');
  lines.push('');
  lines.push(`**Type:** ${request.type}`);
  lines.push('');

  if (request.type === 'terminal_command') {
    lines.push('**Command:**');
    lines.push('```bash');
    lines.push(request.command);
    lines.push('```');
    lines.push('');

    if (request.cwd) {
      lines.push(`**Working Directory:** \`${request.cwd}\``);
      lines.push('');
    }
  } else if (request.type === 'file_write') {
    lines.push(`**File:** \`${request.path}\``);
    lines.push('');
    lines.push('**Content:**');
    lines.push('```');
    lines.push(request.content.substring(0, 500));
    if (request.content.length > 500) {
      lines.push('... (truncated)');
    }
    lines.push('```');
    lines.push('');
  } else if (request.type === 'slack_send') {
    lines.push(`**Channel:** ${request.channel}`);
    lines.push('');
    lines.push('**Message:**');
    lines.push('```');
    lines.push(request.message);
    lines.push('```');
    lines.push('');
  } else {
    lines.push('**Details:**');
    lines.push('```json');
    lines.push(JSON.stringify(request.details, null, 2));
    lines.push('```');
    lines.push('');
  }

  if (request.context) {
    lines.push('**Context:**');
    lines.push(request.context);
    lines.push('');
  }

  lines.push(`**Risk Level:** ${request.riskLevel || 'UNKNOWN'}`);
  if (request.riskReason) {
    lines.push(`- ${request.riskReason}`);
  }
  lines.push('');

  lines.push('## Review');
  lines.push('');
  lines.push('<!-- Human: Edit this section to approve or reject -->');
  lines.push('');
  lines.push('**Decision:** <!-- APPROVED | REJECTED -->');
  lines.push('');
  lines.push('**Notes:**');
  lines.push('<!-- Add any notes here -->');
  lines.push('');
  lines.push('**Reviewed by:**');
  lines.push('**Reviewed at:**');
  lines.push('');

  return lines.join('\n');
}

/**
 * Parse an approval request file
 * @param {string} filePath - Path to approval file
 * @returns {Object} Parsed approval data
 */
export function parseApprovalFile(filePath) {
  if (!existsSync(filePath)) {
    throw new Error(`Approval file not found: ${filePath}`);
  }

  const content = readFileSync(filePath, 'utf8');
  const lines = content.split('\n').map(line => line.replace(/\r$/, '')); // Remove \r from Windows line endings

  const approval = {
    id: null,
    agent: null,
    task: null,
    created: null,
    status: 'pending',
    type: null,
    details: {},
    decision: null,
    reviewNotes: '',
    reviewedBy: null,
    reviewedAt: null
  };

  let section = 'header';
  let currentField = null;
  let codeBlockContent = [];
  let inCodeBlock = false;

  for (const line of lines) {
    // Parse header
    if (line.startsWith('# Approval Request: ')) {
      approval.id = line.substring('# Approval Request: '.length).trim();
      continue;
    }

    if (section === 'header') {
      if (line.startsWith('agent: ')) approval.agent = line.substring(7).trim();
      if (line.startsWith('task: ')) approval.task = line.substring(6).trim();
      if (line.startsWith('created: ')) approval.created = new Date(line.substring(9).trim());
      if (line.startsWith('status: ')) approval.status = line.substring(8).trim();
    }

    // Detect sections
    if (line === '## Proposed Action') {
      section = 'action';
      continue;
    }
    if (line === '## Review') {
      section = 'review';
      continue;
    }

    // Parse action details
    if (section === 'action') {
      if (line.startsWith('**Type:** ')) {
        approval.type = line.substring(10).trim();
      }
      if (line.startsWith('**Command:**') || line.startsWith('**Content:**') ||
        line.startsWith('**Message:**')) {
        currentField = line.substring(2, line.indexOf(':**')).toLowerCase();
      }
      if (line.startsWith('```')) {
        if (!inCodeBlock) {
          inCodeBlock = true;
          codeBlockContent = [];
        } else {
          inCodeBlock = false;
          if (currentField) {
            approval.details[currentField] = codeBlockContent.join('\n');
            currentField = null;
          }
        }
        continue;
      }
      if (inCodeBlock) {
        codeBlockContent.push(line);
      }
      if (line.startsWith('**Risk Level:** ')) {
        approval.riskLevel = line.substring(16).trim();
      }
    }

    // Parse review decision
    if (section === 'review') {
      const decisionMatch = line.match(/\*\*Decision:\*\*\s*(APPROVED|REJECTED)/);
      if (decisionMatch) {
        approval.decision = decisionMatch[1];
      }
      if (line.startsWith('**Reviewed by:** ')) {
        approval.reviewedBy = line.substring(17).trim();
      }
      if (line.startsWith('**Reviewed at:** ')) {
        const dateStr = line.substring(17).trim();
        if (dateStr) approval.reviewedAt = new Date(dateStr);
      }
    }
  }

  return approval;
}

/**
 * Check if an approval request has been reviewed
 * @param {string} filePath - Path to approval file
 * @returns {Object|null} Decision object if reviewed, null otherwise
 */
export function checkApprovalDecision(filePath) {
  const approval = parseApprovalFile(filePath);

  if (!approval.decision) {
    return null;
  }

  return {
    approved: approval.decision === 'APPROVED',
    rejected: approval.decision === 'REJECTED',
    reviewedBy: approval.reviewedBy,
    reviewedAt: approval.reviewedAt,
    notes: approval.reviewNotes
  };
}

/**
 * Move approval file to approved/rejected directory
 * @param {string} filePath - Path to pending approval file
 * @param {boolean} approved - True if approved, false if rejected
 */
export function archiveApproval(filePath, approved) {
  const filename = filePath.split('/').pop();
  const targetDir = approved ? APPROVED_DIR : REJECTED_DIR;
  const targetPath = join(targetDir, filename);

  // Update status in file before moving
  let content = readFileSync(filePath, 'utf8');
  content = content.replace(
    /status: pending/,
    `status: ${approved ? 'approved' : 'rejected'}`
  );
  writeFileSync(filePath, content, 'utf8');

  renameSync(filePath, targetPath);

  return targetPath;
}

/**
 * Assess risk level for a tool call
 * @param {string} toolName - Name of the tool
 * @param {Object} args - Tool arguments
 * @returns {Object} Risk assessment
 */
export function assessRisk(toolName, args) {
  const risk = {
    level: 'LOW',
    reason: null
  };

  switch (toolName) {
    case 'execute_command':
      // Check for dangerous patterns
      const cmd = args.command.toLowerCase();
      if (cmd.includes('rm -rf') || cmd.includes('sudo') || cmd.includes('chmod 777') ||
        cmd.includes('dd if=') || cmd.includes('(){ :') || cmd.includes('fork')) {
        risk.level = 'HIGH';
        risk.reason = 'Command contains potentially destructive operations';
      } else if (cmd.includes('curl') || cmd.includes('wget') || cmd.includes('git push')) {
        risk.level = 'MEDIUM';
        risk.reason = 'Command performs network or external operations';
      } else {
        risk.level = 'LOW';
        risk.reason = 'Read-only or low-impact command';
      }
      break;

    case 'write_file':
      // Check if modifying critical files
      const path = args.path.toLowerCase();
      if (path.includes('package.json') || path.includes('.env') || path.includes('config')) {
        risk.level = 'MEDIUM';
        risk.reason = 'Modifying configuration or dependency file';
      } else {
        risk.level = 'LOW';
        risk.reason = 'Standard file write operation';
      }
      break;

    case 'slack_send':
      risk.level = 'MEDIUM';
      risk.reason = 'External communication - should be reviewed for tone and accuracy';
      break;

    default:
      risk.level = 'LOW';
      risk.reason = 'Standard operation';
  }

  return risk;
}

/**
 * Create approval request for a tool call
 * @param {string} agentId - Agent making the request
 * @param {string} toolName - Tool to execute
 * @param {Object} args - Tool arguments
 * @param {Object} context - Additional context
 * @returns {string} Path to approval file
 */
export function requestToolApproval(agentId, toolName, args, context = {}) {
  const risk = assessRisk(toolName, args);

  const request = {
    agent: agentId,
    task: context.taskId || null,
    type: getRequestType(toolName),
    riskLevel: risk.level,
    riskReason: risk.reason,
    context: context.description || null,
    ...mapToolArgsToRequest(toolName, args)
  };

  return createApprovalRequest(request);
}

/**
 * Map tool name to approval request type
 */
function getRequestType(toolName) {
  const mapping = {
    'execute_command': 'terminal_command',
    'write_file': 'file_write',
    'slack_send': 'slack_send'
  };
  return mapping[toolName] || 'tool_call';
}

/**
 * Map tool arguments to approval request format
 */
function mapToolArgsToRequest(toolName, args) {
  switch (toolName) {
    case 'execute_command':
      return {
        command: args.command,
        cwd: args.cwd
      };
    case 'write_file':
      return {
        path: args.path,
        content: args.content
      };
    case 'slack_send':
      return {
        channel: args.channel,
        message: args.message
      };
    default:
      return { details: args };
  }
}
