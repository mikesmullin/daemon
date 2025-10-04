import { readFileSync } from 'fs';
import { join } from 'path';
import yaml from 'js-yaml';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { generateText } from 'ai';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * Example 4: Tool/Function Calling (Simplified)
 * 
 * NOTE: GitHub Copilot API through openai-compatible may have limitations
 * with tool calling. This example shows the expected pattern, but may not
 * work with all models/providers.
 * 
 * This demonstrates the CONCEPT of tool calling:
 * - How to define tools
 * - How to handle tool requests
 * - How to execute tools manually
 */

function loadTokens() {
  const TOKENS_FILE = join(process.cwd(), '.tokens.yaml');
  const content = readFileSync(TOKENS_FILE, 'utf8');
  return yaml.load(content) || {};
}

async function testToolConcept() {
  console.log('\n🔧 Understanding Tool/Function Calling Concepts\n');
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

  console.log('💡 Tool Calling Theory:\n');
  console.log('1️⃣  Define tools with JSON Schema:');
  console.log(`
  const tools = {
    myTool: {
      description: 'What this tool does',
      parameters: {
        type: 'object',
        properties: {
          param1: { type: 'string', description: '...' }
        },
        required: ['param1']
      }
    }
  };
  `);

  console.log('2️⃣  AI analyzes user request and decides if it needs tools');
  console.log('3️⃣  AI generates tool calls with arguments');
  console.log('4️⃣  Your code executes the tool');
  console.log('5️⃣  You send tool results back to AI');
  console.log('6️⃣  AI uses results to formulate final answer');

  console.log('\n━'.repeat(60));
  console.log('🧪 Testing with system prompt simulation:\n');

  // Simulate what would happen with tool calling
  // Since GitHub Copilot API may not support tools directly,
  // we'll demonstrate the manual approach

  const systemPrompt = `You are an AI assistant with access to these tools:

1. getCurrentWeather(location: string, unit?: 'celsius' | 'fahrenheit')
   - Returns current weather for a location
   
2. calculator(expression: string)
   - Evaluates a mathematical expression
   
3. executeCommand(command: string)
   - Executes a shell command and returns output

When a user asks something that requires a tool, respond in this format:
TOOL_CALL: toolName(arg1, arg2, ...)

Then I will execute it and give you the result.`;

  try {
    const result1 = await generateText({
      model: provider('gpt-4o'),
      system: systemPrompt,
      prompt: 'What is 156 multiplied by 23, plus 47? Use the calculator tool.',
      maxTokens: 300,
    });

    console.log('✅ AI Response:\n');
    console.log(result1.text);
    console.log('\n━'.repeat(60));

    // Parse the response to see if it's trying to call a tool
    if (result1.text.includes('TOOL_CALL:')) {
      console.log('\n✅ The AI requested a tool call!');
      console.log('   In a full implementation, you would:');
      console.log('   1. Parse the tool call request');
      console.log('   2. Execute the tool with provided arguments');
      console.log('   3. Send results back in a new message');
      console.log('   4. AI uses results to answer the original question');
    }

    // Demonstrate manual calculation
    console.log('\n🔢 Manual tool execution example:');
    const expression = '156 * 23 + 47';
    const calculatedResult = eval(expression);
    console.log(`   Expression: ${expression}`);
    console.log(`   Result: ${calculatedResult}`);

    // Send result back to AI
    console.log('\n📤 Sending tool result back to AI...\n');

    const result2 = await generateText({
      model: provider('gpt-4o'),
      messages: [
        {
          role: 'system',
          content: systemPrompt
        },
        {
          role: 'user',
          content: 'What is 156 multiplied by 23, plus 47? Use the calculator tool.'
        },
        {
          role: 'assistant',
          content: result1.text
        },
        {
          role: 'user',
          content: `TOOL_RESULT: calculator(${expression}) = ${calculatedResult}`
        }
      ],
      maxTokens: 200,
    });

    console.log('✅ Final AI Response with tool result:\n');
    console.log(result2.text);

    console.log('\n━'.repeat(60));
    console.log('\n💡 Key Takeaways about Tools:');
    console.log('   • Modern AI APIs support structured function/tool calling');
    console.log('   • Tools are defined with JSON Schema (or Zod schemas)');
    console.log('   • AI decides when to call tools based on user query');
    console.log('   • You execute tools and return results to AI');
    console.log('   • AI uses results to formulate final answer');
    console.log('   • Can be automatic (maxToolRoundtrips) or manual');
    console.log('   ⚠️  GitHub Copilot API may have limitations vs OpenAI API');
    console.log('   💡 For production: Use native OpenAI SDK or check provider docs');

  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.cause) console.error('Cause:', error.cause);
  }
}

testToolConcept();
