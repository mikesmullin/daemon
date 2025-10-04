import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { getSession, getProviderConfig } from '../lib/session.js';
import { z } from 'zod';

/**
 * Raw API inspection - Let's see what Vercel AI SDK is actually sending
 */

async function inspectRawAPI() {
  console.log('\n🔍 RAW API INSPECTION\n');
  console.log('━'.repeat(60));

  const session = await getSession();
  const config = getProviderConfig(session);

  // Create provider
  const provider = createOpenAICompatible({
    name: 'github-copilot',
    ...config,
  });

  // Get the actual language model
  const model = provider('claude-sonnet-4.5');

  console.log('🔍 Model object inspection:');
  console.log(`   Model ID: ${model.modelId}`);
  console.log(`   Provider: ${model.provider}`);
  console.log(`   Spec type: ${model.specificationVersion}`);
  console.log('');

  // Try to use the experimental_generateText to see raw requests
  const { experimental_generateText } = await import('ai');

  try {
    console.log('📤 Attempting call with experimental API...\n');

    const result = await experimental_generateText({
      model: model,
      prompt: 'What version of Node.js am I running?',
      tools: {
        executeCommand: {
          description: 'Execute a shell command and return its output',
          parameters: z.object({
            command: z.string().describe('The shell command to execute'),
          }),
          execute: async ({ command }) => {
            console.log(`\n   🔧 EXECUTING: ${command}\n`);
            return { output: 'v22.20.0' };
          }
        }
      },
      maxSteps: 3,
      experimental_telemetry: {
        isEnabled: true,
        recordInputs: true,
        recordOutputs: true,
        functionId: 'test-tool-call',
      },
      onStepStart: (event) => {
        console.log('\n🟢 Step Start Event:');
        console.log(JSON.stringify(event, null, 2));
      },
      onStepFinish: (event) => {
        console.log('\n🔴 Step Finish Event:');
        console.log(JSON.stringify(event, null, 2));
      },
    });

    console.log('\n✅ Result:', result.text);

  } catch (error) {
    console.log('\n❌ Error:', error.message);
    if (error.cause) {
      console.log('Cause:', error.cause);
    }
  }
}

inspectRawAPI().catch(console.error);
