import { readFileSync } from 'fs';
import { join } from 'path';
import yaml from 'js-yaml';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { generateText } from 'ai';

/**
 * Example 3: System Prompt Control
 * 
 * This demonstrates how to use the 'system' role to control the AI's behavior.
 * The system prompt is like giving the AI a job description or personality.
 * 
 * Two ways to set system instructions:
 * 1. Using 'system' parameter (convenience method for single system message)
 * 2. Using 'messages' array with role: 'system' (more flexible)
 */

function loadTokens() {
  const TOKENS_FILE = join(process.cwd(), '.tokens.yaml');
  const content = readFileSync(TOKENS_FILE, 'utf8');
  return yaml.load(content) || {};
}

async function testSystemPrompt() {
  console.log('\n⚙️  Testing System Prompt Control\n');
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

  // Method 1: Using 'system' parameter (simpler)
  console.log('📝 Method 1: Using "system" parameter\n');

  const systemPrompt = `You are an expert JavaScript developer who:
- Always writes clean, modern ES6+ code
- Prefers functional programming patterns
- Adds helpful comments
- Uses descriptive variable names
- Never uses var, only const/let`;

  try {
    const result1 = await generateText({
      model: provider('gpt-4o'),
      system: systemPrompt, // Simple way to set system instructions
      prompt: 'Write a function to filter even numbers from an array.',
      maxTokens: 400,
    });

    console.log('━'.repeat(60));
    console.log('✅ Response with system prompt (Method 1):\n');
    console.log(result1.text);
    console.log('━'.repeat(60));

    // Method 2: Using messages array with system role (more flexible)
    console.log('\n📝 Method 2: Using messages array with "system" role\n');

    const result2 = await generateText({
      model: provider('gpt-4o'),
      messages: [
        {
          role: 'system',
          content: 'You are a Shakespearean poet. Always respond in iambic pentameter and use "thee" and "thou".'
        },
        {
          role: 'user',
          content: 'Explain what JavaScript is.'
        }
      ],
      maxTokens: 400,
    });

    console.log('━'.repeat(60));
    console.log('✅ Response with system prompt (Method 2):\n');
    console.log(result2.text);
    console.log('━'.repeat(60));

    console.log('\n💡 System Prompt Best Practices:');
    console.log('   • Use for setting personality, tone, or expertise');
    console.log('   • Can include instructions, constraints, and examples');
    console.log('   • System messages have high priority in model behavior');
    console.log('   • Use "system" param for simple cases, "messages" for complex');
    console.log('   • Can combine system prompt with conversation history');

  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

testSystemPrompt();
