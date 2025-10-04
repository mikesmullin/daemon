/**
 * demo-scenario.js
 * 
 * Simulates the Slack-integrated, multi-agent supervision loop scenario
 * Demonstrates the full workflow from external message to approved response
 */

import { appendMessage } from './lib/agent-parser.js';
import { writeFileSync } from 'fs';
import { join } from 'path';

console.log('🎬 Multi-Agent Scenario Demo\n');
console.log('━'.repeat(60));
console.log('Scenario: Slack message → Redis check → Response\n');

// Step 1: Simulate Slack message arrival
console.log('Step 1: Simulating incoming Slack message...\n');

const slackMessage = {
  timestamp: new Date().toISOString(),
  channel: 'C123456',
  user: 'U789ABC',
  user_name: 'sarah',
  text: 'Can you check if the Redis container is running locally?'
};

// Write to inbox
const inboxPath = 'inbox/slack-messages.jsonl';
writeFileSync(inboxPath, JSON.stringify(slackMessage) + '\n', 'utf8');
console.log('✓ Slack message written to inbox/slack-messages.jsonl');
console.log(`  From: @${slackMessage.user_name}`);
console.log(`  Message: "${slackMessage.text}"\n`);

// Step 2: Route to planner
console.log('Step 2: Routing to planner agent...\n');

const plannerFile = 'agents/planner-001.agent.md';
appendMessage(plannerFile, {
  role: 'user',
  content: `New Slack message from @${slackMessage.user_name}: "${slackMessage.text}"

Context:
- User is the engineering manager (see memory/team-prefs.md)
- This is a status check request
- Response should be concise and include relevant metrics

Please decompose this into tasks for our multi-agent system.`
});

console.log('✓ Message appended to agents/planner-001.agent.md');
console.log('  The daemon will now process this and call Copilot API\n');

console.log('━'.repeat(60));
console.log('\n📋 Expected Workflow:\n');

console.log('1. Planner Agent:');
console.log('   - Decomposes request into sub-tasks');
console.log('   - Creates tasks/redis-check.task.md with:');
console.log('     • Retriever task: Determine container runtime');
console.log('     • Executor task: Run container status command');
console.log('     • Evaluator task: Validate output format');
console.log('     • Planner task: Draft Slack response\n');

console.log('2. Retriever Agent:');
console.log('   - Receives task assignment');
console.log('   - Reads memory/system-config.md');
console.log('   - Responds: "System uses Docker Desktop"\n');

console.log('3. Executor Agent:');
console.log('   - Receives task assignment');
console.log('   - Proposes command: docker ps --filter "name=redis"');
console.log('   - Creates approval request in approvals/pending/\n');

console.log('4. Human Operator (You):');
console.log('   - Reviews approval file');
console.log('   - Edits file: Decision: APPROVED');
console.log('   - Daemon detects change\n');

console.log('5. Executor Agent:');
console.log('   - Executes approved command');
console.log('   - Logs results to chat log');
console.log('   - Updates task status: completed\n');

console.log('6. Evaluator Agent:');
console.log('   - Receives completion notification');
console.log('   - Validates output format');
console.log('   - Marks validation complete\n');

console.log('7. Planner Agent:');
console.log('   - Drafts Slack response using team-prefs.md style');
console.log('   - Creates approval for slack_send tool\n');

console.log('8. Human Operator (You):');
console.log('   - Reviews proposed message');
console.log('   - Approves for sending\n');

console.log('9. Final Step:');
console.log('   - Message sent to Slack');
console.log('   - Logged to inbox/slack-outbox.jsonl');
console.log('   - All tasks marked complete\n');

console.log('━'.repeat(60));
console.log('\n🚀 To run this demo:\n');
console.log('1. Install dependencies:');
console.log('   npm install chokidar\n');

console.log('2. Start the daemon:');
console.log('   node daemon.js\n');

console.log('3. The daemon will:');
console.log('   - Process the planner message we just added');
console.log('   - Create tasks and route to other agents');
console.log('   - Create approval requests as needed\n');

console.log('4. You (human operator):');
console.log('   - Watch the console output');
console.log('   - Edit approval files in approvals/pending/');
console.log('   - Change "Decision: <!-- APPROVED | REJECTED -->"');
console.log('   - To "Decision: APPROVED"\n');

console.log('5. Observe the multi-agent collaboration!\n');

console.log('━'.repeat(60));
console.log('\n📁 Files to monitor:\n');
console.log('- agents/*.agent.md          → Agent chat logs');
console.log('- tasks/*.task.md            → Task tracking');
console.log('- approvals/pending/*.md     → Actions awaiting approval');
console.log('- approvals/approved/*.md    → Approved actions (archived)');
console.log('- inbox/slack-messages.jsonl → Incoming messages');
console.log('- inbox/slack-outbox.jsonl   → Outgoing messages\n');

console.log('✅ Demo scenario initialized!\n');
