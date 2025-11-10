/**
 * Observability Module
 * Handles UDP event emission to observability dashboard
 */

import dgram from 'dgram';
import { _G } from './globals.mjs';
import { log } from './utils.mjs';

let udpClient = null;
let emissionEnabled = false;
let targetPort = null;

/**
 * Initialize observability if --observe flag is set
 */
export function init() {
  if (_G.observePort) {
    emissionEnabled = true;
    targetPort = _G.observePort;
    udpClient = dgram.createSocket('udp4');
    
    udpClient.on('error', (err) => {
      log('debug', `Observability UDP error: ${err.message}`);
      // Errors are non-fatal - observability is optional
    });
    
    log('debug', `Observability enabled on UDP port ${targetPort}`);
  }
}

/**
 * Emit an event to the observability server
 * @param {string} type - Event type (e.g., 'USER_REQUEST', 'RESPONSE', 'TOOL_CALL')
 * @param {object} data - Event data
 */
export function emit(type, data = {}) {
  if (!emissionEnabled || !udpClient || !targetPort) {
    return;
  }

  try {
    const event = {
      type,
      timestamp: new Date().toISOString(),
      daemon_pid: process.pid,
      ...data
    };

    const message = JSON.stringify(event);
    const buffer = Buffer.from(message);

    udpClient.send(buffer, 0, buffer.length, targetPort, 'localhost', (err) => {
      if (err) {
        log('debug', `Failed to emit observability event: ${err.message}`);
      }
    });
  } catch (err) {
    log('debug', `Error emitting observability event: ${err.message}`);
  }
}

/**
 * Emit user request event
 */
export function emitUserRequest(sessionId, agent, content, contextTokens = null) {
  emit('USER_REQUEST', {
    session_id: sessionId,
    agent,
    content,
    context_tokens: contextTokens
  });
}

/**
 * Emit assistant response event
 */
export function emitResponse(sessionId, agent, content, model = null, cost = null, contextTokens = null) {
  emit('RESPONSE', {
    session_id: sessionId,
    agent,
    content,
    model,
    cost,
    context_tokens: contextTokens
  });
}

/**
 * Emit tool call event
 */
export function emitToolCall(sessionId, agent, tool, params = {}) {
  emit('TOOL_CALL', {
    session_id: sessionId,
    agent,
    tool,
    params
  });
}

/**
 * Emit tool response event
 */
export function emitToolResponse(sessionId, agent, tool, result, success = true) {
  emit('TOOL_RESPONSE', {
    session_id: sessionId,
    agent,
    tool,
    result: typeof result === 'string' ? result : JSON.stringify(result),
    success
  });
}

/**
 * Emit thinking/reasoning event
 */
export function emitThinking(sessionId, agent, content) {
  emit('THINKING', {
    session_id: sessionId,
    agent,
    content
  });
}

/**
 * Emit hook/lifecycle event
 */
export function emitHook(hookType, sessionId, agent, data = {}) {
  emit(hookType, {
    session_id: sessionId,
    agent,
    ...data
  });
}

/**
 * Emit session start event
 */
export function emitSessionStart(sessionId, agent, template = null) {
  emit('SESSIONSTART', {
    session_id: sessionId,
    agent,
    template
  });
}

/**
 * Emit session end event
 */
export function emitSessionEnd(sessionId, agent, reason = null) {
  emit('SESSIONEND', {
    session_id: sessionId,
    agent,
    reason
  });
}

/**
 * Emit metric snapshot for an agent session
 */
export function emitMetricSnapshot(sessionId, agent, metrics) {
  emit('METRIC_SNAPSHOT', {
    session_id: sessionId,
    agent,
    status: metrics.status || 'unknown',
    summary: metrics.summary || '',
    token_cost: metrics.token_cost || 0,
    model: metrics.model || '',
    counters: {
      user_requests: metrics.user_requests || 0,
      assistant_responses: metrics.assistant_responses || 0,
      tool_invocations: metrics.tool_invocations || 0,
      llm_thinking_events: metrics.llm_thinking_events || 0,
      total_tokens: metrics.total_tokens || 0
    }
  });
}

/**
 * Emit global metrics snapshot
 */
export function emitGlobalMetrics(metrics) {
  emit('GLOBAL_METRIC_SNAPSHOT', {
    active_agents: metrics.active_agents || 0,
    running_agents: metrics.running_agents || 0,
    total_token_cost: metrics.total_token_cost || 0,
    log_entries: metrics.log_entries || 0,
    agent_sessions_count: metrics.agent_sessions_count || 0
  });
}

/**
 * Cleanup on shutdown
 */
export function cleanup() {
  if (udpClient) {
    try {
      udpClient.close();
    } catch (err) {
      // Ignore errors during cleanup
    }
    udpClient = null;
  }
  emissionEnabled = false;
}

// Cleanup on process exit
process.on('exit', cleanup);
process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);

export default {
  init,
  emit,
  emitUserRequest,
  emitResponse,
  emitToolCall,
  emitToolResponse,
  emitThinking,
  emitHook,
  emitSessionStart,
  emitSessionEnd,
  emitMetricSnapshot,
  emitGlobalMetrics,
  cleanup
};
