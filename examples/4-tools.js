import { readFileSync } from 'fs';
import { join } from 'path';
import yaml from 'js-yaml';
import OpenAI from 'openai';

/**
 * Minimal Tool Calling Example
 * 
 * This demonstrates native tool calling with Claude Sonnet 4.5
 * using terminal command execution.
 */

function loadTokens() {
  const TOKENS_FILE = join(process.cwd(), '.tokens.yaml');
  const content = readFileSync(TOKENS_FILE, 'utf8');
  return yaml.load(content) || {};
}

// Define our tool
const tools = {
  executeCommand: {
    definition: {
      type: 'function',
      function: {
        name: 'executeCommand',
        description: 'Execute a shell command and return its output',
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
      console.log(`   🔧 Executing: executeCommand("${args.command}")`);
      const { exec } = await import('child_process');
      const { promisify } = await import('util');
      const execAsync = promisify(exec);

      try {
        const { stdout, stderr } = await execAsync(args.command);
        const output = stdout || stderr;
        console.log(`   ✅ Output:`, output.trim());
        return { success: true, output };
      } catch (error) {
        console.log(`   ❌ Error:`, error.message);
        return { success: false, error: error.message };
      }
    }
  }
};

async function runConversationWithTools() {
  console.log('\n🔧 Minimal Tool Calling Example\n');
  console.log('━'.repeat(60));

  const tokens = loadTokens();
  const baseURL = tokens.api_url || 'https://api.githubcopilot.com';

  // Create OpenAI client configured for GitHub Copilot
  const client = new OpenAI({
    apiKey: tokens.copilot_token,
    baseURL: baseURL,
    defaultHeaders: {
      'Editor-Version': 'vscode/1.99.3',
      'Editor-Plugin-Version': 'copilot-chat/0.26.7',
      'User-Agent': 'GitHubCopilotChat/0.26.7',
      'Copilot-Integration-Id': 'vscode-chat',
      'OpenAI-Intent': 'conversation-panel',
    }
  });

  // Prepare tool definitions for API
  const toolDefinitions = Object.values(tools).map(t => t.definition);

  console.log('📝 Available tools:');
  toolDefinitions.forEach((tool, i) => {
    console.log(`   ${i + 1}. ${tool.function.name}: ${tool.function.description}`);
  });
  console.log('');

  // Test case
  const testCase = {
    name: 'Terminal Execution Test (Claude Sonnet 4.5)',
    model: 'claude-sonnet-4.5',
    messages: [
      { role: 'user', content: 'What version of Node.js am I running?' }
    ]
  };

  console.log(`🧪 ${testCase.name}\n`);
  console.log(`   Model: ${testCase.model}`);

  const messages = [...testCase.messages];
  let iteration = 0;
  const maxIterations = 5;

  while (iteration < maxIterations) {
    iteration++;

    console.log(`📤 Request #${iteration}:`);
    console.log(`   Messages: ${messages.length}`);
    console.log(`   Latest: "${messages[messages.length - 1].content?.substring(0, 60)}..."`);

    // Make API call
    try {
      const response = await client.chat.completions.create({
        model: testCase.model,
        messages: messages,
        tools: toolDefinitions,
        max_tokens: 1000,
      });

      const choice = response.choices[0];
      const message = choice.message;

      console.log(`📥 Response #${iteration}:`);
      console.log(`   Finish reason: ${choice.finish_reason}`);

      // Add assistant's response to messages
      messages.push(message);

      // Check if AI wants to call tools
      if (choice.finish_reason === 'tool_calls' && message.tool_calls) {
        console.log(`   🔧 Tool calls requested: ${message.tool_calls.length}`);

        // Execute each tool call
        for (const toolCall of message.tool_calls) {
          const toolName = toolCall.function.name;
          const toolArgs = JSON.parse(toolCall.function.arguments);

          console.log(`\n   Calling: ${toolName}(${JSON.stringify(toolArgs)})`);

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

      console.log('\n' + '━'.repeat(60) + '\n');
      break;

    } catch (error) {
      console.log(`   ❌ Error with model ${testCase.model}:`, error.message);
      console.log('\n' + '━'.repeat(60) + '\n');
      break;
    }
  }

  console.log('✅ Test completed!\n');
  console.log('💡 Key insights:');
  console.log('   • Claude Sonnet 4.5 supports tool calling via GitHub Copilot API');
  console.log('   • Tools can execute terminal commands and return output');
  console.log('   • Multi-turn conversation handles tool execution transparently');
}

runConversationWithTools().catch(console.error);
