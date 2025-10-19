/**
 * GitHub Copilot Provider
 * 
 * Provides access to GitHub Copilot API models including:
 * - claude-sonnet-4
 * - claude-sonnet-3.5
 * - gpt-4o
 * - o1-preview
 * - o1-mini
 */

import { BaseProvider } from './base.mjs';
import { _G } from '../globals.mjs';
import { readYaml, log, abort, writeYaml } from '../utils.mjs';
import OpenAI from 'openai';
import open from 'open';

export class CopilotProvider extends BaseProvider {
  constructor() {
    super();
    this.session = null;
    this.client = null;
  }

  static getName() {
    return 'Copilot';
  }

  static getModelPatterns() {
    return [
      /^claude-sonnet-4$/,
      /^claude-sonnet-3\.5$/,
      /^gpt-4o$/,
      /^o1-preview$/,
      /^o1-mini$/,
      /^gpt-4$/,
    ];
  }

  static isConfigured() {
    // Copilot uses GitHub OAuth flow, so it's always "available"
    // Configuration happens on-demand during init()
    return true;
  }

  async init() {
    if (this.initialized && this.client) {
      return;
    }

    // Get authenticated session
    this.session = await this.getSession();
    const config = this.getOpenAIConfig(this.session);
    this.client = new OpenAI(config);
    this.initialized = true;
  }

  async createChatCompletion({ model, messages, tools = [], max_tokens }) {
    const startTime = Date.now();
    let firstTokenTime = null;

    try {
      const response = await this.client.chat.completions.create({
        model: model || 'claude-sonnet-4',
        messages: messages,
        tools: tools.length > 0 ? tools : undefined,
        max_tokens: max_tokens,
        stream: false,
      });

      // Measure time to first token (approximation since we're not streaming)
      firstTokenTime = Date.now();

      // Add metrics
      const endTime = Date.now();
      const totalTime = (endTime - startTime) / 1000;
      const tokensGenerated = response.usage?.completion_tokens || 0;

      response.metrics = {
        tokens_per_second: tokensGenerated / totalTime,
        time_to_first_token_ms: firstTokenTime - startTime,
      };

      return this.normalizeResponse(response);
    } catch (error) {
      if (error.message.includes('token expired')) {
        // Force re-authentication
        this.initialized = false;
        this.client = null;
        await this.init();
        // Retry once
        return this.createChatCompletion({ model, messages, tools, max_tokens });
      }
      throw error;
    }
  }

  async listModels() {
    // Copilot doesn't have a models endpoint, return known models
    return [
      { id: 'claude-sonnet-4', name: 'Claude Sonnet 4', description: 'Anthropic Claude Sonnet 4 via Copilot' },
      { id: 'claude-sonnet-3.5', name: 'Claude Sonnet 3.5', description: 'Anthropic Claude Sonnet 3.5 via Copilot' },
      { id: 'gpt-4o', name: 'GPT-4o', description: 'OpenAI GPT-4o via Copilot' },
      { id: 'o1-preview', name: 'o1-preview', description: 'OpenAI o1-preview via Copilot' },
      { id: 'o1-mini', name: 'o1-mini', description: 'OpenAI o1-mini via Copilot' },
      { id: 'gpt-4', name: 'GPT-4', description: 'OpenAI GPT-4 via Copilot' },
    ];
  }

  // ===== Copilot-specific authentication methods =====

  /**
   * Save tokens to .tokens.yaml file
   */
  saveTokens(tokens) {
    writeYaml(_G.TOKENS_PATH, tokens);
    log('debug', `✅ Tokens saved to ${_G.TOKENS_PATH}`);
  }

  /**
   * Start GitHub OAuth device flow
   */
  async startDeviceFlow() {
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
   */
  async pollForAccessToken(deviceCode, interval) {
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
   */
  async getCopilotToken(githubToken) {
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
   */
  async performFreshAuthentication() {
    const tokens = {};

    const deviceFlow = await this.startDeviceFlow();

    log('warn', `📋 Please visit: ${deviceFlow.verification_uri}`);
    log('warn', `🔑 Enter code: ${deviceFlow.user_code}\n`);

    // Open browser automatically
    await open(deviceFlow.verification_uri);

    log('debug', '⏳ Waiting for authorization', { flush: true });

    const githubToken = await this.pollForAccessToken(deviceFlow.device_code, deviceFlow.interval);
    log('info', '✅ GitHub authenticated!');

    const copilotData = await this.getCopilotToken(githubToken);
    log('info', '✅ Copilot token obtained!');

    tokens.github_token = githubToken;
    tokens.copilot_token = copilotData.token;
    tokens.expires_at = copilotData.expires_at;
    tokens.api_url = copilotData.api_url;

    this.saveTokens(tokens);
    return tokens;
  }

  /**
   * Main session getter with automatic token renewal
   */
  async getSession() {
    let tokens = {};

    try {
      tokens = await readYaml(_G.TOKENS_PATH, true);
    } catch (error) {
      // Force-override logging
      process.env.LOG = '*';
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
        const copilotData = await this.getCopilotToken(tokens.github_token);
        tokens.copilot_token = copilotData.token;
        tokens.expires_at = copilotData.expires_at;
        tokens.api_url = copilotData.api_url;
        this.saveTokens(tokens);
        log('debug', '✅ Copilot token refreshed!');
        return { tokens };
      } catch (error) {
        log('warn', '⚠️  Cached GitHub token expired, re-authenticating...');
      }
    }

    // Tier 3: Perform fresh authentication
    tokens = await this.performFreshAuthentication();
    return { tokens };
  }

  /**
   * Get an OpenAI SDK client configuration
   */
  getOpenAIConfig(session) {
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
}
