import { readFileSync } from 'fs';
import { join } from 'path';
import yaml from 'js-yaml';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { generateText } from 'ai';

/**
 * Example 1: Conversation Context (Multi-turn conversation)
 * 
 * This demonstrates how to maintain conversation context across multiple messages.
 * The AI SDK's generateText() supports a 'messages' parameter instead of 'prompt'.
 * 
 * Key Points:
 * - Use 'messages' array instead of 'prompt' for multi-turn conversations
 * - Each message has a 'role' and 'content'
 * - The model can reference previous messages in the conversation
 */

// Load tokens
function loadTokens() {
  const TOKENS_FILE = join(process.cwd(), '.tokens.yaml');
  const content = readFileSync(TOKENS_FILE, 'utf8');
  return yaml.load(content) || {};
}

async function testConversationContext() {
  console.log('\n📚 Testing Conversation Context\n');
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

  // Build a conversation with context
  const messages = [
    {
      role: 'user',
      content: 'My favorite color is blue.'
    },
    {
      role: 'assistant',
      content: 'That\'s nice! Blue is a calming and popular color.'
    },
    {
      role: 'user',
      content: 'My favorite number is 42.'
    },
    {
      role: 'assistant',
      content: 'Ah, the answer to life, the universe, and everything! Great choice.'
    },
    {
      role: 'user',
      content: 'What were my favorite color and number? Answer in one sentence.'
    }
  ];

  console.log('📝 Conversation history:');
  messages.forEach((msg, i) => {
    console.log(`${i + 1}. [${msg.role}]: ${msg.content}`);
  });

  console.log('\n🤖 Calling Copilot with conversation context...\n');

  try {
    const result = await generateText({
      model: provider('gpt-4o'),
      messages: messages, // Use 'messages' instead of 'prompt'
      maxTokens: 200,
    });

    console.log('━'.repeat(60));
    console.log('✅ Response with context:\n');
    console.log(result.text);
    console.log('━'.repeat(60));

    console.log('\n💡 The model remembered both pieces of information!');
    console.log('   This proves that conversation context is maintained.');

  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

testConversationContext();
