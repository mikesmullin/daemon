import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { generateText, streamText } from 'ai';
import { getSession, getProviderConfig } from '../lib/session.js';
import { z } from 'zod';

/**
 * Version C: Try streamText instead of generateText
 * Sometimes streaming APIs handle tools differently
 */

async function testWithStreaming() {
  console.log('\n🔧 VERSION C: Vercel AI SDK with streamText\n');
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
    execute: async ({ command }) => {
      console.log(`\n   🔧 EXECUTING TOOL: executeCommand("${command}")`);
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

  console.log('📤 Using streamText API...\n');

  try {
    const result = await streamText({
      model: provider('claude-sonnet-4.5'),
      prompt: 'What version of Node.js am I running? Please use the executeCommand tool with "node --version".',
      tools: {
        executeCommand: executeCommandTool,
      },
      maxSteps: 5,
      onChunk: (chunk) => {
        if (chunk.type === 'tool-call') {
          console.log(`\n🔧 Tool call chunk:`, chunk);
        }
      },
      onFinish: (event) => {
        console.log(`\n🏁 Finish event:`);
        console.log(`   Finish reason: ${event.finishReason}`);
        console.log(`   Tool calls: ${event.toolCalls ? event.toolCalls.length : 0}`);
        console.log(`   Tool results: ${event.toolResults ? event.toolResults.length : 0}`);
      },
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

testWithStreaming().catch(console.error);
