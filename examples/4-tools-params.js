import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { streamText } from 'ai';
import { getSession, getProviderConfig } from '../lib/session.js';
import { z } from 'zod';

/**
 * Version D: Debug parameter passing
 */

async function testParameterPassing() {
  console.log('\n🔧 VERSION D: Debug Parameter Passing\n');
  console.log('━'.repeat(60));

  const session = await getSession();
  const config = getProviderConfig(session);

  const provider = createOpenAICompatible({
    name: 'github-copilot',
    ...config,
  });

  const executeCommandTool = {
    description: 'Execute a shell command and return its output',
    parameters: z.object({
      command: z.string().describe('The shell command to execute (e.g. "node --version")'),
    }),
    execute: async (args) => {
      console.log(`\n   🔧 Tool execute() called!`);
      console.log(`   Args type: ${typeof args}`);
      console.log(`   Args:`, JSON.stringify(args, null, 2));
      console.log(`   Args keys:`, Object.keys(args || {}));

      // Try different ways to access the command
      console.log(`   args.command: ${args.command}`);
      console.log(`   args['command']: ${args['command']}`);

      const command = args.command || args['command'] || 'node --version';
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

  console.log('📤 Testing with explicit command request...\n');

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
      onStepFinish: (event) => {
        console.log(`\n📊 Step finished:`);
        console.log(`   Finish reason: ${event.finishReason}`);

        if (event.toolCalls && event.toolCalls.length > 0) {
          console.log(`   Tool calls: ${event.toolCalls.length}`);
          event.toolCalls.forEach((tc, i) => {
            console.log(`\n   Tool Call ${i + 1}:`);
            console.log(`     Name: ${tc.toolName}`);
            console.log(`     Args type: ${typeof tc.args}`);
            console.log(`     Args:`, JSON.stringify(tc.args, null, 2));
          });
        }

        if (event.toolResults && event.toolResults.length > 0) {
          console.log(`   Tool results: ${event.toolResults.length}`);
          event.toolResults.forEach((tr, i) => {
            console.log(`\n   Tool Result ${i + 1}:`);
            console.log(`     Name: ${tr.toolName}`);
            console.log(`     Result:`, JSON.stringify(tr.result, null, 2));
          });
        }
      },
    });

    console.log('\n📥 Collecting stream...\n');

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

testParameterPassing().catch(console.error);
