/**
 * Google Gemini Provider
 * 
 * Provides access to Google Gemini models for chat completions:
 * - gemini-2.0-flash-exp
 * - gemini-1.5-pro
 * - gemini-1.5-flash
 * 
 * Note: Image generation is handled separately in tools/gemini-image.mjs
 */

import { BaseProvider } from './base.mjs';
import { log } from '../utils.mjs';
import { GoogleGenerativeAI } from '@google/generative-ai';

export class GeminiProvider extends BaseProvider {
  constructor() {
    super();
    this.client = null;
  }

  static getName() {
    return 'Gemini';
  }

  static getModelPatterns() {
    return [
      /^gemini-/,
      /^models\/gemini-/,
    ];
  }

  static isConfigured() {
    const apiKey = process.env.GOOGLE_AI_API_KEY;
    return apiKey && apiKey !== 'your_google_ai_api_key_here';
  }

  async init() {
    if (this.initialized && this.client) {
      return;
    }

    const apiKey = process.env.GOOGLE_AI_API_KEY;
    if (!apiKey || apiKey === 'your_google_ai_api_key_here') {
      throw new Error(
        'Google AI API key not found. Please set GOOGLE_AI_API_KEY in your .env file. ' +
        'Get your API key from: https://aistudio.google.com/apikey'
      );
    }

    this.client = new GoogleGenerativeAI(apiKey);
    this.initialized = true;
    log('debug', '✅ Gemini provider initialized');
  }

  /**
   * Convert OpenAI-style messages to Gemini format
   */
  convertMessagesToGemini(messages) {
    const contents = [];
    let systemInstruction = '';

    for (const msg of messages) {
      if (msg.role === 'system') {
        systemInstruction += msg.content + '\n';
      } else if (msg.role === 'user') {
        contents.push({
          role: 'user',
          parts: [{ text: msg.content }]
        });
      } else if (msg.role === 'assistant') {
        if (msg.content) {
          contents.push({
            role: 'model',
            parts: [{ text: msg.content }]
          });
        }
        // Gemini doesn't support tool calls in the same way
        // We'll handle this by appending tool call info to the content
        if (msg.tool_calls) {
          const toolCallText = msg.tool_calls.map(tc =>
            `Tool call: ${tc.function.name}(${tc.function.arguments})`
          ).join('\n');
          contents.push({
            role: 'model',
            parts: [{ text: toolCallText }]
          });
        }
      } else if (msg.role === 'tool') {
        // Convert tool results to user messages
        contents.push({
          role: 'user',
          parts: [{ text: `Tool result: ${msg.content}` }]
        });
      }
    }

    return { systemInstruction: systemInstruction.trim(), contents };
  }

  /**
   * Convert Gemini function declarations to OpenAI tool format
   */
  convertToolsToGemini(tools) {
    if (!tools || tools.length === 0) return null;

    return tools.map(tool => ({
      name: tool.function.name,
      description: tool.function.description,
      parameters: tool.function.parameters,
    }));
  }

  async createChatCompletion({ model, messages, tools = [], max_tokens }) {
    const startTime = Date.now();

    // Convert messages
    const { systemInstruction, contents } = this.convertMessagesToGemini(messages);

    // Get the model
    const geminiModel = this.client.getGenerativeModel({
      model: model.replace('models/', ''),
      systemInstruction: systemInstruction || undefined,
    });

    // Convert tools if provided
    const geminiTools = this.convertToolsToGemini(tools);

    try {
      let result;
      if (geminiTools && geminiTools.length > 0) {
        // Note: Gemini's function calling API is different from OpenAI's
        // For now, we'll use basic chat without tool support
        log('warn', '⚠️  Gemini provider does not yet support tool calls, proceeding without tools');
        result = await geminiModel.generateContent({
          contents: contents,
          generationConfig: {
            maxOutputTokens: max_tokens,
          },
        });
      } else {
        result = await geminiModel.generateContent({
          contents: contents,
          generationConfig: {
            maxOutputTokens: max_tokens,
          },
        });
      }

      const endTime = Date.now();
      const totalTime = (endTime - startTime) / 1000;

      // Extract response
      const response = result.response;
      const text = response.text();

      // Calculate metrics
      const usageMetadata = response.usageMetadata || {};
      const tokensGenerated = usageMetadata.candidatesTokenCount || 0;

      // Normalize to OpenAI format
      return {
        id: `gemini-${Date.now()}`,
        created: Math.floor(startTime / 1000),
        model: model,
        choices: [{
          index: 0,
          message: {
            role: 'assistant',
            content: text,
          },
          finish_reason: 'stop',
        }],
        usage: {
          prompt_tokens: usageMetadata.promptTokenCount || 0,
          completion_tokens: tokensGenerated,
          total_tokens: usageMetadata.totalTokenCount || 0,
        },
        metrics: {
          tokens_per_second: tokensGenerated / totalTime,
          time_to_first_token_ms: endTime - startTime,
        }
      };
    } catch (error) {
      log('error', `Gemini API error: ${error.message}`);
      throw error;
    }
  }

  async listModels() {
    try {
      // Note: The GoogleGenerativeAI SDK doesn't have a simple listModels method
      // Returning known models instead
      log('debug', 'Returning known Gemini models');
      return [
        { id: 'gemini-2.0-flash-exp', name: 'Gemini 2.0 Flash (Experimental)', description: 'Latest experimental Gemini model' },
        { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', description: 'Google Gemini 1.5 Pro' },
        { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash', description: 'Google Gemini 1.5 Flash' },
      ];
    } catch (error) {
      // Fallback to known models if API call fails
      log('debug', `Could not fetch Gemini models list: ${error.message}`);
      return [
        { id: 'gemini-2.0-flash-exp', name: 'Gemini 2.0 Flash (Experimental)', description: 'Latest experimental Gemini model' },
        { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', description: 'Google Gemini 1.5 Pro' },
        { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash', description: 'Google Gemini 1.5 Flash' },
      ];
    }
  }
}
