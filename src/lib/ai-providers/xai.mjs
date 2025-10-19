/**
 * xAI Provider
 * 
 * Provides access to xAI Grok models:
 * - grok-code-fast-1
 * - grok-beta
 * - grok-vision-beta
 * 
 * xAI API is OpenAI-compatible, using the OpenAI SDK with custom base URL
 * Configure via XAI_API_KEY environment variable
 * API Docs: https://docs.x.ai/api
 */

import { BaseProvider } from './base.mjs';
import { log } from '../utils.mjs';
import OpenAI from 'openai';

export class XAIProvider extends BaseProvider {
  constructor() {
    super();
    this.client = null;
  }

  static getName() {
    return 'xAI';
  }

  static getModelPatterns() {
    return [
      /^grok-/,
    ];
  }

  static isConfigured() {
    const apiKey = process.env.XAI_API_KEY;
    return apiKey && apiKey.length > 0;
  }

  async init() {
    if (this.initialized && this.client) {
      return;
    }

    const apiKey = process.env.XAI_API_KEY;
    if (!apiKey) {
      throw new Error(
        'xAI API key not found. Please set XAI_API_KEY in your .env file. ' +
        'Get your API key from: https://console.x.ai'
      );
    }

    this.client = new OpenAI({
      apiKey: apiKey,
      baseURL: 'https://api.x.ai/v1',
    });

    this.initialized = true;
    log('debug', '✅ xAI provider initialized');
  }

  async createChatCompletion({ model, messages, tools = [], max_tokens }) {
    const startTime = Date.now();
    let firstTokenTime = null;

    try {
      const response = await this.client.chat.completions.create({
        model: model,
        messages: messages,
        tools: tools.length > 0 ? tools : undefined,
        max_tokens: max_tokens,
        stream: false,
      });

      firstTokenTime = Date.now();
      const endTime = Date.now();
      const totalTime = (endTime - startTime) / 1000;
      const tokensGenerated = response.usage?.completion_tokens || 0;

      // Add metrics
      response.metrics = {
        tokens_per_second: tokensGenerated / totalTime,
        time_to_first_token_ms: firstTokenTime - startTime,
      };

      return this.normalizeResponse(response);
    } catch (error) {
      log('error', `xAI API error: ${error.message}`);
      throw error;
    }
  }

  async listModels() {
    try {
      const response = await this.client.models.list();

      return response.data.map(m => ({
        id: m.id,
        name: m.id,
        description: `xAI ${m.id}`,
      }));
    } catch (error) {
      // Fallback to known models if API call fails
      log('debug', `Could not fetch xAI models list: ${error.message}`);
      return [
        { id: 'grok-code-fast-1', name: 'Grok Code Fast 1', description: 'xAI Grok optimized for coding tasks' },
        { id: 'grok-beta', name: 'Grok Beta', description: 'xAI Grok beta model' },
        { id: 'grok-vision-beta', name: 'Grok Vision Beta', description: 'xAI Grok with vision capabilities' },
      ];
    }
  }
}
