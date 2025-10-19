/**
 * Ollama Provider
 * 
 * Provides access to local Ollama server for running open-source models:
 * - qwen3:8b
 * - llama3.3
 * - mistral
 * - codellama
 * - And any other models installed locally
 * 
 * Configure via OLLAMA_BASE_URL (default: http://localhost:11434)
 */

import { BaseProvider } from './base.mjs';
import { log } from '../utils.mjs';
import { Ollama } from 'ollama';

export class OllamaProvider extends BaseProvider {
  constructor() {
    super();
    this.client = null;
    this.baseUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
  }

  static getName() {
    return 'Ollama';
  }

  static getModelPatterns() {
    return [
      /^qwen/,
      /^llama/,
      /^mistral/,
      /^codellama/,
      /^deepseek/,
      /^phi/,
      /^gemma/,
      // Generic pattern for ollama models (name:tag format)
      /^[a-z0-9-]+:[a-z0-9.]+$/,
    ];
  }

  static isConfigured() {
    // Ollama is always "configured" if running locally
    // We'll check connectivity during init()
    return true;
  }

  async init() {
    if (this.initialized && this.client) {
      return;
    }

    try {
      this.client = new Ollama({ host: this.baseUrl });

      // Test connectivity by listing models
      await this.client.list();

      this.initialized = true;
      log('debug', `✅ Ollama provider initialized (${this.baseUrl})`);
    } catch (error) {
      throw new Error(
        `Failed to connect to Ollama server at ${this.baseUrl}. ` +
        `Make sure Ollama is running. Error: ${error.message}`
      );
    }
  }

  /**
   * Convert OpenAI-style tool definitions to Ollama format
   */
  convertToolsToOllama(tools) {
    if (!tools || tools.length === 0) return undefined;

    return tools.map(tool => ({
      type: 'function',
      function: {
        name: tool.function.name,
        description: tool.function.description,
        parameters: tool.function.parameters,
      }
    }));
  }

  async createChatCompletion({ model, messages, tools = [], max_tokens }) {
    const startTime = Date.now();
    let firstTokenTime = null;
    let tokenCount = 0;

    try {
      const ollamaTools = this.convertToolsToOllama(tools);

      const options = {
        model: model,
        messages: messages,
        stream: false,
        options: {}
      };

      if (max_tokens) {
        options.options.num_predict = max_tokens;
      }

      if (ollamaTools && ollamaTools.length > 0) {
        options.tools = ollamaTools;
      }

      const response = await this.client.chat(options);

      const endTime = Date.now();
      firstTokenTime = endTime; // Approximation for non-streaming

      // Parse tool calls if present
      let toolCalls = undefined;
      if (response.message.tool_calls && response.message.tool_calls.length > 0) {
        toolCalls = response.message.tool_calls.map((tc, idx) => ({
          id: `call_${Date.now()}_${idx}`,
          type: 'function',
          function: {
            name: tc.function.name,
            arguments: JSON.stringify(tc.function.arguments),
          }
        }));
      }

      const totalTime = (endTime - startTime) / 1000;

      // Extract token counts from response
      const promptTokens = response.prompt_eval_count || 0;
      const completionTokens = response.eval_count || 0;
      tokenCount = completionTokens;

      // Determine finish reason
      let finishReason = 'stop';
      if (toolCalls && toolCalls.length > 0) {
        finishReason = 'tool_calls';
      } else if (response.done_reason === 'length') {
        finishReason = 'length';
      }

      // Normalize to OpenAI format
      return {
        id: `ollama-${Date.now()}`,
        created: Math.floor(endTime / 1000), // Use endTime when response completed, not startTime
        model: model,
        choices: [{
          index: 0,
          message: {
            role: 'assistant',
            content: response.message.content || null,
            tool_calls: toolCalls,
          },
          finish_reason: finishReason,
        }],
        usage: {
          prompt_tokens: promptTokens,
          completion_tokens: completionTokens,
          total_tokens: promptTokens + completionTokens,
        },
        metrics: {
          tokens_per_second: completionTokens / totalTime,
          time_to_first_token_ms: firstTokenTime - startTime,
        }
      };
    } catch (error) {
      log('error', `Ollama API error: ${error.message}`);
      throw error;
    }
  }

  async listModels() {
    try {
      const response = await this.client.list();

      return response.models.map(m => ({
        id: m.name,
        name: m.name,
        description: `Ollama model (${this.formatSize(m.size)}, modified: ${new Date(m.modified_at).toLocaleDateString()})`,
      }));
    } catch (error) {
      log('error', `Failed to list Ollama models: ${error.message}`);
      return [];
    }
  }

  /**
   * Format file size in human-readable format
   */
  formatSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}
