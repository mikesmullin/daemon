import { readFileSync, writeFileSync, existsSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import yaml from 'js-yaml';
import open from 'open';
import readline from 'readline';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { generateText } from 'ai';

// Configuration
const CLIENT_ID = "Iv1.b507a08c87ecfe98";
const DEVICE_CODE_URL = "https://github.com/login/device/code";
const ACCESS_TOKEN_URL = "https://github.com/login/oauth/access_token";
const COPILOT_API_KEY_URL = "https://api.github.com/copilot_internal/v2/token";
const TOKENS_FILE = join(process.cwd(), '.tokens.yaml');

// Helper to read/write tokens
function loadTokens() {
  if (!existsSync(TOKENS_FILE)) {
    return {};
  }
  const content = readFileSync(TOKENS_FILE, 'utf8');
  return yaml.load(content) || {};
}

function saveTokens(tokens) {
  const yamlStr = yaml.dump(tokens);
  writeFileSync(TOKENS_FILE, yamlStr, 'utf8');
  console.log(`✓ Tokens saved to ${TOKENS_FILE}`);
}

// Step 1: Start device flow authentication
async function startDeviceFlow() {
  console.log('\n🔐 Starting GitHub authentication...\n');

  const response = await fetch(DEVICE_CODE_URL, {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'User-Agent': 'GitHubCopilotChat/0.26.7',
    },
    body: JSON.stringify({
      client_id: CLIENT_ID,
      scope: 'read:user',
    }),
  });

  const data = await response.json();
  return {
    device_code: data.device_code,
    user_code: data.user_code,
    verification_uri: data.verification_uri,
    expires_in: data.expires_in,
    interval: data.interval || 5,
  };
}

// Step 2: Poll for access token
async function pollForAccessToken(deviceCode, interval) {
  const startTime = Date.now();
  const maxWait = 300000; // 5 minutes

  while (Date.now() - startTime < maxWait) {
    await new Promise(resolve => setTimeout(resolve, interval * 1000));

    const response = await fetch(ACCESS_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'User-Agent': 'GitHubCopilotChat/0.26.7',
      },
      body: JSON.stringify({
        client_id: CLIENT_ID,
        device_code: deviceCode,
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      }),
    });

    const data = await response.json();

    if (data.access_token) {
      return data.access_token;
    }

    if (data.error === 'authorization_pending') {
      process.stdout.write('.');
      continue;
    }

    if (data.error) {
      throw new Error(`Authentication failed: ${data.error_description || data.error}`);
    }
  }

  throw new Error('Authentication timeout');
}

