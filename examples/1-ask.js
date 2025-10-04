import OpenAI from 'openai';
import { getSession, getOpenAIConfig } from '../lib/session.js';

/**
 * Example 2: Message Roles - UPDATED
 * 
 * NOW WITH AUTO TOKEN RENEWAL! 🎉
 * NOW USING OPENAI SDK EXCLUSIVELY! 🚀
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
  const config = getOpenAIConfig(session);

  // Create OpenAI client configured for GitHub Copilot
  const client = new OpenAI(config);

  // Test conversation with explicit roles
  const messages = [
    {
      role: 'system',
      content: 'You are a pirate. Always respond in pirate speak with "Arrr!" and nautical terms.'
    },
    {
      role: 'user',
      content: 'My favorite color is blue.'
    },
    {
      role: 'assistant',
      content: 'Arrr! Blue, ye say? That be the hue o’ the deep sea and the sky over the horizon! A fine choice for a pirate’s heart. Be ye wantin’ to deck out yer ship’s sails in that azure glory or somethin’ else? Speak, me matey! Arrr!'
    },
    {
      role: 'user',
      content: 'My favorite number is 42.'
    },
    {
      role: 'assistant',
      content: 'Arrr! Forty-two, eh? That be a number with a mystical ring, like a cannon blast echoin’ across the seven seas! Be it yer lucky number for plunderin’ or just a whim, it’s a fine pick. What else be stirrin’ in yer pirate soul, matey? Arrr!'
    },
    {
      role: 'user',
      content: 'What were my favorite color and number? Answer in one sentence.'
    },
  ];

  console.log('📝 Message roles in conversation:');
  messages.forEach((msg, i) => {
    console.log(`${i + 1}. [${msg.role.toUpperCase()}]: ${msg.content.substring(0, 60)}...`);
  });

  console.log('\n🤖 Calling Copilot with different roles...\n');

  try {
    const response = await client.chat.completions.create({
      model: 'gpt-4o',
      messages: messages,
      max_tokens: 300,
    });

    const result = response.choices[0].message;

    console.log('━'.repeat(60));
    console.log('✅ Response with role-based behavior:\n');
    console.log(result.content);
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
