// PTY operation handlers
import { log } from '../../lib/utils.mjs';
import { ptyManager } from '../../../plugins/shell/pty-manager.mjs';

export class PtyHandlers {
  constructor(observabilityServer) {
    this.server = observabilityServer;
  }

  /**
   * Handle PTY attach request from client
   * Starts streaming PTY output to the client
   */
  handleAttach(ws, msg) {
    const { session_id } = msg;
    
    if (!session_id) {
      throw new Error('PTY session ID is required');
    }

    // Parse session_id format: "agentId:ptyId"
    const parts = session_id.split(':');
    if (parts.length !== 2) {
      throw new Error('Invalid PTY session ID format. Expected "agentId:ptyId"');
    }

    const [agentSessionId, ptySessionId] = parts;
    
    // Check if PTY session exists
    const session = ptyManager.getSession(agentSessionId, ptySessionId);
    if (!session) {
      ws.send(JSON.stringify({
        type: 'error',
        error: `PTY session not found: ${session_id}`
      }));
      return;
    }

    // Add to client's PTY subscriptions
    if (!ws.ptySubscriptions) {
      ws.ptySubscriptions = new Set();
    }
    ws.ptySubscriptions.add(session_id);
    
    // Start streaming to this client
    this.server.startPtyStreaming(session_id, agentSessionId, ptySessionId, ws);
    
    log('debug', `PTY attached: ${session_id}`);
    
    // Send current buffer content to get client up to speed
    const buffer = session.read({ lines: session.rows });
    
    ws.send(JSON.stringify({
      type: 'pty:attached',
      session_id,
      initial_content: buffer.content,
      info: session.getInfo()
    }));
  }

  /**
   * Handle PTY detach request from client
   * Stops streaming PTY output to the client
   */
  handleDetach(ws, msg) {
    const { session_id } = msg;
    
    if (!session_id) {
      throw new Error('PTY session ID is required');
    }

    // Remove from client's PTY subscriptions
    if (ws.ptySubscriptions) {
      ws.ptySubscriptions.delete(session_id);
    }
    
    // Stop streaming for this client
    this.server.stopPtyStreaming(session_id, ws);
    
    log('debug', `PTY detached: ${session_id}`);
    
    ws.send(JSON.stringify({
      type: 'pty:detached',
      session_id
    }));
  }

  /**
   * Handle keyboard input from client
   * Forwards input to the PTY session
   */
  async handleInput(ws, msg) {
    const { session_id, data } = msg;
    
    if (!session_id || data === undefined) {
      throw new Error('PTY session ID and data are required');
    }

    // Parse session_id format: "agentId:ptyId"
    const parts = session_id.split(':');
    if (parts.length !== 2) {
      throw new Error('Invalid PTY session ID format. Expected "agentId:ptyId"');
    }

    const [agentSessionId, ptySessionId] = parts;
    
    // Get PTY session
    const session = ptyManager.getSession(agentSessionId, ptySessionId);
    if (!session) {
      ws.send(JSON.stringify({
        type: 'error',
        error: `PTY session not found: ${session_id}`
      }));
      return;
    }

    // Write input to PTY
    try {
      session.write(data);
      log('debug', `PTY input sent to ${session_id}: ${data.replace(/\r/g, '\\r').replace(/\n/g, '\\n').substring(0, 50)}`);
    } catch (err) {
      log('error', `Failed to send PTY input: ${err.message}`);
      ws.send(JSON.stringify({
        type: 'error',
        error: `Failed to send input to PTY: ${err.message}`
      }));
    }
  }

  /**
   * Handle PTY close request from client
   * Closes the PTY session
   */
  handleClose(ws, msg) {
    const { session_id } = msg;
    
    if (!session_id) {
      throw new Error('PTY session ID is required');
    }

    // Parse session_id format: "agentId:ptyId"
    const parts = session_id.split(':');
    if (parts.length !== 2) {
      throw new Error('Invalid PTY session ID format. Expected "agentId:ptyId"');
    }

    const [agentSessionId, ptySessionId] = parts;
    
    // Close the PTY session
    const closed = this.server.closePtySession(agentSessionId, ptySessionId);
    
    if (closed) {
      log('debug', `PTY closed: ${session_id}`);
      ws.send(JSON.stringify({
        type: 'pty:closed',
        session_id
      }));
    } else {
      ws.send(JSON.stringify({
        type: 'error',
        error: `PTY session not found: ${session_id}`
      }));
    }
  }

  /**
   * Cleanup when WebSocket client disconnects
   */
  cleanup(ws) {
    // Remove client from all PTY subscriptions and stop streaming
    if (ws.ptySubscriptions) {
      for (const sessionId of ws.ptySubscriptions) {
        this.server.stopPtyStreaming(sessionId, ws);
      }
      ws.ptySubscriptions.clear();
    }
  }
}
