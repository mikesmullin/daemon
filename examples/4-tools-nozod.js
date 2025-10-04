import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { streamText } from 'ai';
import { getSession, getProviderConfig } from '../lib/session.js';
import { z } from 'zod';

/**
 * Version E: Try without zod, use plain JSON schema
 */

async function testWithoutZod() {
  console.log('\n🔧 VERSION E: Without Zod (Plain JSON Schema)\n');
  console.log('━'.repeat(60));

  const session = await getSession();
  const config = getProviderConfig(session);

  const provider = createOpenAICompatible({
    name: 'github-copilot',
    ...config,
  });

  // Try using plain object instead of zod
  const executeCommandTool = {
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
    },
    execute: async (args) => {
      console.log(`\n   🔧 Tool execute() called!`);
      console.log(`   Args:`, JSON.stringify(args, null, 2));

      const command = args.command || 'node --version';
      console.log(`   Using command: ${command}`);

      const { exec } = await import('child_process');
      const { promisify } = await import('util');
      const execAsync = promisify(exec);

      try {
        const { stdout, stderr } = await execAsync(command);
        const output = (stdout || stderr).trim();
        console.log(`   ✅ Output: ${output}`);
        return { success: true, output };
      } catch (error) {
        console.log(`   ❌ Error: ${error.message}`);
        return { success: false, error: error.message };
      }
    }
  };

  console.log('📤 Testing with plain JSON schema (no zod)...\n');

  try {
    const result = await streamText({
      model: provider('claude-sonnet-4.5'),
      messages: [
        {
          role: 'user',
          content: 'Run the command "node --version" using the executeCommand tool and tell me the result.'
        }
      ],
      tools: {
        executeCommand: executeCommandTool,
      },
      maxSteps: 5,
    });

    console.log('📥 Collecting stream...\n');

    let fullText = '';
    for await (const chunk of result.textStream) {
      fullText += chunk;
      process.stdout.write(chunk);
    }

    console.log('\n\n' + '━'.repeat(60));
    console.log('✅ Final text:', fullText);
    console.log('━'.repeat(60));

  } catch (error) {
    console.log(`\n❌ Error: ${error.message}`);
    console.log(error.stack);
  }

  console.log('\n✅ Test completed!');
}

testWithoutZod().catch(console.error);
