// Template management handlers
import fs from 'fs/promises';
import yaml from 'js-yaml';
import { join } from 'path';

export class TemplateHandlers {
  constructor(workspaceRoot) {
    this.workspaceRoot = workspaceRoot;
    this.templatesDir = join(workspaceRoot, 'agents', 'templates');
    
    // Cache
    this.cache = null;
    this.cacheExpiry = 0;
    this.cacheTTL = 60000; // 1 minute
  }

  async handleList(ws) {
    const templates = await this.loadTemplates();
    
    ws.send(JSON.stringify({
      type: 'template:list:response',
      templates
    }));
  }

  async handleGet(ws, msg) {
    const { name } = msg;
    
    if (!name) {
      throw new Error('Template name is required');
    }

    const templatePath = join(this.templatesDir, `${name}.yaml`);
    const content = await fs.readFile(templatePath, 'utf8');

    ws.send(JSON.stringify({
      type: 'template:get:response',
      name,
      content
    }));
  }

  async handleSave(ws, msg) {
    const { name, yaml: yamlContent } = msg;
    
    if (!name || !yamlContent) {
      throw new Error('Template name and YAML content are required');
    }

    // Validate YAML
    try {
      yaml.load(yamlContent);
    } catch (err) {
      throw new Error(`Invalid YAML: ${err.message}`);
    }

    // Write to template file
    const templatePath = join(this.templatesDir, `${name}.yaml`);
    await fs.writeFile(templatePath, yamlContent, 'utf8');

    // Invalidate cache
    this.cache = null;

    ws.send(JSON.stringify({
      type: 'template:save:response',
      name
    }));
  }

  async handleDelete(ws, msg) {
    const { name } = msg;
    
    if (!name) {
      throw new Error('Template name is required');
    }

    const templatePath = join(this.templatesDir, `${name}.yaml`);
    await fs.unlink(templatePath);

    // Invalidate cache
    this.cache = null;

    ws.send(JSON.stringify({
      type: 'template:delete:response',
      name
    }));
  }

  async handleAutocomplete(ws, msg) {
    const { query } = msg;
    
    // Load templates with caching
    const templates = await this.loadTemplates(true);
    
    // Filter by query
    const lowerQuery = (query || '').toLowerCase();
    const suggestions = templates
      .filter(t => t.name.toLowerCase().includes(lowerQuery))
      .slice(0, 10); // Limit to 10 suggestions

    ws.send(JSON.stringify({
      type: 'template:autocomplete:response',
      suggestions
    }));
  }

  async loadTemplates(useCache = false) {
    // Check cache
    if (useCache && this.cache && Date.now() < this.cacheExpiry) {
      return this.cache;
    }

    const files = await fs.readdir(this.templatesDir, { recursive: true });
    
    const templates = [];
    
    for (const file of files) {
      if (file.endsWith('.yaml') || file.endsWith('.yml')) {
        const name = file.replace(/\.ya?ml$/, '');
        templates.push({ name, path: file });
      }
    }

    // Update cache
    if (useCache) {
      this.cache = templates;
      this.cacheExpiry = Date.now() + this.cacheTTL;
    }

    return templates;
  }
}
