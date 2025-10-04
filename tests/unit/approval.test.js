// tests/unit/approval.test.js
// Tests for approval workflow system

import { existsSync, unlinkSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import {
  createApprovalRequest,
  parseApprovalFile,
  checkApprovalDecision,
  archiveApproval,
  assessRisk,
  requestToolApproval,
  ensureApprovalDirs
} from '../../lib/approval.js';

const TEMP_DIR = 'tests/temp';

// Ensure temp directory exists
if (!existsSync(TEMP_DIR)) {
  mkdirSync(TEMP_DIR, { recursive: true });
}

describe('Approval System', () => {

  test('ensureApprovalDirs - creates directories', () => {
    ensureApprovalDirs();

    expect(existsSync('approvals')).toBe(true);
    expect(existsSync('approvals/pending')).toBe(true);
    expect(existsSync('approvals/approved')).toBe(true);
    expect(existsSync('approvals/rejected')).toBe(true);
  });

  test('createApprovalRequest - creates file with correct structure', () => {
    ensureApprovalDirs();

    const request = {
      agent: 'test-agent',
      task: 'test-task',
      type: 'terminal_command',
      command: 'echo test',
      riskLevel: 'LOW',
      riskReason: 'Test command'
    };

    const filePath = createApprovalRequest(request);

    expect(existsSync(filePath)).toBe(true);
    expect(filePath).toContain('approvals/pending');
    expect(filePath).toContain('.approval.md');

    // Clean up
    unlinkSync(filePath);
  });

  test('parseApprovalFile - extracts approval data', () => {
    const approval = parseApprovalFile('tests/fixtures/test-approval.md');

    expect(approval.id).toBe('test-approval-001');
    expect(approval.agent).toBe('test-executor');
    expect(approval.task).toBe('test-task-001');
    expect(approval.status).toBe('pending');
    expect(approval.type).toBe('terminal_command');
  });

  test('checkApprovalDecision - returns null for pending', () => {
    const decision = checkApprovalDecision('tests/fixtures/test-approval.md');

    expect(decision).toBeNull();
  });

  test('checkApprovalDecision - detects APPROVED', () => {
    const testFile = join(TEMP_DIR, 'approved-test.md');

    const content = `# Approval Request: test
agent: test
created: 2025-10-04T10:00:00Z

## Proposed Action
**Type:** test

## Review
**Decision:** APPROVED
**Reviewed by:** Tester
**Reviewed at:** 2025-10-04T10:05:00Z
`;

    writeFileSync(testFile, content, 'utf8');

    const decision = checkApprovalDecision(testFile);

    expect(decision).not.toBeNull();
    expect(decision.approved).toBe(true);
    expect(decision.rejected).toBe(false);
    expect(decision.reviewedBy).toBe('Tester');

    unlinkSync(testFile);
  });

  test('checkApprovalDecision - detects REJECTED', () => {
    const testFile = join(TEMP_DIR, 'rejected-test.md');

    const content = `# Approval Request: test
agent: test
created: 2025-10-04T10:00:00Z

## Proposed Action
**Type:** test

## Review
**Decision:** REJECTED
**Reviewed by:** Tester
**Reviewed at:** 2025-10-04T10:05:00Z
`;

    writeFileSync(testFile, content, 'utf8');

    const decision = checkApprovalDecision(testFile);

    expect(decision).not.toBeNull();
    expect(decision.approved).toBe(false);
    expect(decision.rejected).toBe(true);

    unlinkSync(testFile);
  });

  test('assessRisk - identifies HIGH risk commands', () => {
    const risk = assessRisk('execute_command', { command: 'rm -rf /' });

    expect(risk.level).toBe('HIGH');
    expect(risk.reason).toContain('destructive');
  });

  test('assessRisk - identifies MEDIUM risk commands', () => {
    const risk = assessRisk('execute_command', { command: 'curl http://example.com' });

    expect(risk.level).toBe('MEDIUM');
    expect(risk.reason).toContain('network');
  });

  test('assessRisk - identifies LOW risk commands', () => {
    const risk = assessRisk('execute_command', { command: 'ls -la' });

    expect(risk.level).toBe('LOW');
    expect(risk.reason).toContain('low-impact');
  });

  test('assessRisk - assesses file write operations', () => {
    const risk1 = assessRisk('write_file', { path: 'package.json' });
    expect(risk1.level).toBe('MEDIUM');

    const risk2 = assessRisk('write_file', { path: 'data/file.txt' });
    expect(risk2.level).toBe('LOW');
  });

  test('assessRisk - assesses Slack operations', () => {
    const risk = assessRisk('slack_send', { channel: 'test', message: 'test' });

    expect(risk.level).toBe('MEDIUM');
    expect(risk.reason).toContain('External communication');
  });

  test('requestToolApproval - creates approval for tool', () => {
    ensureApprovalDirs();

    const filePath = requestToolApproval(
      'test-agent',
      'execute_command',
      { command: 'echo test' },
      { taskId: 'test-task-001', description: 'Test execution' }
    );

    expect(existsSync(filePath)).toBe(true);

    const approval = parseApprovalFile(filePath);
    expect(approval.agent).toBe('test-agent');
    expect(approval.type).toBe('terminal_command');

    unlinkSync(filePath);
  });

  test('archiveApproval - moves to approved directory', () => {
    ensureApprovalDirs();

    const request = {
      agent: 'archive-test',
      type: 'test',
      details: {}
    };

    const pendingFile = createApprovalRequest(request);
    expect(existsSync(pendingFile)).toBe(true);

    const archivedFile = archiveApproval(pendingFile, true);

    expect(existsSync(pendingFile)).toBe(false);
    expect(existsSync(archivedFile)).toBe(true);
    expect(archivedFile).toContain('approved');

    unlinkSync(archivedFile);
  });

  test('archiveApproval - moves to rejected directory', () => {
    ensureApprovalDirs();

    const request = {
      agent: 'reject-test',
      type: 'test',
      details: {}
    };

    const pendingFile = createApprovalRequest(request);
    const archivedFile = archiveApproval(pendingFile, false);

    expect(existsSync(archivedFile)).toBe(true);
    expect(archivedFile).toContain('rejected');

    unlinkSync(archivedFile);
  });
});

describe('Approval File Format', () => {

  test('creates valid markdown structure', () => {
    ensureApprovalDirs();

    const request = {
      agent: 'format-test',
      task: 'test-task',
      type: 'terminal_command',
      command: 'echo "format test"',
      context: 'Testing format',
      riskLevel: 'LOW',
      riskReason: 'Test only'
    };

    const filePath = createApprovalRequest(request);
    const approval = parseApprovalFile(filePath);

    expect(approval.agent).toBe('format-test');
    expect(approval.task).toBe('test-task');
    expect(approval.type).toBe('terminal_command');
    expect(approval.riskLevel).toBe('LOW');

    unlinkSync(filePath);
  });

  test('handles different request types', () => {
    ensureApprovalDirs();

    // File write request
    const fileRequest = {
      agent: 'file-test',
      type: 'file_write',
      path: 'test.txt',
      content: 'test content',
      riskLevel: 'LOW'
    };

    const filePath1 = createApprovalRequest(fileRequest);
    expect(existsSync(filePath1)).toBe(true);
    unlinkSync(filePath1);

    // Slack send request
    const slackRequest = {
      agent: 'slack-test',
      type: 'slack_send',
      channel: '#test',
      message: 'Test message',
      riskLevel: 'MEDIUM'
    };

    const filePath2 = createApprovalRequest(slackRequest);
    expect(existsSync(filePath2)).toBe(true);
    unlinkSync(filePath2);
  });
});

describe('Risk Assessment Edge Cases', () => {

  test('handles various dangerous command patterns', () => {
    const dangerous = [
      'rm -rf *',
      'sudo reboot',
      'chmod 777 *',
      'dd if=/dev/zero',
      ': (){ :|:& };:'
    ];

    dangerous.forEach(cmd => {
      const risk = assessRisk('execute_command', { command: cmd });
      expect(risk.level).toBe('HIGH');
    });
  });

  test('handles safe command patterns', () => {
    const safe = [
      'ls -la',
      'cat README.md',
      'grep "test" file.txt',
      'node --version',
      'docker ps'
    ];

    safe.forEach(cmd => {
      const risk = assessRisk('execute_command', { command: cmd });
      expect(risk.level).toBe('LOW');
    });
  });

  test('handles critical config files', () => {
    const critical = [
      'package.json',
      '.env',
      'config.yaml',
      '.git/config'
    ];

    critical.forEach(path => {
      const risk = assessRisk('write_file', { path });
      expect(risk.level).toBe('MEDIUM');
    });
  });
});
