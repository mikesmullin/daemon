import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { generateText } from 'ai';
import { getSession, getProviderConfig } from '../lib/session.js';

/**
 * Example 2: Message Roles - UPDATED
 * 
 * NOW WITH AUTO TOKEN RENEWAL! 🎉
 * 
 * This demonstrates the different roles supported in conversations.
 * 
 * Standard Roles (OpenAI API):
 * - 'system': Sets the behavior/personality of the assistant
 * - 'user': Messages from the user
 * - 'assistant': Messages from the AI assistant
 * - 'tool': Results from tool/function calls (advanced)
 * 
 * You CANNOT use arbitrary roles - only these predefined ones work.
 * The 'system' role is particularly important for setting instructions.
 */

async function testRoles() {
  console.log('\n👥 Testing Message Roles (with auto token renewal!)\n');
  console.log('━'.repeat(60));

  // Get session with automatic token renewal
  const session = await getSession();
  const config = getProviderConfig(session);

  const provider = createOpenAICompatible({
    name: 'github-copilot',
    ...config,
  });

  // Test conversation with explicit roles
  const messages = [
    {
      role: 'system',
      content: 'You are a pirate. Always respond in pirate speak with "Arrr!" and nautical terms.'
    },
    {
      role: 'user',
      content: 'What is the capital of France?'
    },
    {
      role: 'assistant',
      content: 'Arrr! The capital of France be Paris, matey! A fine port city on the River Seine!'
    },
    {
      role: 'user',
      content: 'Tell me about its famous landmark.'
    }
  ];

  console.log('📝 Message roles in conversation:');
  messages.forEach((msg, i) => {
    console.log(`${i + 1}. [${msg.role.toUpperCase()}]: ${msg.content.substring(0, 60)}...`);
  });

  console.log('\n🤖 Calling Copilot with different roles...\n');

  try {
    const result = await generateText({
      model: provider('gpt-4o'),
      messages: messages,
      maxTokens: 300,
    });

    console.log('━'.repeat(60));
    console.log('✅ Response with role-based behavior:\n');
    console.log(result.text);
    console.log('━'.repeat(60));

    console.log('\n💡 Key insights about roles:');
    console.log('   • "system" - Sets instructions/personality (highest priority)');
    console.log('   • "user" - Your messages to the AI');
    console.log('   • "assistant" - AI\'s previous responses (for context)');
    console.log('   • "tool" - Results from function/tool execution (advanced)');
    console.log('   ⚠️  You cannot use custom roles - only these 4 are supported!');

  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

testRoles();
