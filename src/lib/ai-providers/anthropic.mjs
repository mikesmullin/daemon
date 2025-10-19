/**
 * Anthropic Provider (Direct)
 * 
 * Provides direct access to Anthropic Claude models:
 * - claude-sonnet-4.5
 * - claude-opus-4
 * - claude-3.5-sonnet
 * 
 * Configure via ANTHROPIC_API_KEY environment variable
 * API Docs: https://docs.anthropic.com/
 * 
 * TODO: Implement when @anthropic-ai/sdk is installed
 */

import { BaseProvider } from './base.mjs';
import { log } from '../utils.mjs';

export class AnthropicProvider extends BaseProvider {
  constructor() {
    super();
    this.client = null;
  }

  static getName() {
    return 'anthropic';
  }

  static getModelPatterns() {
    return [
      /^claude-sonnet-4\.5$/,
      /^claude-opus-4$/,
      /^claude-3\./,
    ];
  }

  static isConfigured() {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    return apiKey && apiKey.length > 0;
  }

  async init() {
    if (this.initialized && this.client) {
      return;
    }

    throw new Error(
      'Anthropic provider is not yet implemented. ' +
      'Please use Copilot provider to access Claude models, or contribute an implementation!'
    );
  }

  async createChatCompletion({ model, messages, tools = [], max_tokens }) {
    throw new Error('Anthropic provider not yet implemented');
  }

  async listModels() {
    return [
      { id: 'claude-sonnet-4.5', name: 'Claude Sonnet 4.5', description: 'Anthropic Claude Sonnet 4.5 (direct, not yet implemented)' },
      { id: 'claude-opus-4', name: 'Claude Opus 4', description: 'Anthropic Claude Opus 4 (direct, not yet implemented)' },
      { id: 'claude-3.5-sonnet', name: 'Claude 3.5 Sonnet', description: 'Anthropic Claude 3.5 Sonnet (direct, not yet implemented)' },
    ];
  }
}
