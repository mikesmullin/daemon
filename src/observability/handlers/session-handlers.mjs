// Session editing handlers
import fs from 'fs/promises';
import yaml from 'js-yaml';
import { join } from 'path';

export class SessionHandlers {
  constructor(channelManager, workspaceRoot) {
    this.channelManager = channelManager;
    this.workspaceRoot = workspaceRoot;
  }

  async handleUpdate(ws, msg) {
    const { session_id, yaml: yamlContent } = msg;
    
    if (!session_id || !yamlContent) {
      throw new Error('Session ID and YAML content are required');
    }

    // Validate YAML
    try {
      yaml.load(yamlContent);
    } catch (err) {
      throw new Error(`Invalid YAML: ${err.message}`);
    }

    // Write to session file
    const sessionFile = join(this.workspaceRoot, 'agents', 'sessions', `${session_id}.yaml`);
    await fs.writeFile(sessionFile, yamlContent, 'utf8');

    ws.send(JSON.stringify({
      type: 'session:updated',
      session_id
    }));

    // Emit event
    this.channelManager.emit('session:updated', {
      session_id
    });
  }
}
