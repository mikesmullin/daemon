// Message submission handlers
import fs from 'fs/promises';
import yaml from 'js-yaml';
import { join } from 'path';

export class MessageHandlers {
  constructor(server) {
    this.server = server;
    this.workspaceRoot = server.workspaceRoot;
  }

  async handleSubmit(ws, msg, server) {
    const sessionId = String(msg.session_id || msg.sessionId || msg.session);
    const content = String(msg.content || '');
    if (!sessionId || !content) {
      ws.send(JSON.stringify({ type: 'submit:response', ok: false, error: 'missing session_id or content' }));
      return;
    }

    try {
      const result = await this.appendUserMessage(sessionId, content);
      ws.send(JSON.stringify({ type: 'submit:response', ok: true, session_id: sessionId }));

      // Broadcast the new USER_REQUEST event to all clients
      const event = {
        type: 'USER_REQUEST',
        timestamp: new Date().toISOString(),
        daemon_pid: process.pid,
        session_id: sessionId,
        agent: result.agent || 'unknown',
        content,
      };
      server.handleEvent(event);
    } catch (err) {
      ws.send(JSON.stringify({ type: 'submit:response', ok: false, error: err.message }));
    }
  }

  async handleMessageSubmit(ws, msg) {
    try {
      const { channel, agent, content } = msg;
      if (!channel || !agent || !content) {
        ws.send(JSON.stringify({ type: 'message:submitted', ok: false, error: 'missing required fields' }));
        return;
      }

      // Parse agent mention: @alice#12 -> { name: 'alice', session_id: 12 }
      const match = agent.match(/^@?([^#]+)#?(\d+)?$/);
      if (!match) {
        ws.send(JSON.stringify({ type: 'message:submitted', ok: false, error: 'invalid agent format' }));
        return;
      }

      const [, agentName, sessionIdStr] = match;
      
      // Get channel to find session IDs
      const channelPath = join(this.workspaceRoot, 'agents', 'channels', `${channel}.yaml`);
      const channelTxt = await fs.readFile(channelPath, 'utf8');
      const channelData = yaml.load(channelTxt);

      // Determine session ID
      let sessionId;
      if (sessionIdStr) {
        sessionId = parseInt(sessionIdStr);
      } else {
        // Find sessions matching agent name
        const matchingSessions = [];
        for (const sid of channelData.spec.agent_sessions) {
          const sessionPath = join(this.workspaceRoot, 'agents', 'sessions', `${sid}.yaml`);
          try {
            const sessionTxt = await fs.readFile(sessionPath, 'utf8');
            const sessionData = yaml.load(sessionTxt);
            if (sessionData.metadata?.name === agentName) {
              matchingSessions.push(sid);
            }
          } catch (err) {
            // Session file not found, skip
          }
        }

        if (matchingSessions.length === 0) {
          ws.send(JSON.stringify({ type: 'message:submitted', ok: false, error: 'no matching agent found' }));
          return;
        } else if (matchingSessions.length > 1) {
          ws.send(JSON.stringify({ type: 'message:submitted', ok: false, error: 'multiple agents with same name, specify session ID' }));
          return;
        }
        sessionId = matchingSessions[0];
      }

      // Append message to session
      const result = await this.appendUserMessage(sessionId, content);
      
      ws.send(JSON.stringify({ type: 'message:submitted', ok: true, session_id: sessionId }));

      // Broadcast event
      const event = {
        type: 'USER_REQUEST',
        timestamp: new Date().toISOString(),
        daemon_pid: process.pid,
        session_id: sessionId,
        agent: result.agent || agentName,
        content,
        channel
      };
      this.server.handleEvent(event);
    } catch (err) {
      ws.send(JSON.stringify({ type: 'message:submitted', ok: false, error: err.message }));
    }
  }

  async handleToolApprove(ws, msg) {
    try {
      const { session_id, tool_call_id } = msg;
      if (!session_id || !tool_call_id) {
        ws.send(JSON.stringify({ type: 'tool:approved', ok: false, error: 'missing session_id or tool_call_id' }));
        return;
      }

      // TODO: Implement tool approval logic
      ws.send(JSON.stringify({ 
        type: 'tool:approved', 
        ok: false, 
        error: 'tool approval not yet implemented' 
      }));
    } catch (err) {
      ws.send(JSON.stringify({ type: 'tool:approved', ok: false, error: err.message }));
    }
  }

  async handleToolReject(ws, msg) {
    try {
      const { session_id, tool_call_id, reason } = msg;
      if (!session_id || !tool_call_id) {
        ws.send(JSON.stringify({ type: 'tool:rejected', ok: false, error: 'missing session_id or tool_call_id' }));
        return;
      }

      // TODO: Implement tool rejection logic
      ws.send(JSON.stringify({ 
        type: 'tool:rejected', 
        ok: false, 
        error: 'tool rejection not yet implemented' 
      }));
    } catch (err) {
      ws.send(JSON.stringify({ type: 'tool:rejected', ok: false, error: err.message }));
    }
  }

  async handleToolReply(ws, msg) {
    try {
      const { session_id, tool_call_id, content } = msg;
      if (!session_id || !tool_call_id || !content) {
        ws.send(JSON.stringify({ type: 'tool:replied', ok: false, error: 'missing required fields' }));
        return;
      }

      // TODO: Implement tool reply logic (for ask_human)
      ws.send(JSON.stringify({ 
        type: 'tool:replied', 
        ok: false, 
        error: 'tool reply not yet implemented' 
      }));
    } catch (err) {
      ws.send(JSON.stringify({ type: 'tool:replied', ok: false, error: err.message }));
    }
  }

  async appendUserMessage(sessionId, content) {
    // sessions directory relative to workspace
    const sessionsDir = join(this.workspaceRoot, 'agents', 'sessions');
    const procDir = join(this.workspaceRoot, 'agents', 'proc');
    const sessionFile = join(sessionsDir, `${sessionId}.yaml`);

    // Read session YAML
    let sessionData;
    try {
      const txt = await fs.readFile(sessionFile, 'utf8');
      sessionData = yaml.load(txt) || {};
    } catch (err) {
      throw new Error(`Failed to read session ${sessionId}: ${err.message}`);
    }

    // Ensure spec/messages exists
    sessionData.spec = sessionData.spec || {};
    sessionData.spec.messages = sessionData.spec.messages || [];

    const newMessage = {
      ts: new Date().toISOString(),
      role: 'user',
      content: content
    };

    sessionData.spec.messages.push(newMessage);

    // Persist session file
    try {
      const out = yaml.dump(sessionData, { lineWidth: -1, noRefs: true });
      await fs.writeFile(sessionFile, out, 'utf8');
    } catch (err) {
      throw new Error(`Failed to write session ${sessionId}: ${err.message}`);
    }

    // Mark session pending by writing proc file
    try {
      await fs.writeFile(join(procDir, String(sessionId)), 'pending', 'utf8');
    } catch (err) {
      // Non-fatal, but report
      console.error('Failed to mark session pending:', err.message);
    }

    return { ok: true, agent: sessionData.metadata?.name };
  }
}
