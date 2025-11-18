/**
 * z.ai Provider
 * 
 * Provides access to z.ai models:
 * - GLM-4
 * - GLM-3
 * 
 * Configure via ZAI_API_KEY environment variable
 * 
 * TODO: Implement when z.ai API documentation is available
 */

import { BaseProvider } from './base.mjs';
import { log } from '../utils.mjs';

export class ZAIProvider extends BaseProvider {
  constructor() {
    super();
    this.client = null;
  }

  static getName() {
    return 'Z.ai';
  }

  static getModelPatterns() {
    return [
      /^glm-/i,
    ];
  }

  static isConfigured() {
    const apiKey = process.env.ZAI_API_KEY;
    return apiKey && apiKey.length > 0;
  }

  async init() {
    if (this.initialized && this.client) {
      return;
    }

    throw new Error(
      'z.ai provider is not yet implemented. ' +
      'Please contribute an implementation when z.ai API documentation is available!'
    );
  }

  async createChatCompletion({ model, messages, tools = [], max_tokens, signal }) {
    throw new Error('z.ai provider not yet implemented');
  }

  async listModels() {
    return [
      { id: 'GLM-4', name: 'GLM-4', description: 'z.ai GLM-4 (not yet implemented)' },
      { id: 'GLM-3', name: 'GLM-3', description: 'z.ai GLM-3 (not yet implemented)' },
    ];
  }
}
