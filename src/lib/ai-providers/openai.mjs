/**
 * OpenAI Provider (Direct)
 * 
 * Provides direct access to OpenAI models:
 * - gpt-5
 * - gpt-4.5
 * - o1
 * 
 * Configure via OPENAI_API_KEY environment variable
 * API Docs: https://platform.openai.com/docs/api-reference
 * 
 * TODO: Implement when direct OpenAI access is needed (currently using Copilot)
 */

import { BaseProvider } from './base.mjs';
import { log } from '../utils.mjs';

export class OpenAIProvider extends BaseProvider {
  constructor() {
    super();
    this.client = null;
  }

  static getName() {
    return 'OpenAI';
  }

  static getModelPatterns() {
    return [
      /^gpt-5$/,
      /^gpt-4\.5/,
      /^o1$/,
    ];
  }

  static isConfigured() {
    const apiKey = process.env.OPENAI_API_KEY;
    return apiKey && apiKey.length > 0;
  }

  async init() {
    if (this.initialized && this.client) {
      return;
    }

    throw new Error(
      'OpenAI provider is not yet implemented. ' +
      'Please use Copilot provider to access OpenAI models, or contribute an implementation!'
    );
  }

  async createChatCompletion({ model, messages, tools = [], max_tokens, signal }) {
    throw new Error('OpenAI provider not yet implemented');
  }

  async listModels() {
    return [
      { id: 'gpt-5', name: 'GPT-5', description: 'OpenAI GPT-5 (direct, not yet implemented)' },
      { id: 'gpt-4.5', name: 'GPT-4.5', description: 'OpenAI GPT-4.5 (direct, not yet implemented)' },
      { id: 'o1', name: 'o1', description: 'OpenAI o1 (direct, not yet implemented)' },
    ];
  }
}
