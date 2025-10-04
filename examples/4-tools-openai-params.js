import OpenAI from 'openai';
import { getSession, getOpenAIConfig } from '../lib/session.js';

/**
 * OpenAI SDK - Debug what parameters it receives
 */

async function debugOpenAIParams() {
  console.log('\n🔧 OpenAI SDK: Debug Parameters\n');
  console.log('━'.repeat(60));

  const session = await getSession();
  const config = getOpenAIConfig(session);

  const client = new OpenAI(config);

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
        console.log(`\n   🔧 Tool execute() called!`);
        console.log(`   Args type: ${typeof args}`);
        console.log(`   Args:`, JSON.stringify(args, null, 2));
        console.log(`   Args keys:`, Object.keys(args || {}));
        console.log(`   args.command: ${args.command}`);

        return { success: true, output: 'v22.20.0' };
      }
    }
  };

  const toolDefinitions = Object.values(tools).map(t => t.definition);

  console.log('📝 Tool definition being sent:');
  console.log(JSON.stringify(toolDefinitions, null, 2));
  console.log('');

  const messages = [
    { role: 'user', content: 'Run the command "node --version" using the executeCommand tool.' }
  ];

  try {
    console.log('📤 Making API call...\n');

    const response = await client.chat.completions.create({
      model: 'claude-sonnet-4.5',
      messages: messages,
      tools: toolDefinitions,
      max_tokens: 1000,
    });

    const choice = response.choices[0];
    const message = choice.message;

    console.log(`📥 Response:`);
    console.log(`   Finish reason: ${choice.finish_reason}`);

    if (choice.finish_reason === 'tool_calls' && message.tool_calls) {
      console.log(`   Tool calls: ${message.tool_calls.length}\n`);

      for (const toolCall of message.tool_calls) {
        console.log(`   Tool Call:`);
        console.log(`     ID: ${toolCall.id}`);
        console.log(`     Name: ${toolCall.function.name}`);
        console.log(`     Arguments (raw): ${toolCall.function.arguments}`);

        const args = JSON.parse(toolCall.function.arguments);
        console.log(`     Arguments (parsed):`, JSON.stringify(args, null, 2));
        console.log(`     Arguments type: ${typeof args}`);
        console.log(`     Arguments keys:`, Object.keys(args));

        // Execute
        const tool = tools[toolCall.function.name];
        if (tool) {
          await tool.execute(args);
        }
      }
    }

    console.log('\n' + '━'.repeat(60));

  } catch (error) {
    console.log(`\n❌ Error: ${error.message}`);
  }

  console.log('\n✅ Test completed!');
}

debugOpenAIParams().catch(console.error);
