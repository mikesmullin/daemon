/**
 * Enhanced Tool Calling Example with Security Allowlist
 * 
 * This demonstrates terminal command execution with security controls
 * using the command allowlist checker.
 */

import OpenAI from 'openai';
import { getSession, getOpenAIConfig } from '../lib/session.js';
import { executeCommandWithCheck, checkCommand, loadAllowlist } from '../lib/terminal-allowlist.js';

const tools = {
  executeCommand: {
    definition: {
      type: 'function',
      function: {
        name: 'executeCommand',
        description: 'Execute a shell command and return its output. Commands are checked against a security allowlist.',
        parameters: {
          type: 'object',
          properties: {
            command: {
              type: 'string',
              description: 'The shell command to execute (e.g. "node --version")'
            }
          },
          required: ['command']
        }
      }
    },
    execute: async (args) => {
      // Use the allowlist-checked execution
      return await executeCommandWithCheck(args.command, {
        autoApprove: false // Set to true to bypass allowlist
      });
    }
  }
};

async function runConversationWithTools() {
  console.log('\n🔧 Enhanced Tool Calling with Security Allowlist\n');
  console.log('━'.repeat(60));

  // Load and display allowlist info
  const allowlist = loadAllowlist();
  const allowCount = Object.values(allowlist).filter(v => v === true).length;
  const denyCount = Object.values(allowlist).filter(v => v === false).length;
  console.log(`🔒 Security allowlist loaded: ${allowCount} approved, ${denyCount} denied patterns\n`);

  // Get session with automatic token renewal
  const session = await getSession();
  const config = getOpenAIConfig(session);

  // Create OpenAI client configured for GitHub Copilot
  const client = new OpenAI(config);

  // Prepare tool definitions for API
  const toolDefinitions = Object.values(tools).map(t => t.definition);

  console.log('📝 Available tools:');
  toolDefinitions.forEach((tool, i) => {
    console.log(`   ${i + 1}. ${tool.function.name}: ${tool.function.description}`);
  });
  console.log('');

  // Test cases demonstrating security features
  const testCases = [
    {
      name: 'Safe command (should auto-approve)',
      model: 'claude-sonnet-4.5',
      messages: [
        { role: 'user', content: 'What version of Node.js am I running?' }
      ]
    },
    {
      name: 'List files (should auto-approve)',
      model: 'claude-sonnet-4.5',
      messages: [
        { role: 'user', content: 'List the files in the current directory' }
      ]
    },
    // Uncomment to test denied command
    // {
    //   name: 'Dangerous command (should require approval)',
    //   model: 'claude-sonnet-4.5',
    //   messages: [
    //     { role: 'user', content: 'Delete all .txt files' }
    //   ]
    // }
  ];

  for (const testCase of testCases) {
    console.log(`\n🧪 ${testCase.name}\n`);
    console.log(`   Model: ${testCase.model}`);

    const messages = [...testCase.messages];
    let iteration = 0;
    const maxIterations = 5;

    while (iteration < maxIterations) {
      iteration++;

      console.log(`\n📤 Request #${iteration}:`);
      console.log(`   Messages: ${messages.length}`);
      console.log(`   Latest: "${messages[messages.length - 1].content?.substring(0, 60)}..."`);

      // Make API call
      try {
        const response = await client.chat.completions.create({
          model: testCase.model,
          messages: messages,
          tools: toolDefinitions,
        });

        const choice = response.choices[0];
        const message = choice.message;

        console.log(`\n📥 Response #${iteration}:`);
        console.log(`   Finish reason: ${choice.finish_reason}`);

        // Add assistant's response to messages
        messages.push(message);

        // Check if AI wants to call tools
        if (choice.finish_reason === 'tool_calls' && message.tool_calls) {
          console.log(`   🔧 Tool calls requested: ${message.tool_calls.length}\n`);

          // Execute each tool call
          for (const toolCall of message.tool_calls) {
            const toolName = toolCall.function.name;
            const toolArgs = JSON.parse(toolCall.function.arguments);

            console.log(`   Calling: ${toolName}(${JSON.stringify(toolArgs)})`);

            // Find and execute the tool
            const tool = tools[toolName];
            if (tool) {
              const result = await tool.execute(toolArgs);

              // Add tool result to messages
              messages.push({
                role: 'tool',
                tool_call_id: toolCall.id,
                content: JSON.stringify(result)
              });
            } else {
              console.log(`   ❌ Unknown tool: ${toolName}`);
              messages.push({
                role: 'tool',
                tool_call_id: toolCall.id,
                content: JSON.stringify({ error: 'Unknown tool' })
              });
            }
          }
          console.log('');
          // Continue loop to get final answer
          continue;
        }

        // AI has provided final answer
        if (message.content) {
          console.log(`   💬 Final answer: ${message.content}`);
        }

        break;

      } catch (error) {
        console.log(`   ❌ Error with model ${testCase.model}:`, error.message);
        break;
      }
    }

    console.log('\n' + '─'.repeat(60));
  }

  console.log('\n✅ All tests completed!\n');

  console.log('💡 Security Features:');
  console.log('   • Commands are checked against allowlist before execution');
  console.log('   • Safe read-only commands are auto-approved');
  console.log('   • Dangerous commands (rm, curl, etc.) require approval');
  console.log('   • Regex patterns allow fine-grained control');
  console.log('   • Configuration stored in storage/terminal-cmd-allowlist.yaml');
}

// Also demonstrate the standalone checking functionality
async function demonstrateAllowlistChecking() {
  console.log('\n📋 Standalone Allowlist Checking Demo\n');
  console.log('━'.repeat(60));

  const testCommands = [
    // Safe commands that should be approved
    'node --version',
    'ls -la',
    'echo hello && pwd',
    'cat package.json | grep name',
    'git status',
    'find . -name "*.js"',
    'wc -l package.json',

    // Benign commands that are blocked by policy (not actually dangerous in these examples)
    'ps aux',  // Just listing processes, but ps is blocked
    'curl https://example.com',  // Just fetching a page, but curl is blocked
    'chmod +r file.txt',  // Just making readable, but chmod is blocked
    'jq .version package.json',  // Just parsing JSON, but jq is blocked
    'echo $(whoami)',  // Just echoing username, but command substitution is blocked
    'grep -P "test" file.txt',  // Just searching, but grep -P flag is blocked
  ];

  console.log('\nTesting commands:\n');

  for (const cmd of testCommands) {
    const result = await checkCommand(cmd);
    const icon = result.approved ? '✅' : '❌';
    console.log(`${icon} "${cmd}"`);
    console.log(`   ${result.reason}`);
    if (result.subCommands.length > 1) {
      console.log(`   Sub-commands: ${result.subCommands.length}`);
      result.details.subCommandChecks.forEach(check => {
        const subIcon = check.approved ? '✅' : check.denied ? '❌' : '⚠️';
        console.log(`      ${subIcon} ${check.command}`);
      });
    }
    console.log('');
  }

  console.log('━'.repeat(60) + '\n');
}

// Run demos
(async () => {
  // First show the allowlist checking
  await demonstrateAllowlistChecking();

  // Then run the agent with tools
  await runConversationWithTools();
})().catch(console.error);
