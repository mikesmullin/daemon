import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { generateText } from 'ai';
import { getSession, getProviderConfig } from '../lib/session.js';
import { z } from 'zod';

/**
 * Version B: Vercel AI SDK - DETAILED DEBUG VERSION
 */

async function runConversationWithTools() {
  console.log('\n🔧 VERSION B: Vercel AI SDK (DETAILED DEBUG)\n');
  console.log('━'.repeat(60));

  const session = await getSession();
  const config = getProviderConfig(session);

  console.log('🔍 Provider Config:');
  console.log(`   API Key: ${config.apiKey.substring(0, 20)}...`);
  console.log(`   Base URL: ${config.baseURL}`);
  console.log(`   Headers:`, config.headers);
  console.log('');

  const provider = createOpenAICompatible({
    name: 'github-copilot',
    ...config,
  });

  // Define tool with detailed logging
  const executeCommandTool = {
    description: 'Execute a shell command and return its output',
    parameters: z.object({
      command: z.string().describe('The shell command to execute (e.g. "node --version")'),
    }),
    execute: async ({ command }) => {
      console.log(`\n   🔧 TOOL EXECUTED: executeCommand("${command}")`);
      const { exec } = await import('child_process');
      const { promisify } = await import('util');
      const execAsync = promisify(exec);

      try {
        const { stdout, stderr } = await execAsync(command);
        const output = stdout || stderr;
        console.log(`   ✅ Tool Output:`, output.trim());
        const result = { success: true, output: output.trim() };
        console.log(`   📤 Tool returning:`, JSON.stringify(result));
        return result;
      } catch (error) {
        console.log(`   ❌ Tool Error:`, error.message);
        const result = { success: false, error: error.message };
        console.log(`   📤 Tool returning:`, JSON.stringify(result));
        return result;
      }
    }
  };

  console.log('📝 Tool Definition:');
  console.log(`   Name: executeCommand`);
  console.log(`   Description: ${executeCommandTool.description}`);
  console.log(`   Parameters schema:`, executeCommandTool.parameters._def);
  console.log('');

  const testCase = {
    model: 'claude-sonnet-4.5',
    prompt: 'What version of Node.js am I running? Use the executeCommand tool to find out.'
  };

  console.log(`🧪 Test Case:`);
  console.log(`   Model: ${testCase.model}`);
  console.log(`   Prompt: "${testCase.prompt}"`);
  console.log('');

  try {
    console.log('📤 Calling generateText...\n');

    const result = await generateText({
      model: provider(testCase.model),
      prompt: testCase.prompt,
      tools: {
        executeCommand: executeCommandTool,
      },
      maxSteps: 5,
      onStepFinish: (step) => {
        console.log(`\n🔔 Step Finished Callback:`);
        console.log(`   Step type:`, step.stepType);
        console.log(`   Finish reason:`, step.finishReason);
        console.log(`   Is continuing:`, step.isContinued);
        if (step.toolCalls && step.toolCalls.length > 0) {
          console.log(`   Tool calls: ${step.toolCalls.length}`);
          step.toolCalls.forEach((tc, i) => {
            console.log(`     ${i + 1}. ${tc.toolName}:`, tc.args);
          });
        } else {
          console.log(`   Tool calls: NONE`);
        }
        if (step.toolResults && step.toolResults.length > 0) {
          console.log(`   Tool results: ${step.toolResults.length}`);
          step.toolResults.forEach((tr, i) => {
            console.log(`     ${i + 1}. ${tr.toolName}:`, tr.result);
          });
        }
        if (step.text) {
          console.log(`   Text:`, step.text.substring(0, 200));
        }
      },
    });

    console.log('\n' + '━'.repeat(60));
    console.log('✅ Final Response:\n');
    console.log(result.text);
    console.log('━'.repeat(60));

    console.log('\n📊 Complete Result Object:');
    console.log(`   Text: ${result.text}`);
    console.log(`   Finish Reason: ${result.finishReason}`);
    console.log(`   Usage: ${JSON.stringify(result.usage)}`);
    console.log(`   Steps: ${result.steps ? result.steps.length : 'N/A'}`);

    if (result.steps) {
      result.steps.forEach((step, i) => {
        console.log(`\n   Step ${i + 1}:`);
        console.log(`     Step Type: ${step.stepType}`);
        console.log(`     Finish Reason: ${step.finishReason}`);
        console.log(`     Tool Calls:`, step.toolCalls ? step.toolCalls.length : 0);
        console.log(`     Tool Results:`, step.toolResults ? step.toolResults.length : 0);

        if (step.toolCalls && step.toolCalls.length > 0) {
          step.toolCalls.forEach((tc) => {
            console.log(`       - ${tc.toolName}:`, tc.args);
          });
        }

        if (step.toolResults && step.toolResults.length > 0) {
          step.toolResults.forEach((tr) => {
            console.log(`       - ${tr.toolName} result:`, tr.result);
          });
        }
      });
    }

    console.log('\n' + '━'.repeat(60));

  } catch (error) {
    console.log(`\n❌ Error occurred:`);
    console.log(`   Message: ${error.message}`);
    console.log(`   Name: ${error.name}`);

    if (error.cause) {
      console.log(`\n   Cause:`, JSON.stringify(error.cause, null, 2));
    }

    if (error.stack) {
      console.log(`\n   Stack trace:`);
      console.log(error.stack);
    }

    if (error.responseBody) {
      console.log(`\n   Response body:`, error.responseBody);
    }

    console.log('\n' + '━'.repeat(60));
  }

  console.log('\n✅ Test completed!');
}

runConversationWithTools().catch(console.error);
