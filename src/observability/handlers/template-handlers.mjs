// Template management handlers
import fs from 'fs/promises';
import yaml from 'js-yaml';
import { join } from 'path';
import { templateManager } from '../../lib/templates.mjs';

export class TemplateHandlers {
  constructor(workspaceRoot) {
    this.workspaceRoot = workspaceRoot;
    this.templatesDir = join(workspaceRoot, 'agents', 'templates');
  }

  async handleList(ws) {
    const templates = await templateManager.getTemplates();
    
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

    // Invalidate centralized cache
    templateManager.clearCache();

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

    // Invalidate centralized cache
    templateManager.clearCache();

    ws.send(JSON.stringify({
      type: 'template:delete:response',
      name
    }));
  }

  async handleAutocomplete(ws, msg) {
    const { query } = msg;
    
    // Get template names from centralized manager
    const names = await templateManager.getTemplateNames();
    
    // Filter by query
    const lowerQuery = (query || '').toLowerCase();
    const suggestions = names
      .filter(name => name.toLowerCase().includes(lowerQuery))
      .slice(0, 10) // Limit to 10 suggestions
      .map(name => ({ name }));

    ws.send(JSON.stringify({
      type: 'template:autocomplete:response',
      suggestions
    }));
  }
}
