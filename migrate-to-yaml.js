#!/usr/bin/env node
/**
 * migrate-to-yaml.js
 * 
 * Migrates existing *.agent.md files to new YAML structure:
 * - Creates agent templates in templates/
 * - Creates session instances in sessions/
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from 'fs';
import { join } from 'path';
import { parseAgentFile } from './lib/agent-parser.js';
import {
  createAgentTemplate,
  saveAgentTemplate,
  saveSession,
  ensureAgentDirs
} from './lib/agent-parser-yaml.js';

const AGENTS_DIR = 'agents';
const TEMPLATES_DIR = 'templates';
const SESSIONS_DIR = 'sessions';

console.log('🔄 Migrating agents from Markdown to YAML...\n');
console.log('━'.repeat(60));

// Ensure directories exist
ensureAgentDirs();

if (!existsSync(AGENTS_DIR)) {
  console.log('❌ No agents/ directory found. Nothing to migrate.');
  process.exit(0);
}

const agentFiles = readdirSync(AGENTS_DIR).filter(f => f.endsWith('.agent.md'));

if (agentFiles.length === 0) {
  console.log('❌ No *.agent.md files found in agents/ directory.');
  process.exit(0);
}

console.log(`Found ${agentFiles.length} agent file(s) to migrate:\n`);

let templatesCreated = 0;
let sessionsCreated = 0;

for (const file of agentFiles) {
  const filePath = join(AGENTS_DIR, file);
  console.log(`Processing: ${file}`);

  try {
    // Parse the old format
    const agent = parseAgentFile(filePath);

    // Extract agent ID
    const agentId = agent.id;

    // Create agent template
    const template = {
      id: agentId,
      type: agent.type,
      model: agent.metadata.model || 'claude-sonnet-4.5',
      systemPrompt: agent.systemPrompt,
      capabilities: agent.metadata.capabilities ? agent.metadata.capabilities.split(',').map(c => c.trim()) : [],
      metadata: {}
    };

    // Copy relevant metadata
    for (const [key, value] of Object.entries(agent.metadata)) {
      if (key !== 'type' && key !== 'model' && key !== 'capabilities') {
        template.metadata[key] = value;
      }
    }

    const templatePath = join(TEMPLATES_DIR, `${agentId}.agent.yaml`);
    saveAgentTemplate(templatePath, template);
    console.log(`  ✓ Created template: ${templatePath}`);
    templatesCreated++;

    // Create session if there are messages
    if (agent.messages.length > 0) {
      const sessionId = `${agentId}-migrated-${Date.now()}`;
      const session = {
        sessionId,
        agentId: agentId,
        agentType: agent.type,
        model: template.model,
        systemPrompt: agent.systemPrompt,
        created: agent.created || new Date(),
        updated: new Date(),
        status: 'active',
        messages: agent.messages.map(msg => ({
          timestamp: msg.timestamp,
          role: msg.role,
          content: msg.content,
          toolCalls: null,
          toolCallId: null
        })),
        metadata: {}
      };

      const sessionPath = join(SESSIONS_DIR, `${sessionId}.session.yaml`);
      saveSession(sessionPath, session);
      console.log(`  ✓ Created session: ${sessionPath}`);
      console.log(`    (${agent.messages.length} messages migrated)`);
      sessionsCreated++;
    } else {
      console.log(`  ℹ No messages to migrate (no session created)`);
    }

    console.log('');

  } catch (error) {
    console.error(`  ❌ Error migrating ${file}:`, error.message);
    console.log('');
  }
}

console.log('━'.repeat(60));
console.log('\n📊 Migration Summary:');
console.log(`  Templates created: ${templatesCreated}`);
console.log(`  Sessions created:  ${sessionsCreated}`);
console.log('\n✅ Migration complete!\n');
console.log('Next steps:');
console.log('  1. Review templates/ and sessions/ directories');
console.log('  2. Test with: node daemon-yaml.js --pump');
console.log('  3. If successful, backup and remove old agents/ directory\n');
