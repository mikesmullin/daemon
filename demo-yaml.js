#!/usr/bin/env node
/**
 * demo-yaml.js
 * 
 * Creates a demo session for the YAML-based multi-agent system
 * Demonstrates the full workflow from Slack message to Redis check
 */

import { createSession, appendMessage } from './lib/agent-parser-yaml.js';
import { existsSync } from 'fs';
import { join } from 'path';

console.log('🎬 Multi-Agent YAML Demo\n');
console.log('━'.repeat(60));
console.log('Scenario: Slack message → Redis check → Response\n');

// Check if planner template exists
const templatePath = join('templates', 'planner-001.agent.yaml');
if (!existsSync(templatePath)) {
  console.error('❌ Error: Planner template not found!');
  console.error(`   Expected: ${templatePath}`);
  console.error('   Run migration or create templates first.');
  process.exit(1);
}

console.log('Step 1: Creating planner session...\n');

const sessionFile = createSession('planner-001');

console.log(`✓ Created session: ${sessionFile}\n`);

// Add the initial user message
appendMessage(sessionFile, {
  role: 'user',
  content: `New Slack message from @sarah: "Can you check if the Redis container is running locally?"

Context:
- User is the engineering manager (see memory/team-prefs.md)
- This is a status check request
- Response should be concise and include relevant metrics

Please decompose this into tasks for our multi-agent system.`
});

console.log(`✓ Added initial message to session\n`);

console.log('━'.repeat(60));
console.log('\n📋 Expected Workflow:\n');

console.log('1. Planner Agent:');
console.log('   - Reads memory/team-prefs.md using read_file tool');
console.log('   - Decomposes request into sub-tasks');
console.log('   - Creates tasks using create_task tool');
console.log('   - Tasks may include:');
console.log('     • Check Redis container status');
console.log('     • Format response for Slack\n');

console.log('2. Executor Agent (if needed):');
console.log('   - Receives task assignment via send_message');
console.log('   - Proposes command: docker ps --filter "name=redis"');
console.log('   - Creates approval request in tasks/approvals.task.md\n');

console.log('3. Human Operator (You):');
console.log('   - Reviews approval task file');
console.log('   - Changes task status: [_] → [x] to approve');
console.log('   - Or: [_] → [-] to reject\n');

console.log('4. Executor Agent (after approval):');
console.log('   - Executes approved command');
console.log('   - Returns results via send_message\n');

console.log('5. Evaluator Agent (if needed):');
console.log('   - Validates output format');
console.log('   - Checks response quality\n');

console.log('6. Planner Agent:');
console.log('   - Drafts final Slack response');
console.log('   - Uses team-prefs.md formatting guidelines');
console.log('   - May create approval for external communication\n');

console.log('━'.repeat(60));
console.log('\n🚀 To run this demo:\n');

console.log('Option 1 - Watch mode (automatic):');
console.log('  npm start');
console.log('  → Daemon watches sessions/ and processes continuously\n');

console.log('Option 2 - Pump mode (step-by-step):');
console.log('  npm run pump');
console.log('  → Process one iteration, then exit');
console.log('  → Run again to continue to next step');
console.log('  → Great for debugging and learning\n');

console.log('━'.repeat(60));
console.log('\n📁 Files to monitor:\n');
console.log('- sessions/*.session.yaml     → Active agent conversations');
console.log('- templates/*.agent.yaml      → Agent blueprints');
console.log('- tasks/*.task.md             → Task tracking');
console.log('- tasks/approvals.task.md     → Actions awaiting approval');
console.log('- memory/team-prefs.md        → Team communication preferences');
console.log('- memory/system-config.md     → System configuration\n');

console.log('━'.repeat(60));
console.log('\n💡 Tips:\n');
console.log('- Use `npm run pump` repeatedly to step through workflow');
console.log('- Check session YAML files to see tool calls and results');
console.log('- Tool results are now in readable YAML format (no \\r\\n!)');
console.log('- Approve tasks by editing tasks/approvals.task.md\n');

console.log('✅ Demo session initialized!\n');
console.log('Run: npm run pump\n');