// Step 3: Get Copilot API token using GitHub OAuth token
async function getCopilotToken(githubToken) {
  const response = await fetch(COPILOT_API_KEY_URL, {
    headers: {
      'Accept': 'application/json',
      'Authorization': `Bearer ${githubToken}`,
      'User-Agent': 'GitHubCopilotChat/0.26.7',
      'Editor-Version': 'vscode/1.99.3',
      'Editor-Plugin-Version': 'copilot-chat/0.26.7',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to get Copilot token: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  return {
    token: data.token,
    expires_at: data.expires_at,
    api_url: data.endpoints?.api || 'https://api.githubcopilot.com',
  };
}

// Authenticate and get tokens
async function authenticate() {
  const tokens = loadTokens();

  // Check if we have valid tokens
  if (tokens.copilot_token && tokens.expires_at && tokens.expires_at * 1000 > Date.now()) {
    console.log('✓ Using cached Copilot token');
    return tokens;
  }

  // Check if we have a GitHub OAuth token
  if (tokens.github_token) {
    console.log('✓ Using cached GitHub token, refreshing Copilot token...');
    try {
      const copilotData = await getCopilotToken(tokens.github_token);
      tokens.copilot_token = copilotData.token;
      tokens.expires_at = copilotData.expires_at;
      tokens.api_url = copilotData.api_url;
      saveTokens(tokens);
      return tokens;
    } catch (error) {
      console.log('⚠️  Cached GitHub token expired, re-authenticating...');
    }
  }

  // Start fresh authentication
  const deviceFlow = await startDeviceFlow();

  console.log(`📋 Please visit: ${deviceFlow.verification_uri}`);
  console.log(`🔑 Enter code: ${deviceFlow.user_code}\n`);

  // Open browser automatically
  await open(deviceFlow.verification_uri);

  console.log('⏳ Waiting for authorization', { flush: true });

  const githubToken = await pollForAccessToken(deviceFlow.device_code, deviceFlow.interval);
  console.log('\n✓ GitHub authenticated!');

  const copilotData = await getCopilotToken(githubToken);
  console.log('✓ Copilot token obtained!');

  tokens.github_token = githubToken;
  tokens.copilot_token = copilotData.token;
  tokens.expires_at = copilotData.expires_at;
  tokens.api_url = copilotData.api_url;

  saveTokens(tokens);
  return tokens;
}

// Prompt user for input using readline
async function promptUser(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

// Call Copilot API
async function callCopilot(prompt, tokens, model = 'gpt-4o') {
  console.log('\n🤖 Calling Copilot API...\n');

  // GitHub Copilot uses OpenAI-compatible API format
  // The api_url from tokens already includes https://
  let baseURL = tokens.api_url || 'https://api.githubcopilot.com';

  // Ensure it has https:// prefix
  if (!baseURL.startsWith('http://') && !baseURL.startsWith('https://')) {
    baseURL = `https://${baseURL}`;
  }

  console.log('🔗 Using API endpoint:', baseURL);

  // Use openai-compatible provider for all models to avoid API compatibility issues
  const provider = createOpenAICompatible({
    name: 'github-copilot',
    apiKey: tokens.copilot_token,
    baseURL: baseURL,
    compatibility: 'compatible',
    headers: {
      'Editor-Version': 'vscode/1.99.3',
      'Editor-Plugin-Version': 'copilot-chat/0.26.7',
      'User-Agent': 'GitHubCopilotChat/0.26.7',
    },
  });

  try {
    const result = await generateText({
      model: provider(model),
      prompt: prompt,
      maxTokens: 2000,
    });

    return result.text;
  } catch (error) {
    console.error('❌ Error calling Copilot:', error.message);
    if (error.cause) {
      console.error('Cause:', error.cause);
    }
    if (error.responseBody) {
      console.error('Response body:', error.responseBody);
    }
    throw error;
  }
}

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    prompt: null,
    model: 'gpt-4o', // default model
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--prompt' && args[i + 1]) {
      options.prompt = args[i + 1];
      i++;
    } else if (args[i] === '--model' && args[i + 1]) {
      options.model = args[i + 1];
      i++;
    } else if (args[i] === '--help' || args[i] === '-h') {
      console.log(`
Usage: node index.js [options]

Options:
  --prompt <text>    Send this prompt directly (skip interactive input)
  --model <name>     Model to use (default: gpt-4o)
                     Examples: gpt-4o, claude-sonnet-4, o1-preview
  --help, -h         Show this help message

Examples:
  node index.js
  node index.js --prompt "Hello, world!"
  node index.js --model claude-sonnet-4 --prompt "Explain async/await"
      `);
      process.exit(0);
    }
  }

  return options;
}

// Main function
async function main() {
  try {
    const options = parseArgs();

    console.log('🚀 Minimal GitHub Copilot CLI\n');

    // Authenticate
    const tokens = await authenticate();

    // Get user prompt (from CLI arg or interactive)
    let userPrompt;
    if (options.prompt) {
      userPrompt = options.prompt;
      console.log(`\n💬 Using prompt: "${userPrompt}"`);
    } else {
      userPrompt = await promptUser('\n💬 Enter your prompt for Copilot: ');
    }

    if (!userPrompt.trim()) {
      console.log('❌ No prompt provided. Exiting.');
      return;
    }

    console.log(`🎯 Using model: ${options.model}`);

    // Call Copilot
    const response = await callCopilot(userPrompt, tokens, options.model);

    // Print response
    console.log('━'.repeat(60));
    console.log('📝 Copilot Response:\n');
    console.log(response);
    console.log('━'.repeat(60));

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  }
}

main();
