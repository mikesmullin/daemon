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
  { path: 'tests/e2e-temp', description: 'E2E test temp directory' },
  { path: 'tests/yaml-unit-temp', description: 'YAML unit test temp directory' },

  // DEPRECATED: Old approval directories (will be removed completely)
  { path: 'approvals', description: 'DEPRECATED approval directories (use tasks instead)' },

  // Inbox files (created by demo and tools)
  { path: 'inbox/slack-messages.jsonl', description: 'Slack inbox messages', file: true },
  { path: 'inbox/slack-outbox.jsonl', description: 'Slack outbox messages', file: true },

  // Task files (keep directory, remove test files)
  { path: 'tasks', description: 'Task files', keepDir: true, cleanPattern: /^(test-|demo-|approvals\.task\.md)/ },

  // YAML sessions (keep directory, remove test/demo sessions)
  { path: 'sessions', description: 'YAML sessions', keepDir: true, cleanPattern: /^(test-|demo-)/ },

  // Templates (keep directory, remove test templates)
  { path: 'templates', description: 'Agent templates', keepDir: true, cleanPattern: /^test-/ },

  // DEPRECATED: Old agent .md files (to be removed completely)
  { path: 'agents', description: 'DEPRECATED agent .md files (migrated to YAML)', cleanPattern: /\.agent\.md$/ },
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
    } else if (item.keepDir || item.cleanPattern) {
      // Clean contents but keep directory
      if (!existsSync(item.path)) {
        continue;
      }

      const files = readdirSync(item.path);
      let fileCount = 0;

      for (const file of files) {
        const filePath = join(item.path, file);
        const stat = statSync(filePath);

        if (stat.isFile()) {
          // Check if file matches clean pattern
          const shouldClean = item.cleanPattern ?
            (item.cleanPattern instanceof RegExp ? item.cleanPattern.test(file) : item.cleanPattern) :
            true;  // Clean all if keepDir without pattern

          if (shouldClean) {
            rmSync(filePath, { force: true });
            fileCount++;
          }
        }
      }

      if (fileCount > 0) {
        console.log(`✓ Cleaned ${fileCount} file(s) from ${item.description}: ${item.path}`);
        cleaned += fileCount;
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
