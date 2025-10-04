#!/usr/bin/env node

/**
 * Deep Inspection of Vercel AI SDK Processing
 * 
 * This test hooks into the Vercel AI SDK's internal processing
 * to see exactly what's happening to the tool call arguments.
 */

import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { streamText } from 'ai';
import { z } from 'zod';
import { getSession, getProviderConfig } from '../lib/session.js';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

async function main() {
  const session = await getSession();
  const config = getProviderConfig(session);

  // Create provider
  const provider = createOpenAICompatible({
    ...config,
    name: 'copilot',
  });

  const messages = [
    {
      role: 'user',
      content: 'Please run this command: node --version'
    }
  ];

  console.log('\n=== Starting Vercel AI SDK Tool Call ===\n');

  const result = await streamText({
    model: provider('claude-sonnet-4.5'),
    messages: messages,
    tools: {
      executeCommand: {
        description: 'Execute a shell command and return its output',
        parameters: z.object({
          command: z.string().describe('The shell command to execute')
        }),
        execute: async function (args, options) {
          console.log('\n=== EXECUTE FUNCTION CALLED ===');
          console.log('typeof args:', typeof args);
          console.log('args:', args);
          console.log('args constructor:', args?.constructor?.name);
          console.log('args keys:', Object.keys(args || {}));
          console.log('args.command:', args?.command);
          console.log('JSON.stringify(args):', JSON.stringify(args));
          console.log('\noptions:', options);
          console.log('\nthis:', this);
          console.log('\narguments length:', arguments.length);
          console.log('arguments[0]:', arguments[0]);
          console.log('arguments[1]:', arguments[1]);

          // Try to execute with fallback
          const command = args?.command || 'echo "No command provided"';
          const { stdout } = await execAsync(command);
          return stdout.trim();
        }
      }
    },
    maxSteps: 5,
    onStepFinish: (step) => {
      console.log('\n=== STEP FINISHED ===');
      console.log('finishReason:', step.finishReason);
      console.log('toolCalls:', JSON.stringify(step.toolCalls, null, 2));
      console.log('toolResults:', JSON.stringify(step.toolResults, null, 2));
    }
  });

  console.log('\n=== STREAMING RESULT ===\n');

  let fullText = '';
  for await (const chunk of result.textStream) {
    fullText += chunk;
    process.stdout.write(chunk);
  }

  console.log('\n\n=== FINAL OUTPUT ===');
  console.log('Text:', fullText);
}

main().catch(console.error);
