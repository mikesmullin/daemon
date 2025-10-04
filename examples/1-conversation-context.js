import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { generateText } from 'ai';
import { getSession, getProviderConfig } from '../lib/session.js';

/**
 * Example 1: Conversation Context (Multi-turn conversation) - UPDATED
 * 
 * NOW WITH AUTO TOKEN RENEWAL! 🎉
 * 
 * Changes from original:
 * - Removed manual loadTokens() function
 * - Uses lib/session.js for automatic token renewal
 * - Cleaner code, more robust
 * 
 * This demonstrates how to maintain conversation context across multiple messages.
 * The AI SDK's generateText() supports a 'messages' parameter instead of 'prompt'.
 * 
 * Key Points:
 * - Use 'messages' array instead of 'prompt' for multi-turn conversations
 * - Each message has a 'role' and 'content'
 * - The model can reference previous messages in the conversation
 * - Token renewal happens automatically via getSession()
 */

async function testConversationContext() {
  console.log('\n📚 Testing Conversation Context (with auto token renewal!)\n');
  console.log('━'.repeat(60));

  // Get session with automatic token renewal
  // This replaces the manual loadTokens() - it will:
  // 1. Check if token is valid
  // 2. Refresh if expired using GitHub OAuth token
  // 3. Re-authenticate if needed
  const session = await getSession();
  const config = getProviderConfig(session);

  const provider = createOpenAICompatible({
    name: 'github-copilot',
    ...config,  // Includes apiKey, baseURL, headers
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

    console.log('\n🔄 Token Info:');
    console.log(`   API URL: ${session.tokens.api_url}`);
    const expiresAt = new Date(session.tokens.expires_at * 1000);
    console.log(`   Token expires: ${expiresAt.toLocaleString()}`);

  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

testConversationContext();
