#!/usr/bin/env node
/**
 * scripts/clean.js
 * 
 * Cleans up temporary files and directories created by tests and demos
 */

import { existsSync, rmSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

console.log('🧹 Cleaning temporary files...\n');

const itemsToClean = [
  // Test directories
  { path: 'tests/temp', description: 'Unit test temp directory' },
  { path: 'tests/integration-temp', description: 'Integration test temp directory' },

  // Approval directories (reset to empty state)
  { path: 'approvals/pending', description: 'Pending approvals', keepDir: true },
  { path: 'approvals/approved', description: 'Approved actions', keepDir: true },
  { path: 'approvals/rejected', description: 'Rejected actions', keepDir: true },

  // Inbox files (created by demo and tools)
  { path: 'inbox/slack-messages.jsonl', description: 'Slack inbox messages', file: true },
  { path: 'inbox/slack-outbox.jsonl', description: 'Slack outbox messages', file: true },

  // Task files (created by demo)
  { path: 'tasks', description: 'Task files', keepDir: true },

  // Agent files (keep directory structure, remove generated agents)
  { path: 'agents', description: 'Agent chat logs', keepDir: true, cleanPattern: true },
];

let cleaned = 0;
let errors = 0;

for (const item of itemsToClean) {
  try {
    if (!existsSync(item.path)) {
      continue;
    }

    if (item.file) {
      // Remove individual file
      rmSync(item.path, { force: true });
      console.log(`✓ Removed ${item.description}: ${item.path}`);
      cleaned++;
    } else if (item.keepDir) {
      // Clean contents but keep directory
      if (item.cleanPattern) {
        // For agents, remove files but keep the directory structure
        const files = readdirSync(item.path);
        let fileCount = 0;
        for (const file of files) {
          const filePath = join(item.path, file);
          const stat = statSync(filePath);
          if (stat.isFile() && file.endsWith('.agent.md')) {
            rmSync(filePath, { force: true });
            fileCount++;
          }
        }
        if (fileCount > 0) {
          console.log(`✓ Cleaned ${fileCount} agent file(s) from ${item.path}`);
          cleaned += fileCount;
        }
      } else {
        // Remove all contents
        const files = readdirSync(item.path);
        let fileCount = 0;
        for (const file of files) {
          const filePath = join(item.path, file);
          rmSync(filePath, { recursive: true, force: true });
          fileCount++;
        }
        if (fileCount > 0) {
          console.log(`✓ Cleaned ${fileCount} item(s) from ${item.description}: ${item.path}`);
          cleaned += fileCount;
        }
      }
    } else {
      // Remove entire directory
      rmSync(item.path, { recursive: true, force: true });
      console.log(`✓ Removed ${item.description}: ${item.path}`);
      cleaned++;
    }
  } catch (error) {
    console.error(`✗ Error cleaning ${item.path}: ${error.message}`);
    errors++;
  }
}

// Clean up any integration-e2e-temp directories (created with timestamps)
try {
  if (existsSync('tests')) {
    const testFiles = readdirSync('tests');
    const e2eDirs = testFiles.filter(f => f.startsWith('integration-e2e-temp-'));
    for (const dir of e2eDirs) {
      const dirPath = join('tests', dir);
      rmSync(dirPath, { recursive: true, force: true });
      console.log(`✓ Removed e2e test directory: ${dirPath}`);
      cleaned++;
    }
  }
} catch (error) {
  console.error(`✗ Error cleaning e2e test directories: ${error.message}`);
  errors++;
}

// Clean up any test agent files in the global agents directory
try {
  if (existsSync('agents')) {
    const agentFiles = readdirSync('agents');
    const testAgents = agentFiles.filter(f =>
      f.includes('-test-') ||
      f.startsWith('source-test-') ||
      f.startsWith('target-test-') ||
      f.startsWith('test-')
    );
    for (const file of testAgents) {
      const filePath = join('agents', file);
      rmSync(filePath, { force: true });
      console.log(`✓ Removed test agent: ${filePath}`);
      cleaned++;
    }
  }
} catch (error) {
  console.error(`✗ Error cleaning test agent files: ${error.message}`);
  errors++;
}

console.log('\n' + '─'.repeat(50));
if (errors === 0) {
  console.log(`✅ Clean complete! Removed/cleaned ${cleaned} item(s).`);
  process.exit(0);
} else {
  console.log(`⚠️  Clean completed with ${errors} error(s). Cleaned ${cleaned} item(s).`);
  process.exit(1);
}
