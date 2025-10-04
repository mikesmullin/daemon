import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { streamText } from 'ai';
import { getSession, getProviderConfig } from '../lib/session.js';
import { z } from 'zod';

/**
 * Version F: Try different compatibility modes
 */

async function testCompatibilityModes() {
  console.log('\n🔧 VERSION F: Testing Compatibility Modes\n');
  console.log('━'.repeat(60));

  const session = await getSession();
  const config = getProviderConfig(session);

  const modes = ['strict', 'compatible'];

  for (const mode of modes) {
    console.log(`\n📝 Testing with compatibility: "${mode}"\n`);
    console.log('─'.repeat(60));

    const provider = createOpenAICompatible({
      name: 'github-copilot',
      ...config,
      compatibility: mode,
    });

    const executeCommandTool = {
      description: 'Execute a shell command and return its output',
      parameters: z.object({
        command: z.string().describe('The shell command to execute'),
      }),
      execute: async (args) => {
        console.log(`   🔧 [${mode}] Tool called with args:`, JSON.stringify(args, null, 2));

        const command = args.command || 'node --version';

        const { exec } = await import('child_process');
        const { promisify } = await import('util');
        const execAsync = promisify(exec);

        try {
          const { stdout } = await execAsync(command);
          const output = stdout.trim();
          console.log(`   ✅ [${mode}] Output: ${output}`);
          return { success: true, output };
        } catch (error) {
          console.log(`   ❌ [${mode}] Error: ${error.message}`);
          return { success: false, error: error.message };
        }
      }
    };

    try {
      const result = await streamText({
        model: provider('claude-sonnet-4.5'),
        messages: [
          {
            role: 'user',
            content: 'What version of Node.js am I running? Use executeCommand with "node --version".'
          }
        ],
        tools: {
          executeCommand: executeCommandTool,
        },
        maxSteps: 3,
      });

      let fullText = '';
      for await (const chunk of result.textStream) {
        fullText += chunk;
      }

      console.log(`   📄 [${mode}] Result: ${fullText.substring(0, 100)}`);

    } catch (error) {
      console.log(`   ❌ [${mode}] Error: ${error.message}`);
    }

    console.log('');
  }

  console.log('━'.repeat(60));
  console.log('\n✅ All tests completed!');
}

testCompatibilityModes().catch(console.error);
