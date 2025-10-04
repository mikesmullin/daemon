/**
 * lib/session.js
 * 
 * Centralized session management for GitHub Copilot authentication.
 * Handles token loading, validation, renewal, and fresh authentication.
 * 
 * Usage:
 *   import { getSession } from './lib/session.js';
 *   const session = await getSession();
 *   // session.tokens contains valid tokens
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import yaml from 'js-yaml';
import open from 'open';

// Configuration
const CLIENT_ID = "Iv1.b507a08c87ecfe98";
const DEVICE_CODE_URL = "https://github.com/login/device/code";
const ACCESS_TOKEN_URL = "https://github.com/login/oauth/access_token";
const COPILOT_API_KEY_URL = "https://api.github.com/copilot_internal/v2/token";
const TOKENS_FILE = join(process.cwd(), '.tokens.yaml');

/**
 * Load tokens from .tokens.yaml file
 * @returns {Object} Tokens object or empty object if file doesn't exist
 */
function loadTokens() {
  if (!existsSync(TOKENS_FILE)) {
    return {};
  }
  const content = readFileSync(TOKENS_FILE, 'utf8');
  return yaml.load(content) || {};
}

/**
 * Save tokens to .tokens.yaml file
 * @param {Object} tokens - Tokens object to save
 */
function saveTokens(tokens) {
  const yamlStr = yaml.dump(tokens);
  writeFileSync(TOKENS_FILE, yamlStr, 'utf8');
  console.log(`✓ Tokens saved to ${TOKENS_FILE}`);
}

/**
 * Start GitHub OAuth device flow
 * @returns {Promise<Object>} Device flow data with user_code and device_code
 */
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

/**
 * Poll GitHub for access token after user authorizes
 * @param {string} deviceCode - Device code from startDeviceFlow
 * @param {number} interval - Polling interval in seconds
 * @returns {Promise<string>} GitHub OAuth access token
 */
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

/**
 * Exchange GitHub OAuth token for Copilot API token
 * @param {string} githubToken - GitHub OAuth access token
 * @returns {Promise<Object>} Copilot token data with token, expires_at, api_url
 */
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

/**
 * Perform full authentication flow
 * - Start device flow
 * - Open browser for user authorization
 * - Poll for OAuth token
 * - Exchange for Copilot token
 * - Save all tokens
 * @returns {Promise<Object>} Complete tokens object
 */
async function performFreshAuthentication() {
  const tokens = {};

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

/**
 * Main session getter with automatic token renewal
 * Three-tier strategy:
 * 1. Use cached Copilot token if still valid
 * 2. Use cached GitHub token to refresh Copilot token if expired
 * 3. Perform fresh authentication if everything expired
 * 
 * @param {Object} options - Options for session management
 * @param {boolean} options.silent - Suppress console output (default: false)
 * @returns {Promise<Object>} Session object with valid tokens
 */
export async function getSession(options = {}) {
  const { silent = false } = options;

  const log = silent ? () => { } : console.log;

  let tokens = loadTokens();

  // Tier 1: Check if we have valid Copilot token
  if (tokens.copilot_token && tokens.expires_at && tokens.expires_at * 1000 > Date.now()) {
    log('✓ Using cached Copilot token');
    return { tokens };
  }

  // Tier 2: Try to refresh Copilot token using GitHub OAuth token
  if (tokens.github_token) {
    log('✓ Using cached GitHub token, refreshing Copilot token...');
    try {
      const copilotData = await getCopilotToken(tokens.github_token);
      tokens.copilot_token = copilotData.token;
      tokens.expires_at = copilotData.expires_at;
      tokens.api_url = copilotData.api_url;
      saveTokens(tokens);
      log('✓ Copilot token refreshed!');
      return { tokens };
    } catch (error) {
      log('⚠️  Cached GitHub token expired, re-authenticating...');
    }
  }

  // Tier 3: Perform fresh authentication
  tokens = await performFreshAuthentication();
  return { tokens };
}

/**
 * Get a provider configuration object for Vercel AI SDK
 * @param {Object} session - Session object from getSession()
 * @returns {Object} Configuration object for createOpenAICompatible()
 */
export function getProviderConfig(session) {
  return {
    apiKey: session.tokens.copilot_token,
    baseURL: session.tokens.api_url || 'https://api.githubcopilot.com',
    headers: {
      'Editor-Version': 'vscode/1.99.3',
      'Editor-Plugin-Version': 'copilot-chat/0.26.7',
      'User-Agent': 'GitHubCopilotChat/0.26.7',
    },
  };
}

/**
 * Get an OpenAI SDK client configuration
 * For use with the official OpenAI SDK
 * @param {Object} session - Session object from getSession()
 * @returns {Object} Configuration object for new OpenAI()
 */
export function getOpenAIConfig(session) {
  return {
    apiKey: session.tokens.copilot_token,
    baseURL: session.tokens.api_url || 'https://api.githubcopilot.com',
    defaultHeaders: {
      'Editor-Version': 'vscode/1.99.3',
      'Editor-Plugin-Version': 'copilot-chat/0.26.7',
      'User-Agent': 'GitHubCopilotChat/0.26.7',
      'Copilot-Integration-Id': 'vscode-chat',
      'OpenAI-Intent': 'conversation-panel',
    }
  };
}

/**
 * Force a token refresh
 * Useful for testing or when you know tokens are invalid
 * @returns {Promise<Object>} Session object with fresh tokens
 */
export async function forceRefresh() {
  console.log('🔄 Forcing token refresh...');
  const tokens = loadTokens();

  if (tokens.github_token) {
    try {
      const copilotData = await getCopilotToken(tokens.github_token);
      tokens.copilot_token = copilotData.token;
      tokens.expires_at = copilotData.expires_at;
      tokens.api_url = copilotData.api_url;
      saveTokens(tokens);
      console.log('✓ Tokens refreshed successfully!');
      return { tokens };
    } catch (error) {
      console.log('⚠️  GitHub token invalid, starting fresh authentication...');
    }
  }

  const freshTokens = await performFreshAuthentication();
  return { tokens: freshTokens };
}

// Export helper functions for advanced use cases
export {
  loadTokens,
  saveTokens,
  getCopilotToken,
  startDeviceFlow,
  pollForAccessToken,
};
