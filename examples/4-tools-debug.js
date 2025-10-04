import { readFileSync } from 'fs';
import { join } from 'path';
import yaml from 'js-yaml';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { generateText, tool } from 'ai';
import { z } from 'zod';

/**
 * Example 4b: Tool Calling Debug
 * 
 * Let's see what's actually happening with tool calls
 */

function loadTokens() {
  const TOKENS_FILE = join(process.cwd(), '.tokens.yaml');
  const content = readFileSync(TOKENS_FILE, 'utf8');
  return yaml.load(content) || {};
}

async function testToolsDebug() {
  console.log('\n🔍 Debugging Tool/Function Calling\n');
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

  const calculatorTool = tool({
    description: 'Perform a mathematical calculation',
    parameters: z.object({
      expression: z.string().describe('The mathematical expression to evaluate'),
    }),
    execute: async ({ expression }) => {
      console.log(`\n   ✅ TOOL EXECUTED! Expression: ${expression}`);
      const result = eval(expression);
      console.log(`   ✅ Result: ${result}\n`);
      return { result };
    },
  });

  console.log('📝 Tool definition:');
  console.log(JSON.stringify(calculatorTool, null, 2));

  console.log('\n🧪 Testing with claude-sonnet-4...\n');

  try {
    const result = await generateText({
      model: provider('claude-sonnet-4'),
      messages: [
        {
          role: 'user',
          content: 'Calculate 5 + 3 using the calculator tool.'
        }
      ],
      tools: {
        calculator: calculatorTool,
      },
      maxToolRoundtrips: 5,
      onStepFinish: (step) => {
        console.log('\n📊 Step finished:');
        console.log('  - Text:', step.text);
        console.log('  - Tool calls:', JSON.stringify(step.toolCalls, null, 2));
        console.log('  - Tool results:', JSON.stringify(step.toolResults, null, 2));
      }
    });

    console.log('\n━'.repeat(60));
    console.log('✅ Final Response:');
    console.log(result.text);
    console.log('\n📊 Full result object:');
    console.log(JSON.stringify({
      text: result.text,
      toolCalls: result.toolCalls,
      toolResults: result.toolResults,
      finishReason: result.finishReason,
      usage: result.usage,
    }, null, 2));

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error('\nStack:', error.stack);
    if (error.cause) console.error('\nCause:', JSON.stringify(error.cause, null, 2));
  }
}

testToolsDebug();
