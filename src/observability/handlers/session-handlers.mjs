// Session editing handlers
import fs from 'fs/promises';
import yaml from 'js-yaml';
import { join } from 'path';

export class SessionHandlers {
  constructor(server, workspaceRoot) {
    this.server = server;
    this.workspaceRoot = workspaceRoot;
  }

  async handleUpdate(ws, msg) {
    const { session_id, event, yaml: yamlContent } = msg;
    
    if (!session_id) {
      throw new Error('Session ID is required');
    }

    const sessionFile = join(this.workspaceRoot, 'agents', 'sessions', `${session_id}.yaml`);
    
    // Read existing session file
    let sessionData;
    try {
      const existingContent = await fs.readFile(sessionFile, 'utf8');
      sessionData = yaml.load(existingContent);
    } catch (err) {
      throw new Error(`Failed to read session file: ${err.message}`);
    }

    if (!sessionData) {
      throw new Error(`Session ${session_id} not found`);
    }

    // Validate the updated event YAML
    let updatedEvent;
    try {
      updatedEvent = yaml.load(yamlContent);
    } catch (err) {
      throw new Error(`Invalid YAML: ${err.message}`);
    }

    // Find and update the specific event in the messages array
    if (!sessionData.spec || !Array.isArray(sessionData.spec.messages)) {
      sessionData.spec = sessionData.spec || {};
      sessionData.spec.messages = [];
    }

    // Find the event by timestamp (check both 'ts' and 'timestamp' fields)
    const eventTimestamp = updatedEvent.timestamp || updatedEvent.ts;
    const eventIdx = sessionData.spec.messages.findIndex(m => 
      m.timestamp === eventTimestamp || m.ts === eventTimestamp
    );

    if (eventIdx >= 0) {
      // Replace the message with the edited version directly
      sessionData.spec.messages[eventIdx] = updatedEvent;
    } else {
      // Event not found - this shouldn't happen in edit flow
      throw new Error(`Event with timestamp ${eventTimestamp} not found in session ${session_id}`);
    }

    // Write updated session back to file
    const updatedYaml = yaml.dump(sessionData, {
      indent: 2,
      lineWidth: 120,
      noRefs: true,
      sortKeys: false
    });
    await fs.writeFile(sessionFile, updatedYaml, 'utf8');

    // Send updated session back to requesting client
    ws.send(JSON.stringify({
      type: 'session:updated',
      session_id,
      session: sessionData
    }));

    // Broadcast update to all clients
    this.server.broadcast({
      type: 'session:updated',
      session_id,
      session: sessionData
    });
  }
}
