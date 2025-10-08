import { _G } from './globals.mjs';
import { readYaml, log, abort, writeYaml } from './utils.mjs';
import OpenAI from 'openai';
import open from 'open';

/**
 * Save tokens to .tokens.yaml file
 * @param {Object} tokens - Tokens object to save
 */
function saveTokens(tokens) {
  writeYaml(_G.TOKENS_PATH, tokens);
  log('debug', `✅ Tokens saved to ${_G.TOKENS_PATH}`);
}

export class Copilot {
  static session = null;
  static client = null;

  static async init() {
    if (Copilot.client) {
      return false; // already initialized
    }

    // Get authenticated session
    // log('debug', '🔐 Authenticating with GitHub Copilot...');
    Copilot.session = await Copilot.getSession();
    const config = Copilot.getOpenAIConfig(Copilot.session);
    Copilot.client = new OpenAI(config);
    // log('debug', '✅ Authentication successful\n');
  }

  /**
   * Start GitHub OAuth device flow
   * @returns {Promise<Object>} Device flow data with user_code and device_code
   */
  static async startDeviceFlow() {
    // log('debug', '🔐 Starting GitHub authentication...');

    const response = await fetch(_G.CONFIG.github.device_code_url, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'User-Agent': _G.CONFIG.github.user_agent,
      },
      body: JSON.stringify({
        client_id: _G.CONFIG.github.client_id,
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
  static async pollForAccessToken(deviceCode, interval) {
    const startTime = Date.now();
    const maxWait = _G.CONFIG.copilot.access_token_max_poll_timeout;

    while (Date.now() - startTime < maxWait) {
      await new Promise(resolve => setTimeout(resolve, interval * 1000));

      const response = await fetch(_G.CONFIG.github.access_token_url, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'User-Agent': _G.CONFIG.github.user_agent,
        },
        body: JSON.stringify({
          client_id: _G.CONFIG.github.client_id,
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
        abort(`Authentication failed: ${data.error_description || data.error}`);
      }
    }

    abort('Authentication timeout');
  }

  /**
   * Exchange GitHub OAuth token for Copilot API token
   * @param {string} githubToken - GitHub OAuth access token
   * @returns {Promise<Object>} Copilot token data with token, expires_at, api_url
   */
  static async getCopilotToken(githubToken) {
    const response = await fetch(_G.CONFIG.copilot.api_key_url, {
      headers: {
        'Accept': 'application/json',
        'Authorization': `Bearer ${githubToken}`,
        'User-Agent': _G.CONFIG.copilot.user_agent,
        'Editor-Version': _G.CONFIG.copilot.editor_version,
        'Editor-Plugin-Version': _G.CONFIG.copilot.editor_plugin_version,
      },
    });

    if (!response.ok) {
      abort(`Failed to get Copilot token: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return {
      token: data.token,
      expires_at: data.expires_at,
      api_url: data.endpoints?.api || _G.CONFIG.copilot.default_api_url,
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
  static async performFreshAuthentication() {
    const tokens = {};

    const deviceFlow = await Copilot.startDeviceFlow();

    log(`warn`, `📋 Please visit: ${deviceFlow.verification_uri}`);
    log(`warn`, `🔑 Enter code: ${deviceFlow.user_code}\n`);

    // Open browser automatically
    await open(deviceFlow.verification_uri);

    log(`debug`, '⏳ Waiting for authorization', { flush: true });

    const githubToken = await Copilot.pollForAccessToken(deviceFlow.device_code, deviceFlow.interval);
    log(`info`, '✅ GitHub authenticated!');

    const copilotData = await Copilot.getCopilotToken(githubToken);
    log(`info`, '✅ Copilot token obtained!');

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
   * @returns {Promise<Object>} Session object with valid tokens
   */
  static async getSession() {
    let tokens = {};

    try {
      tokens = await readYaml(_G.TOKENS_PATH, true);
    } catch (error) {
      // force-override logging
      process.env.LOG = '*';
      // File doesn't exist yet, start with empty tokens
      log('debug', '📄 No existing tokens file found, starting fresh');
      tokens = {};
    }

    // Tier 1: Check if we have valid Copilot token
    if (tokens.copilot_token && tokens.expires_at && tokens.expires_at * 1000 > Date.now()) {
      log('debug', '✅ Using cached Copilot token');
      return { tokens };
    }

    // Tier 2: Try to refresh Copilot token using GitHub OAuth token
    if (tokens.github_token) {
      log('debug', '✅ Using cached GitHub token, refreshing Copilot token...');
      try {
        const copilotData = await Copilot.getCopilotToken(tokens.github_token);
        tokens.copilot_token = copilotData.token;
        tokens.expires_at = copilotData.expires_at;
        tokens.api_url = copilotData.api_url;
        saveTokens(tokens);
        log('debug', '✅ Copilot token refreshed!');
        return { tokens };
      } catch (error) {
        log('warn', '⚠️  Cached GitHub token expired, re-authenticating...');
      }
    }

    // Tier 3: Perform fresh authentication
    tokens = await Copilot.performFreshAuthentication();
    return { tokens };
  }

  /**
   * Get an OpenAI SDK client configuration
   * For use with the official OpenAI SDK
   * @param {Object} session - Session object from getSession()
   * @returns {Object} Configuration object for new OpenAI()
   */
  static getOpenAIConfig(session) {
    return {
      apiKey: session.tokens.copilot_token,
      baseURL: session.tokens.api_url || _G.CONFIG.copilot.default_api_url,
      defaultHeaders: {
        'Editor-Version': _G.CONFIG.copilot.editor_version,
        'Editor-Plugin-Version': _G.CONFIG.copilot.editor_plugin_version,
        'User-Agent': _G.CONFIG.copilot.user_agent,
        'Copilot-Integration-Id': _G.CONFIG.copilot.integration_id,
        'OpenAI-Intent': 'conversation-panel',
      }
    };
  }

  // /**
  //  * Force a token refresh
  //  * Useful for testing or when you know tokens are invalid
  //  * @returns {Promise<Object>} Session object with fresh tokens
  //  */
  // static async forceRefresh() {
  //   log('debug', '🔄 Forcing token refresh...');
  //   const tokens = _G.TOKENS = await readYaml(_G.TOKENS_PATH);

  //   if (tokens.github_token) {
  //     try {
  //       const copilotData = await Copilot.getCopilotToken(tokens.github_token);
  //       tokens.copilot_token = copilotData.token;
  //       tokens.expires_at = copilotData.expires_at;
  //       tokens.api_url = copilotData.api_url;
  //       await writeYaml(_G.TOKENS_PATH, tokens);
  //       log('debug', '✅ Tokens refreshed successfully!');
  //       return { tokens };
  //     } catch (error) {
  //       log('warn', '⚠️  GitHub token invalid, starting fresh authentication...');
  //     }
  //   }

  //   const freshTokens = await Copilot.performFreshAuthentication();
  //   return { tokens: freshTokens };
  // }
}

