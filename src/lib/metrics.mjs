/**
 * Metric Collection and Emission Module
 * Periodically collects and emits agent metrics for observability
 */

import { Session } from './session.mjs';
import * as observability from './observability.mjs';
import { log } from './utils.mjs';

let metricInterval = null;
const SNAPSHOT_INTERVAL = 60000; // 1 minute in milliseconds

/**
 * Start periodic metric collection and emission
 */
export function start() {
  if (metricInterval) {
    return; // Already running
  }

  log('debug', 'Starting periodic metric collection (1-minute intervals)');

  metricInterval = setInterval(async () => {
    try {
      await collectAndEmitMetrics();
    } catch (err) {
      log('debug', `Error collecting metrics: ${err.message}`);
    }
  }, SNAPSHOT_INTERVAL);

  // Also emit immediately on start
  setTimeout(() => collectAndEmitMetrics(), 1000);
}

/**
 * Stop metric collection
 */
export function stop() {
  if (metricInterval) {
    clearInterval(metricInterval);
    metricInterval = null;
    log('debug', 'Stopped periodic metric collection');
  }
}

/**
 * Collect and emit metrics for all active sessions
 */
async function collectAndEmitMetrics() {
  try {
    const sessions = await Session.list();
    
    // Filter to active sessions (not deleted, not in fail state)
    const activeSessions = sessions.filter(s => 
      !s.labels?.includes('deleted') && s.state !== 'fail'
    );

    // Emit per-session metrics
    for (const session of activeSessions) {
      try {
        const sessionData = await Session.load(session.session_id);
        
        // Count different message types
        const messages = sessionData.spec.messages || [];
        const userRequests = messages.filter(m => m.role === 'user').length;
        const assistantResponses = messages.filter(m => m.role === 'assistant').length;
        const toolInvocations = messages.filter(m => m.role === 'assistant' && m.tool_calls).length;
        
        // Calculate total tokens
        const totalTokens = sessionData.metadata?.usage?.total_tokens || 0;
        const tokenCost = sessionData.metadata?.usage?.total_cost || 0;

        observability.emitMetricSnapshot(session.session_id, session.agent, {
          status: session.state,
          summary: generateSessionSummary(sessionData),
          token_cost: tokenCost,
          model: sessionData.metadata?.model || 'unknown',
          user_requests: userRequests,
          assistant_responses: assistantResponses,
          tool_invocations: toolInvocations,
          llm_thinking_events: 0, // Could track thinking events separately
          total_tokens: totalTokens
        });
      } catch (err) {
        log('debug', `Error collecting metrics for session ${session.session_id}: ${err.message}`);
      }
    }

    // Emit global metrics
    const activeAgents = new Set(activeSessions.map(s => s.agent)).size;
    const runningAgents = activeSessions.filter(s => s.state === 'running').length;
    const totalCost = activeSessions.reduce((sum, s) => {
      try {
        const sessionData = Session.load(s.session_id);
        return sum + (sessionData.metadata?.usage?.total_cost || 0);
      } catch {
        return sum;
      }
    }, 0);
    
    const logEntries = activeSessions.reduce((sum, s) => {
      try {
        const sessionData = Session.load(s.session_id);
        const messages = sessionData.spec?.messages || [];
        return sum + messages.filter(m => m.role === 'user' || m.role === 'assistant').length;
      } catch {
        return sum;
      }
    }, 0);

    observability.emitGlobalMetrics({
      active_agents: activeAgents,
      running_agents: runningAgents,
      total_token_cost: await calculateTotalCost(activeSessions),
      log_entries: logEntries,
      agent_sessions_count: activeSessions.length
    });

  } catch (err) {
    log('debug', `Error in metric collection: ${err.message}`);
  }
}

/**
 * Generate a brief summary of a session
 */
function generateSessionSummary(sessionData) {
  const messages = sessionData.spec.messages || [];
  const lastMessage = messages[messages.length - 1];
  
  if (!lastMessage) {
    return 'No activity yet';
  }

  if (lastMessage.role === 'user') {
    return 'Awaiting assistant response';
  }

  if (lastMessage.role === 'assistant' && lastMessage.tool_calls) {
    const toolNames = lastMessage.tool_calls.map(tc => tc.function.name).join(', ');
    return `Executing tools: ${toolNames}`;
  }

  if (lastMessage.role === 'assistant' && lastMessage.content) {
    // Return first 50 chars of last response
    const preview = lastMessage.content.substring(0, 50);
    return preview + (lastMessage.content.length > 50 ? '...' : '');
  }

  return 'Processing...';
}

/**
 * Calculate total cost across all sessions
 */
async function calculateTotalCost(sessions) {
  let total = 0;
  for (const session of sessions) {
    try {
      const sessionData = await Session.load(session.session_id);
      total += sessionData.metadata?.usage?.total_cost || 0;
    } catch {
      // Skip sessions that can't be loaded
    }
  }
  return total;
}

// Cleanup on process exit
process.on('exit', stop);
process.on('SIGINT', stop);
process.on('SIGTERM', stop);

export default {
  start,
  stop
};
