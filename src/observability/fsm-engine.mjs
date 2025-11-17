// FSM Engine - Deterministic session state machine for v3.0
//
// STATE MANAGEMENT STRATEGY (v3.0):
// 
// 1. FSM State (Runtime) - Source of truth during daemon execution
//    - Stored in: FSMEngine.activeSessions Map (in-memory)
//    - Purpose: Fast state transitions, event processing
//    - Lifetime: While daemon is running
// 
// 2. Session YAML (Persistence) - Crash recovery and history
//    - Stored in: agents/sessions/{id}.yaml
//    - Purpose: Persist FSM state (metadata.fsm_state), message history
//    - Lifetime: Permanent (until user deletes)
//    - Note: FSM state is saved asynchronously on transitions
// 
// 3. Proc Files (DEPRECATED) - Removed in v3.0
//    - Old location: agents/proc/{session_id}
//    - Replacement: FSM in-memory state + Session YAML persistence
//    - Migration: No migration needed, proc files no longer written or read
//
import { log } from '../lib/utils.mjs';
import { Session } from '../lib/session.mjs';

export const SessionState = {
  CREATED: 'created',         // Session YAML created, not started
  PENDING: 'pending',         // Queued for processing
  RUNNING: 'running',         // Actively processing (AI call in flight)
  TOOL_EXEC: 'tool_exec',     // Waiting for tool execution
  HUMAN_INPUT: 'human_input', // Waiting for human (ask_human, approval)
  PAUSED: 'paused',           // User paused
  SUCCESS: 'success',         // Completed successfully
  FAILED: 'failed',           // Error state
  STOPPED: 'stopped'          // User stopped
};

export const StateTransitions = {
  [SessionState.CREATED]: [SessionState.PENDING],
  [SessionState.PENDING]: [SessionState.RUNNING, SessionState.PAUSED, SessionState.STOPPED],
  [SessionState.RUNNING]: [SessionState.TOOL_EXEC, SessionState.SUCCESS, SessionState.FAILED, SessionState.PAUSED, SessionState.STOPPED],
  [SessionState.TOOL_EXEC]: [SessionState.RUNNING, SessionState.HUMAN_INPUT, SessionState.PAUSED, SessionState.STOPPED, SessionState.FAILED],
  [SessionState.HUMAN_INPUT]: [SessionState.RUNNING, SessionState.PAUSED, SessionState.STOPPED],
  [SessionState.PAUSED]: [SessionState.PENDING, SessionState.STOPPED],
  [SessionState.STOPPED]: [],
  [SessionState.SUCCESS]: [],
  [SessionState.FAILED]: [SessionState.PENDING] // Can retry
};

export class FSMEngine {
  constructor(channelManager) {
    this.channelManager = channelManager;
    this.running = false;
    this.tickInterval = 100; // 100ms = 10 ticks/sec
    this.activeSessions = new Map(); // session_id → SessionFSM
    this.aiCallbacks = new Map(); // session_id → Promise for non-blocking AI calls
  }

  async start() {
    if (this.running) {
      log('warn', '⚠️  FSM Engine already running');
      return;
    }

    this.running = true;
    log('info', '🚀 FSM Engine started');
    
    await this.run();
  }

  async stop() {
    this.running = false;
    log('info', '🛑 FSM Engine stopped');
  }

  async run() {
    while (this.running) {
      try {
        await this.tick();
      } catch (error) {
        log('error', `FSM Engine tick error: ${error.message}`);
      }
      
      // Sleep for tick interval
      await new Promise(resolve => setTimeout(resolve, this.tickInterval));
    }
  }

  async tick() {
    // Process all active sessions
    for (const [sessionId, sessionFSM] of this.activeSessions) {
      try {
        await this.processSession(sessionFSM);
      } catch (error) {
        log('error', `Error processing session ${sessionId}: ${error.message}`);
        
        // Transition to FAILED state
        this.transitionState(sessionFSM, SessionState.FAILED, {
          error: error.message
        });
      }
    }
  }

  async processSession(sessionFSM) {
    const { state, sessionId } = sessionFSM;

    switch (state) {
      case SessionState.CREATED:
        // Session exists but hasn't been queued
        // This is a no-op state waiting for user action
        break;

      case SessionState.PENDING:
        // Queue for processing - transition to RUNNING
        await this.startProcessing(sessionFSM);
        break;

      case SessionState.RUNNING:
        // Check if AI call finished (non-blocking)
        await this.checkAIResponse(sessionFSM);
        break;

      case SessionState.TOOL_EXEC:
        // Execute pending tool
        await this.executeTool(sessionFSM);
        break;

      case SessionState.HUMAN_INPUT:
        // Waiting - do nothing (WebSocket handles reply)
        break;

      case SessionState.PAUSED:
      case SessionState.STOPPED:
      case SessionState.SUCCESS:
      case SessionState.FAILED:
        // Terminal states - do nothing
        break;

      default:
        log('error', `Unknown state: ${state} for session ${sessionId}`);
    }
  }

  async startProcessing(sessionFSM) {
    log('debug', `▶️  Starting session ${sessionFSM.sessionId}`);
    
    // Transition to RUNNING
    this.transitionState(sessionFSM, SessionState.RUNNING);
    
    // Emit event
    this.channelManager.emit('session:started', {
      session_id: sessionFSM.sessionId
    });

    // Initiate AI call (non-blocking)
    // This would integrate with Agent.prompt() or similar
    // For now, stub it out
    this.aiCallbacks.set(sessionFSM.sessionId, this.callAI(sessionFSM));
  }

