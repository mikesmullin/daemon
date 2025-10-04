import { createOpenAI } from '@ai-sdk/openai';
import { streamText } from 'ai';
import { getSession } from '../lib/session.js';
import { z } from 'zod';

/**
 * Version G: Try using @ai-sdk/openai instead of openai-compatible
 */

async function testWithOpenAIProvider() {
  console.log('\n🔧 VERSION G: Using @ai-sdk/openai Provider\n');
  console.log('━'.repeat(60));

  const session = await getSession();

  // Use the openai provider directly
  const provider = createOpenAI({
    apiKey: session.tokens.copilot_token,
    baseURL: session.tokens.api_url,
    headers: {
      'Editor-Version': 'vscode/1.99.3',
      'Editor-Plugin-Version': 'copilot-chat/0.26.7',
      'User-Agent': 'GitHubCopilotChat/0.26.7',
    },
  });

  const executeCommandTool = {
    description: 'Execute a shell command and return its output',
    parameters: z.object({
      command: z.string().describe('The shell command to execute (e.g. "node --version")'),
    }),
    execute: async (args) => {
      console.log(`\n   🔧 Tool called with args:`, JSON.stringify(args, null, 2));

      const command = args.command || 'node --version';
      console.log(`   📝 Command: ${command}`);

      const { exec } = await import('child_process');
      const { promisify } = await import('util');
      const execAsync = promisify(exec);

      try {
        const { stdout } = await execAsync(command);
        const output = stdout.trim();
        console.log(`   ✅ Output: ${output}`);
        return { success: true, output };
      } catch (error) {
        console.log(`   ❌ Error: ${error.message}`);
        return { success: false, error: error.message };
      }
    }
  };

  console.log('📤 Using @ai-sdk/openai provider...\n');

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
    if (error.cause) {
      console.log(`Cause:`, error.cause);
    }
    console.log(error.stack);
  }

  console.log('\n✅ Test completed!');
}

testWithOpenAIProvider().catch(console.error);
