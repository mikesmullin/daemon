/**
 * AI Provider Registry
 * 
 * Manages all AI provider implementations and provides:
 * - Auto-detection of provider from model name
 * - Provider instantiation and initialization
 * - Model listing across all providers
 */

import { log } from '../utils.mjs';
import { BaseProvider } from './base.mjs';

class ProviderRegistry {
  constructor() {
    this.providers = new Map();
    this.initialized = false;
  }

  /**
   * Register a provider class
   * @param {typeof BaseProvider} ProviderClass
   */
  register(ProviderClass) {
    const name = ProviderClass.getName();
    this.providers.set(name.toLowerCase(), ProviderClass);
    log('debug', `📦 Registered provider: ${name}`);
  }

  /**
   * Initialize the registry by loading all provider implementations
   */
  async init() {
    if (this.initialized) return;

    try {
      // Dynamically import all provider implementations
      const { CopilotProvider } = await import('./copilot.mjs');
      const { GeminiProvider } = await import('./gemini.mjs');
      const { OllamaProvider } = await import('./ollama.mjs');
      const { XAIProvider } = await import('./xai.mjs');
      const { AnthropicProvider } = await import('./anthropic.mjs');
      const { OpenAIProvider } = await import('./openai.mjs');
      const { ZAIProvider } = await import('./zai.mjs');

      // Register all providers
      this.register(CopilotProvider);
      this.register(GeminiProvider);
      this.register(OllamaProvider);
      this.register(XAIProvider);
      this.register(AnthropicProvider);
      this.register(OpenAIProvider);
      this.register(ZAIProvider);

      this.initialized = true;
      log('debug', `✅ Provider registry initialized with ${this.providers.size} providers`);
    } catch (error) {
      log('error', `Failed to initialize provider registry: ${error.message}`);
      throw error;
    }
  }

  /**
   * Detect provider from model name
   * Supports both explicit (provider:model) and implicit (model) formats
   * @param {string} modelName - Model name to analyze
   * @returns {string|null} Provider name or null if not detected
   */
  detectProvider(modelName) {
    if (!modelName) return null;

    // Check for explicit provider prefix (e.g., "ollama:qwen3:8b")
    if (modelName.includes(':')) {
      const prefix = modelName.split(':')[0];
      if (this.providers.has(prefix)) {
        return prefix;
      }
    }

    // Try to auto-detect from model name patterns
    for (const [name, ProviderClass] of this.providers.entries()) {
      const patterns = ProviderClass.getModelPatterns();
      for (const pattern of patterns) {
        if (pattern.test(modelName)) {
          return name;
        }
      }
    }

    return null;
  }

  /**
   * Get a provider instance for a given model
   * @param {string} modelName - Model name
   * @returns {Promise<BaseProvider>} Provider instance
   */
  async getProvider(modelName) {
    await this.init();

    let providerName = this.detectProvider(modelName);

    if (!providerName) {
      // Fall back to Copilot for backward compatibility
      log('debug', `⚠️  Could not auto-detect provider for model "${modelName}", falling back to Copilot. Consider using explicit provider prefix (e.g., "copilot:${modelName}").`);
      providerName = 'copilot';
    }

    const ProviderClass = this.providers.get(providerName);
    if (!ProviderClass) {
      throw new Error(`Provider "${providerName}" not found in registry`);
    }

    // Check if provider is configured
    if (!ProviderClass.isConfigured()) {
      throw new Error(
        `Provider "${providerName}" is not configured. ` +
        `Please set the required environment variables.`
      );
    }

    // Create and initialize provider instance
    const provider = new ProviderClass();
    await provider.init();

    log('debug', `✅ Using provider: ${providerName} for model: ${modelName}`);
    return provider;
  }

  /**
   * Strip provider prefix from model name if present
   * @param {string} modelName - Model name (possibly with provider prefix)
   * @returns {string} Model name without provider prefix
   */
  stripProviderPrefix(modelName) {
    if (!modelName || !modelName.includes(':')) {
      return modelName;
    }

    const parts = modelName.split(':');
    const potentialProvider = parts[0];

    // Only strip if it's a known provider prefix
    if (this.providers.has(potentialProvider.toLowerCase())) {
      return parts.slice(1).join(':');
    }

    return modelName;
  }

  /**
   * List all available models from all configured providers
   * @returns {Promise<Array>} Array of model objects grouped by provider
   */
  async listAllModels() {
    await this.init();

    const results = [];

    for (const [name, ProviderClass] of this.providers.entries()) {
      try {
        // Skip providers that are not configured
        if (!ProviderClass.isConfigured()) {
          log('debug', `⏭️  Skipping ${name} provider (not configured)`);
          results.push({
            provider: name,
            configured: false,
            models: [],
            error: 'Not configured - missing API key or configuration'
          });
          continue;
        }

        // Create and initialize provider
        const provider = new ProviderClass();
        await provider.init();

        // List models
        const models = await provider.listModels();

        results.push({
          provider: name,
          configured: true,
          models: models,
          count: models.length
        });

        log('debug', `✅ Listed ${models.length} models from ${name}`);
      } catch (error) {
        log('error', `❌ Failed to list models from ${name}: ${error.message}`);
        results.push({
          provider: name,
          configured: true,
          models: [],
          error: error.message
        });
      }
    }

    return results;
  }

  /**
   * Get list of all registered provider names
   * @returns {Array<string>} Provider names
   */
  getProviderNames() {
    return Array.from(this.providers.keys());
  }
}

// Export singleton instance
export const registry = new ProviderRegistry();