  async checkAIResponse(sessionFSM) {
    const callback = this.aiCallbacks.get(sessionFSM.sessionId);
    if (!callback) {
      return; // No active AI call
    }

    // Check if promise is resolved (non-blocking check)
    // Note: JavaScript doesn't have native non-blocking promise inspection
    // We'd need to track this separately in production
    // For now, we await (this would block)
    
    // TODO: Implement proper non-blocking AI call tracking
    // For now, this is a simplified version
  }

  async callAI(sessionFSM) {
    // Stub: This would call Agent.prompt() or equivalent
    // Return mock response after delay
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    return {
      type: 'response',
      content: 'AI response...',
      tool_calls: []
    };
  }

  async executeTool(sessionFSM) {
    log('debug', `🔧 Executing tool for session ${sessionFSM.sessionId}`);
    
    // Stub: Execute the pending tool
    // Get tool call from session state
    const { pendingToolCall } = sessionFSM.stateData;
    
    if (!pendingToolCall) {
      log('error', `No pending tool call for session ${sessionFSM.sessionId}`);
      this.transitionState(sessionFSM, SessionState.FAILED);
      return;
    }

    // Check if tool requires human approval
    if (this.requiresHumanApproval(pendingToolCall)) {
      this.transitionState(sessionFSM, SessionState.HUMAN_INPUT, {
        pendingToolCall
      });
      return;
    }

    // Execute tool (stub)
    // const result = await Tool.execute(pendingToolCall);
    
    // Transition back to RUNNING
    this.transitionState(sessionFSM, SessionState.RUNNING);
  }

  requiresHumanApproval(toolCall) {
    // Stub: Check if tool is on allowlist
    // For now, assume ask_human requires approval
    return toolCall.name === 'ask_human';
  }

  isValidTransition(fromState, toState) {
    const validTransitions = StateTransitions[fromState] || [];
    return validTransitions.includes(toState);
  }

  transitionState(sessionFSM, newState, stateData = {}) {
    const oldState = sessionFSM.state;
    
    // Validate transition
    const validTransitions = StateTransitions[oldState] || [];
    if (!validTransitions.includes(newState) && newState !== oldState) {
      log('warn', `Invalid state transition: ${oldState} → ${newState} for session ${sessionFSM.sessionId}`);
      // Allow it anyway for now (permissive mode)
    }

    sessionFSM.state = newState;
    sessionFSM.stateData = { ...sessionFSM.stateData, ...stateData };
    sessionFSM.updatedAt = new Date().toISOString();

    log('debug', `🔄 Session ${sessionFSM.sessionId}: ${oldState} → ${newState}`);

    // Emit state change event
    this.channelManager.emit('state:changed', {
      session_id: sessionFSM.sessionId,
      old_state: oldState,
      new_state: newState,
      state_data: stateData
    });

    // Persist state to session YAML for crash recovery
    // NOTE: This is async but we don't await to avoid blocking the FSM tick
    // The Session class handles errors gracefully
    this.persistSessionState(sessionFSM).catch(err => {
      log('error', `Failed to persist FSM state for session ${sessionFSM.sessionId}: ${err.message}`);
    });
  }

  /**
   * Persist FSM state to session YAML for crash recovery
   * This allows the FSM to restore state after a daemon restart
   */
  async persistSessionState(sessionFSM) {
    const { Session } = await import('./session.mjs');
    await Session.setFSMState(
      sessionFSM.sessionId,
      sessionFSM.state,
      sessionFSM.stateData
    );
  }

  // Session management
  registerSession(sessionId, initialState = SessionState.CREATED) {
    const sessionFSM = {
      sessionId,
      state: initialState,
      stateData: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    this.activeSessions.set(String(sessionId), sessionFSM);
    
    log('debug', `📝 Registered session ${sessionId} with state ${initialState}`);
    
    return sessionFSM;
  }

  unregisterSession(sessionId) {
    this.activeSessions.delete(String(sessionId));
    this.aiCallbacks.delete(String(sessionId));
    
    log('debug', `📝 Unregistered session ${sessionId}`);
  }

  getSession(sessionId) {
    return this.activeSessions.get(String(sessionId));
  }

  // User actions
  pauseSession(sessionId) {
    const sessionFSM = this.getSession(sessionId);
    if (!sessionFSM) {
      throw new Error(`Session ${sessionId} not found`);
    }

    this.transitionState(sessionFSM, SessionState.PAUSED);
  }

  resumeSession(sessionId) {
    const sessionFSM = this.getSession(sessionId);
    if (!sessionFSM) {
      throw new Error(`Session ${sessionId} not found`);
    }

    if (sessionFSM.state !== SessionState.PAUSED) {
      throw new Error(`Session ${sessionId} is not paused`);
    }

    this.transitionState(sessionFSM, SessionState.PENDING);
  }

  stopSession(sessionId) {
    const sessionFSM = this.getSession(sessionId);
    if (!sessionFSM) {
      throw new Error(`Session ${sessionId} not found`);
    }

    this.transitionState(sessionFSM, SessionState.STOPPED);
  }
}
