#!/usr/bin/env node

/**
 * Raw API Response Inspector
 * 
 * This test makes a raw fetch() call to the Copilot API to inspect
 * the EXACT response body for tool calls.
 */

import { getSession } from '../lib/session.js';

async function main() {
  // Get auth config
  const session = await getSession();

  const messages = [
    {
      role: 'user',
      content: 'Please run this command: node --version'
    }
  ];

  const tools = [
    {
      type: 'function',
      function: {
        name: 'executeCommand',
        description: 'Execute a shell command and return its output',
        parameters: {
          type: 'object',
          properties: {
            command: {
              type: 'string',
              description: 'The shell command to execute'
            }
          },
          required: ['command']
        }
      }
    }
  ];

  // Make raw fetch call
  console.log('\n=== Making Raw API Call ===\n');

  const response = await fetch('https://api.individual.githubcopilot.com/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${session.tokens.copilot_token}`,
      'Content-Type': 'application/json',
      'Editor-Version': 'vscode/1.95.0',
      'Editor-Plugin-Version': 'copilot-chat/0.22.4',
      'User-Agent': 'GitHubCopilotChat/0.22.4'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4.5',
      messages: messages,
      tools: tools,
      max_tokens: 1000
    })
  });

  if (!response.ok) {
    console.error('API Error:', response.status, response.statusText);
    const text = await response.text();
    console.error('Response body:', text);
    return;
  }

  const data = await response.json();

  console.log('=== RAW API RESPONSE ===\n');
  console.log(JSON.stringify(data, null, 2)); if (data.choices?.[0]?.message?.tool_calls) {
    console.log('\n=== TOOL CALL DETAILS ===\n');
    const toolCall = data.choices[0].message.tool_calls[0];

    console.log('Tool Call Object:');
    console.log(JSON.stringify(toolCall, null, 2));

    console.log('\n--- Arguments Field ---');
    console.log('Type:', typeof toolCall.function.arguments);
    console.log('Raw Value:', toolCall.function.arguments);

    if (typeof toolCall.function.arguments === 'string') {
      console.log('\n--- Parsed Arguments ---');
      const parsed = JSON.parse(toolCall.function.arguments);
      console.log(JSON.stringify(parsed, null, 2));
      console.log('Keys:', Object.keys(parsed));
      console.log('command value:', parsed.command);
    }
  }
}

main().catch(console.error);
