import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { generateText } from 'ai';
import { getSession, getProviderConfig } from '../lib/session.js';
import { z } from 'zod';

/**
 * Version B: Vercel AI SDK - TESTING VERSION
 * 
 * This is the Vercel AI SDK implementation to debug and fix.
 */

async function runConversationWithTools() {
  console.log('\n🔧 VERSION B: Vercel AI SDK (TESTING)\n');
  console.log('━'.repeat(60));

  const session = await getSession();
  const config = getProviderConfig(session);

  const provider = createOpenAICompatible({
    name: 'github-copilot',
    ...config,
  });

  console.log('📝 Tool setup:');
  console.log('   Using Vercel AI SDK tool format with zod schemas');
  console.log('');

  const testCase = {
    name: 'Terminal Execution Test (Claude Sonnet 4.5)',
    model: 'claude-sonnet-4.5',
    prompt: 'What version of Node.js am I running?'
  };

  console.log(`🧪 ${testCase.name}\n`);
  console.log(`   Model: ${testCase.model}`);
  console.log(`   Prompt: "${testCase.prompt}"`);
  console.log('');

  try {
    console.log('📤 Calling generateText with tools...\n');

    const result = await generateText({
      model: provider(testCase.model),
      prompt: testCase.prompt,
      tools: {
        executeCommand: {
          description: 'Execute a shell command and return its output',
          parameters: z.object({
            command: z.string().describe('The shell command to execute (e.g. "node --version")'),
          }),
          execute: async ({ command }) => {
            console.log(`   🔧 Executing: executeCommand("${command}")`);
            const { exec } = await import('child_process');
            const { promisify } = await import('util');
            const execAsync = promisify(exec);

            try {
              const { stdout, stderr } = await execAsync(command);
              const output = stdout || stderr;
              console.log(`   ✅ Output:`, output.trim());
              return { success: true, output };
            } catch (error) {
              console.log(`   ❌ Error:`, error.message);
              return { success: false, error: error.message };
            }
          }
        }
      },
      maxSteps: 5,
    });

    console.log('\n' + '━'.repeat(60));
    console.log('✅ Final Response:\n');
    console.log(result.text);
    console.log('━'.repeat(60));

    // Debug info
    console.log('\n📊 Debug Info:');
    console.log(`   Steps taken: ${result.steps ? result.steps.length : 'N/A'}`);
    console.log(`   Finish reason: ${result.finishReason}`);

    if (result.steps) {
      result.steps.forEach((step, i) => {
        console.log(`\n   Step ${i + 1}:`);
        console.log(`     Type: ${step.type}`);
        if (step.toolCalls) {
          console.log(`     Tool calls: ${step.toolCalls.length}`);
          step.toolCalls.forEach((tc, j) => {
            console.log(`       ${j + 1}. ${tc.toolName}(${JSON.stringify(tc.args)})`);
          });
        }
        if (step.toolResults) {
          console.log(`     Tool results: ${step.toolResults.length}`);
        }
        if (step.text) {
          console.log(`     Text: ${step.text.substring(0, 100)}...`);
        }
      });
    }

  } catch (error) {
    console.log(`\n❌ Error occurred:`);
    console.log(`   Message: ${error.message}`);
    console.log(`   Name: ${error.name}`);

    if (error.cause) {
      console.log(`\n   Cause:`, error.cause);
    }

    if (error.stack) {
      console.log(`\n   Stack trace:`);
      console.log(error.stack);
    }

    // Check for API response errors
    if (error.responseBody) {
      console.log(`\n   Response body:`, error.responseBody);
    }

    console.log('\n' + '━'.repeat(60) + '\n');
  }

  console.log('\n✅ Test completed!');
}

runConversationWithTools().catch(console.error);
