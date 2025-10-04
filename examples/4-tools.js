import { readFileSync } from 'fs';
import { join } from 'path';
import yaml from 'js-yaml';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { generateText, tool } from 'ai';
import { exec } from 'child_process';
import { promisify } from 'util';
import { z } from 'zod';

const execAsync = promisify(exec);

/**
 * Example 4: Tool/Function Calling
 * 
 * This demonstrates how to give the AI access to tools/functions it can execute.
 * The AI SDK supports OpenAI's function calling / tool use pattern.
 * 
 * How it works:
 * 1. Define tools with JSON schemas describing their parameters
 * 2. Pass tools to generateText()
 * 3. AI decides when to call tools and with what arguments
 * 4. You execute the tool and return results
 * 5. AI uses the results to formulate final response
 * 
 * The AI SDK can automatically execute tools for you with 'toolChoice' and
 * 'maxToolRoundtrips' settings.
 */

function loadTokens() {
  const TOKENS_FILE = join(process.cwd(), '.tokens.yaml');
  const content = readFileSync(TOKENS_FILE, 'utf8');
  return yaml.load(content) || {};
}

// Define tool functions that the AI can call
// Using the AI SDK's tool() helper for proper schema formatting
const tools = {
  getCurrentWeather: tool({
    description: 'Get the current weather in a given location',
    parameters: z.object({
      location: z.string().describe('The city and state, e.g. San Francisco, CA'),
      unit: z.enum(['celsius', 'fahrenheit']).optional().describe('The temperature unit to use'),
    }),
    execute: async ({ location, unit = 'fahrenheit' }) => {
      // Mock implementation - in reality, you'd call a weather API
      console.log(`   🔧 Executing: getCurrentWeather(${location}, ${unit})`);
      return {
        location,
        temperature: 72,
        unit,
        condition: 'sunny',
      };
    },
  }),

  executeCommand: tool({
    description: 'Execute a shell command and return its output',
    parameters: z.object({
      command: z.string().describe('The shell command to execute'),
    }),
    execute: async ({ command }) => {
      console.log(`   🔧 Executing command: ${command}`);
      try {
        const { stdout, stderr } = await execAsync(command);
        return { success: true, output: stdout || stderr };
      } catch (error) {
        return { success: false, error: error.message };
      }
    },
  }),

  calculator: tool({
    description: 'Perform a mathematical calculation',
    parameters: z.object({
      expression: z.string().describe('The mathematical expression to evaluate, e.g. "2 + 2"'),
    }),
    execute: async ({ expression }) => {
      console.log(`   🔧 Calculating: ${expression}`);
      try {
        // WARNING: eval is dangerous in production! This is just for demo.
        // Use a proper math parser like math.js in real applications
        const result = eval(expression);
        return { result };
      } catch (error) {
        return { error: error.message };
      }
    },
  }),
}; async function testTools() {
  console.log('\n🔧 Testing Tool/Function Calling\n');
  console.log('━'.repeat(60));

  const tokens = loadTokens();
  let baseURL = tokens.api_url || 'https://api.githubcopilot.com';

  const provider = createOpenAICompatible({
    name: 'github-copilot',
    apiKey: tokens.copilot_token,
    baseURL: baseURL,
    headers: {
      'Editor-Version': 'vscode/1.99.3',
      'Editor-Plugin-Version': 'copilot-chat/0.26.7',
      'User-Agent': 'GitHubCopilotChat/0.26.7',
    },
  });

  console.log('📝 Available tools:');
  Object.keys(tools).forEach((toolName, i) => {
    console.log(`   ${i + 1}. ${toolName}: ${tools[toolName].description}`);
  });

  // Test 1: Simple tool use
  console.log('\n🧪 Test 1: Weather query\n');

  try {
    const result1 = await generateText({
      model: provider('claude-sonnet-4'),
      messages: [
        {
          role: 'user',
          content: 'What\'s the weather like in San Francisco?'
        }
      ],
      tools: {
        getCurrentWeather: tools.getCurrentWeather,
      },
      maxToolRoundtrips: 2, // Allow AI to call tools and use results
    });

    console.log('━'.repeat(60));
    console.log('✅ Response:\n');
    console.log(result1.text);
    console.log('\n📊 Tool calls made:');
    console.log(JSON.stringify(result1.toolCalls, null, 2));
    console.log('━'.repeat(60));

    // Test 2: Calculator tool
    console.log('\n🧪 Test 2: Math calculation\n');

    const result2 = await generateText({
      model: provider('claude-sonnet-4'),
      messages: [
        {
          role: 'user',
          content: 'What is 156 * 23 + 47?'
        }
      ],
      tools: {
        calculator: tools.calculator,
      },
      maxToolRoundtrips: 2,
    });

    console.log('━'.repeat(60));
    console.log('✅ Response:\n');
    console.log(result2.text);
    console.log('━'.repeat(60));

    // Test 3: Command execution (be careful!)
    console.log('\n🧪 Test 3: Terminal command execution\n');

    const result3 = await generateText({
      model: provider('claude-sonnet-4'),
      messages: [
        {
          role: 'user',
          content: 'What Node.js version am I running? Use the executeCommand tool.'
        }
      ],
      tools: {
        executeCommand: tools.executeCommand,
      },
      maxToolRoundtrips: 2,
    });

    console.log('━'.repeat(60));
    console.log('✅ Response:\n');
    console.log(result3.text);
    console.log('━'.repeat(60));

    console.log('\n💡 Key insights about tools:');
    console.log('   • Tools are defined with JSON Schema for parameters');
    console.log('   • AI decides when and how to call tools based on user query');
    console.log('   • You provide tool definitions and execution functions');
    console.log('   • AI SDK can auto-execute tools with maxToolRoundtrips');
    console.log('   • Tools enable AI to interact with external systems');
    console.log('   • Perfect for: API calls, calculations, file operations, commands');
    console.log('   ⚠️  Always validate and sanitize tool inputs for security!');

  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.cause) console.error('Cause:', error.cause);
  }
}

testTools();
