import { readFileSync } from 'fs';
import { join } from 'path';
import yaml from 'js-yaml';
import OpenAI from 'openai';

/**
 * Example 5: Native Tool Calling with Official OpenAI SDK
 * 
 * This uses the official OpenAI SDK which fully supports function calling
 * with GitHub Copilot API.
 * 
 * Unlike the Vercel AI SDK's openai-compatible provider, this works perfectly!
 */

function loadTokens() {
  const TOKENS_FILE = join(process.cwd(), '.tokens.yaml');
  const content = readFileSync(TOKENS_FILE, 'utf8');
  return yaml.load(content) || {};
}

// Define our tool functions
const tools = {
  calculator: {
    definition: {
      type: 'function',
      function: {
        name: 'calculator',
        description: 'Perform a mathematical calculation',
        parameters: {
          type: 'object',
          properties: {
            expression: {
              type: 'string',
              description: 'The mathematical expression to evaluate, e.g. "2 + 2" or "156 * 23 + 47"'
            }
          },
          required: ['expression']
        }
      }
    },
    execute: (args) => {
      console.log(`   🔧 Executing: calculator("${args.expression}")`);
      try {
        // WARNING: eval is dangerous! Use math.js or similar in production
        const result = eval(args.expression);
        console.log(`   ✅ Result: ${result}`);
        return { result };
      } catch (error) {
        return { error: error.message };
      }
    }
  },
  
  getCurrentWeather: {
    definition: {
      type: 'function',
      function: {
        name: 'getCurrentWeather',
        description: 'Get the current weather in a given location',
        parameters: {
          type: 'object',
          properties: {
            location: {
              type: 'string',
              description: 'The city and state, e.g. San Francisco, CA'
            },
            unit: {
              type: 'string',
              enum: ['celsius', 'fahrenheit'],
              description: 'The temperature unit to use'
            }
          },
          required: ['location']
        }
      }
    },
    execute: (args) => {
      console.log(`   🔧 Executing: getCurrentWeather("${args.location}", "${args.unit || 'fahrenheit'}")`);
      // Mock implementation
      const result = {
        location: args.location,
        temperature: 72,
        unit: args.unit || 'fahrenheit',
        condition: 'sunny'
      };
      console.log(`   ✅ Weather:`, result);
      return result;
    }
  },

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
  console.log('\n🔧 Testing Native Tool Calling with OpenAI SDK\n');
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
      'OpenAI-Intent': 'conversation-panel', // Enable agent mode
    }
  });

  // Prepare tools array for API
  const toolDefinitions = Object.values(tools).map(t => t.definition);

  console.log('📝 Available tools:');
  toolDefinitions.forEach((tool, i) => {
    console.log(`   ${i + 1}. ${tool.function.name}: ${tool.function.description}`);
  });
  console.log('');

  // Test cases
  const testCases = [
    {
      name: 'Calculator Test',
      messages: [
        { role: 'user', content: 'What is 156 multiplied by 23, plus 47?' }
      ]
    },
    {
      name: 'Weather Test',
      messages: [
        { role: 'user', content: 'What\'s the weather like in San Francisco?' }
      ]
    },
    {
      name: 'Command Execution Test',
      messages: [
        { role: 'user', content: 'What version of Node.js am I running? Use the executeCommand tool with "node --version".' }
      ]
    }
  ];

  for (const testCase of testCases) {
    console.log(`🧪 ${testCase.name}\n`);
    
    const messages = [...testCase.messages];
    let iteration = 0;
    const maxIterations = 5;

    while (iteration < maxIterations) {
      iteration++;

      console.log(`📤 Request #${iteration}:`);
      console.log(`   Messages: ${messages.length}`);
      console.log(`   Latest: "${messages[messages.length - 1].content?.substring(0, 60)}..."`);

      // Make API call
      const response = await client.chat.completions.create({
        model: 'gpt-4o',
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
    }
  }

  console.log('✅ All tests completed!\n');
  console.log('💡 Key insights:');
  console.log('   • Official OpenAI SDK supports tool calling natively');
  console.log('   • GitHub Copilot API is fully compatible with OpenAI function calling');
  console.log('   • Tools are automatically invoked when AI determines they\'re needed');
  console.log('   • Multi-turn conversation handles tool execution transparently');
  console.log('   • Works with all GitHub Copilot models (GPT-4o, Claude, etc.)');
}

runConversationWithTools().catch(console.error);
