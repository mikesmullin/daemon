// Centralized Template Management for v3.0
//
// This module provides a shared template cache and discovery mechanism
// used by both browser mode (serve.mjs) and CLI mode.
//
// CENTRALIZATION RATIONALE:
// - Previously: Template cache duplicated in plugins/observability/serve.mjs
// - Now: Single source of truth for template discovery
// - Benefits: Consistent caching, shared between browser/CLI, easier testing

import fs from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import { log } from './utils.mjs';
import { _G } from './globals.mjs';

class TemplateManager {
  constructor() {
    this.cache = null;
    this.cacheTime = 0;
    this.CACHE_TTL = 60000; // 1 minute in milliseconds
  }

  /**
   * Get all available agent templates
   * Returns cached results if within TTL, otherwise reloads from disk
   * 
   * @param {boolean} forceRefresh - Force cache refresh
   * @returns {Promise<Array>} Array of {name, path} objects
   */
  async getTemplates(forceRefresh = false) {
    const now = Date.now();
    
    // Return cached results if valid
    if (!forceRefresh && this.cache && (now - this.cacheTime) < this.CACHE_TTL) {
      return this.cache;
    }

    // Load templates from disk
    const templates = await this.loadTemplatesFromDisk();
    
    // Update cache
    this.cache = templates;
    this.cacheTime = now;
    
    log('debug', `📚 Loaded ${templates.length} agent templates`);
    
    return templates;
  }

  /**
   * Load all template files from the templates directory
   * @private
   */
  async loadTemplatesFromDisk() {
    try {
      const templatesDir = _G.TEMPLATES_DIR;
      
      if (!existsSync(templatesDir)) {
        log('warn', `Templates directory not found: ${templatesDir}`);
        return [];
      }

      const files = await fs.readdir(templatesDir);
      
      const templates = [];
      for (const file of files) {
        if (file.endsWith('.yaml') || file.endsWith('.yml')) {
          // Exclude documentation files
          if (file.startsWith('NEW_AGENT') || file.startsWith('README')) {
            continue;
          }
          
          templates.push({
            name: file.replace(/\.ya?ml$/, ''),
            path: join('agents', 'templates', file),
            file: file
          });
        }
      }

      // Sort alphabetically by name
      templates.sort((a, b) => a.name.localeCompare(b.name));
      
      return templates;
    } catch (error) {
      log('error', `Failed to load templates: ${error.message}`);
      return [];
    }
  }

  /**
   * Get a specific template by name
   * 
   * @param {string} name - Template name (without .yaml extension)
   * @returns {Promise<Object|null>} Template object or null if not found
   */
  async getTemplate(name) {
    const templates = await this.getTemplates();
    return templates.find(t => t.name === name) || null;
  }

  /**
   * Check if a template exists
   * 
   * @param {string} name - Template name (without .yaml extension)
   * @returns {Promise<boolean>}
   */
  async templateExists(name) {
    const template = await this.getTemplate(name);
    return template !== null;
  }

  /**
   * Clear the template cache
   * Useful after adding/removing templates or for testing
   */
  clearCache() {
    this.cache = null;
    this.cacheTime = 0;
    log('debug', '🧹 Template cache cleared');
  }

  /**
   * Initialize the template cache on startup
   * This ensures the first request is fast by pre-warming the cache
   * 
   * @returns {Promise<void>}
   */
  async initialize() {
    try {
      const templates = await this.getTemplates();
      log('info', `📚 Template manager initialized with ${templates.length} templates`);
    } catch (error) {
      log('error', `Failed to initialize template manager: ${error.message}`);
    }
  }

  /**
   * Get template names for autocomplete/suggestions
   * 
   * @param {string} prefix - Optional prefix to filter by
   * @returns {Promise<Array<string>>} Array of template names
   */
  async getTemplateNames(prefix = '') {
    const templates = await this.getTemplates();
    const names = templates.map(t => t.name);
    
    if (prefix) {
      return names.filter(name => name.toLowerCase().startsWith(prefix.toLowerCase()));
    }
    
    return names;
  }
}

// Export singleton instance
export const templateManager = new TemplateManager();

// Also export the class for testing
export { TemplateManager };
