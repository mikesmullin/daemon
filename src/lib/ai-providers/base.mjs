/**
 * Base Provider Class
 * 
 * Abstract base class for AI provider implementations.
 * All providers must extend this class and implement the required methods.
 */

import { log } from '../utils.mjs';

export class BaseProvider {
  constructor(config = {}) {
    this.config = config;
    this.initialized = false;
  }

  /**
   * Get the provider name
   * @returns {string} Provider name (e.g., 'copilot', 'ollama', 'xai')
   */
  static getName() {
    throw new Error('Provider must implement static getName() method');
  }

  /**
   * Get model patterns that this provider can handle
   * Used for auto-detection of provider from model name
   * @returns {RegExp[]} Array of regex patterns
   */
  static getModelPatterns() {
    throw new Error('Provider must implement static getModelPatterns() method');
  }

  /**
   * Check if this provider is configured (has necessary API keys/config)
   * @returns {boolean} True if provider is ready to use
   */
  static isConfigured() {
    throw new Error('Provider must implement static isConfigured() method');
  }

  /**
   * Initialize the provider (authenticate, setup client, etc.)
   * @returns {Promise<void>}
   */
  async init() {
    throw new Error('Provider must implement init() method');
  }

  /**
   * Create a chat completion
   * @param {Object} params
   * @param {string} params.model - Model name
   * @param {Array} params.messages - Array of message objects
   * @param {Array} [params.tools] - Optional tool definitions
   * @param {number} [params.max_tokens] - Optional max tokens
   * @returns {Promise<Object>} Standardized response object
   */
  async createChatCompletion({ model, messages, tools = [], max_tokens }) {
    throw new Error('Provider must implement createChatCompletion() method');
  }

  /**
   * List available models from this provider
   * @returns {Promise<Array>} Array of model objects with { id, name, description }
   */
  async listModels() {
    throw new Error('Provider must implement listModels() method');
  }

  /**
   * Normalize provider-specific response to standard format
   * Standard format matches OpenAI response structure:
   * {
   *   id: string,
   *   created: number (unix timestamp),
   *   model: string,
   *   choices: [{
   *     index: number,
   *     message: {
   *       role: 'assistant',
   *       content: string,
   *       tool_calls: [{ id, type: 'function', function: { name, arguments } }]
   *     },
   *     finish_reason: 'stop' | 'tool_calls' | 'length' | 'content_filter'
   *   }],
   *   usage: {
   *     prompt_tokens: number,
   *     completion_tokens: number,
   *     total_tokens: number
   *   },
   *   metrics: {
   *     tokens_per_second: number (optional),
   *     time_to_first_token_ms: number (optional),
   *     quota_used: number (optional),
   *     quota_remaining: number (optional)
   *   }
   * }
   * @param {Object} response - Provider-specific response
   * @returns {Object} Normalized response
   */
  normalizeResponse(response) {
    // Default implementation assumes OpenAI-compatible format
    return response;
  }

  /**
   * Extract and format usage metrics for logging
   * @param {Object} response - Normalized response object
   * @returns {string} Formatted metrics string
   */
  formatMetrics(response) {
    const parts = [];

    if (response.usage) {
      if (response.usage.total_tokens) {
        parts.push(`${response.usage.total_tokens} tok`);
      }
    }

    if (response.metrics) {
      if (response.metrics.tokens_per_second) {
        parts.push(`${response.metrics.tokens_per_second.toFixed(2)} tok/s`);
      }
      if (response.metrics.time_to_first_token_ms) {
        parts.push(`${(response.metrics.time_to_first_token_ms / 1000).toFixed(3)} s TTFT`);
      }
      if (response.metrics.quota_used !== undefined && response.metrics.quota_remaining !== undefined) {
        parts.push(`Quota: ${response.metrics.quota_used}/${response.metrics.quota_used + response.metrics.quota_remaining}`);
      }
    }

    return parts.length > 0 ? `📊 ${parts.join(' | ')}` : '';
  }

  /**
   * Log metrics if available
   * @param {Object} response - Normalized response object
   */
  logMetrics(response) {
    const metrics = this.formatMetrics(response);
    if (metrics) {
      log('info', metrics);
    }
  }
}
