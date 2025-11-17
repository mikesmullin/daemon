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
import { _G } from '../lib/globals.mjs';
import { log } from '../lib/utils.mjs';
import { Session } from '../lib/session.mjs';
import _ from 'lodash';
import { Tool } from '../lib/tool.mjs';
import { Agent } from '../lib/agents.mjs';

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
        // Call AI to process the session
        await this.callAI(sessionFSM);
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

    // Initiate AI call
    await this.callAI(sessionFSM);
  }

  async checkAIResponse(sessionFSM) {
    // Removed - using synchronous AI calls in RUNNING state
  }

  async callAI(sessionFSM) {
    const sessionId = sessionFSM.sessionId;
    try {
      const sessionContent = await Session.load(sessionId);
      const capabilities = sessionContent.metadata.tools || [];
      const availableTools = [];
      for (const name in _G.tools) {
        if (capabilities.includes(name)) {
          availableTools.push(_G.tools[name]);
        }
      }
      const toolDefinitions = Tool.prepareToolsForAPI(availableTools);
      
      // Process any pending tool calls first
      let sessionUpdated = await Tool.processPendingCalls(sessionContent, sessionId);
      
      const system_prompt = sessionContent.spec.system_prompt || 'You are a helpful assistant.';
      const messages = [{ role: 'system', content: system_prompt }];
      const allMessages = sessionContent.spec.messages || [];
      for (const message of allMessages) {
        messages.push(_.omit(message, ['ts']));
      }
      
      const last_message = allMessages[allMessages.length - 1] || {};
      if (last_message.role !== 'user' && last_message.role !== 'tool') {
        log('debug', `Session ${sessionId} no new input, skipping AI call`);
        return;
      }
      
      const response = await Agent.prompt({
        model: sessionContent.metadata.model || 'claude-sonnet-4',
        messages: messages,
        tools: toolDefinitions,
      });
      
      sessionContent.metadata.usage = response.usage;
      sessionContent.metadata.provider = response.provider;
      
      const emptyResponse = !response.choices || response.choices.length === 0;
      if (emptyResponse) {
        allMessages.push({
          ts: new Date().toISOString(),
          role: 'assistant',
          content: '',
          finish_reason: 'empty'
        });
        sessionUpdated = true;
      } else {
        for (const choice of response.choices) {
          const msg = {
            ts: new Date().toISOString(),
            role: choice.message.role,
            content: choice.message.content,
            tool_calls: choice.message.tool_calls,
            finish_reason: choice.finish_reason
          };
          allMessages.push(msg);
          sessionUpdated = true;
        }
      }
      
      if (sessionUpdated) {
        sessionContent.spec.messages = allMessages;
        await Session.save(sessionId, sessionContent);
      }
      
      // Immediately process any tool calls from the response
      const toolCallsAdded = response.choices.some(choice =>
        choice.message.tool_calls && choice.message.tool_calls.length > 0
      );
      
      if (toolCallsAdded) {
        const toolsExecuted = await Tool.processPendingCalls(sessionContent, sessionId);
        if (toolsExecuted) {
          await Session.save(sessionId, sessionContent);
        }
      }
      
      // Determine next state
      const lastMsg = allMessages[allMessages.length - 1];
      const hasToolCalls = lastMsg.tool_calls && lastMsg.tool_calls.length > 0;
      
      if (hasToolCalls) {
        this.transitionState(sessionFSM, SessionState.TOOL_EXEC, { hasToolCalls: true });
      } else if (lastMsg.finish_reason === 'stop') {
        this.transitionState(sessionFSM, SessionState.SUCCESS);
      } else {
        this.transitionState(sessionFSM, SessionState.PENDING);
      }
      
      // Update last_read to prevent re-logging
      await Session.updateLastRead(sessionId);
      
      // Emit events for new messages
      const newMsgsCount = response.choices ? response.choices.length : 1;
      for (let i = allMessages.length - newMsgsCount; i < allMessages.length; i++) {
        const msg = allMessages[i];
        this.channelManager.emit('event', {
          channel: this.channelManager.getChannelForSession(sessionId),
          event: {
            type: msg.role.toUpperCase(),
            session_id: sessionId,
            content: msg.content,
            tool_calls: msg.tool_calls,
            finish_reason: msg.finish_reason,
            ts: msg.ts
          }
        });
      }
      
    } catch (error) {
      log('error', `AI call failed for session ${sessionId}: ${error.message}`);
      this.transitionState(sessionFSM, SessionState.FAILED, { error: error.message });
    }
  }

  async executeTool(sessionFSM) {
    const sessionId = sessionFSM.sessionId;
    try {
      const sessionContent = await Session.load(sessionId);
      const updated = await Tool.processPendingCalls(sessionContent, sessionId);
      if (updated) {
        await Session.save(sessionId, sessionContent);
        // Emit tool response events - find new tool messages
        const allMessages = sessionContent.spec.messages || [];
        // Simple: emit the last messages if role 'tool'
        for (let i = allMessages.length - 5; i < allMessages.length; i++) { // last 5
          if (i >= 0 && allMessages[i].role === 'tool') {
            this.channelManager.emit('event', {
              channel: this.channelManager.getChannelForSession(sessionId),
              event: {
                type: 'TOOL_RESPONSE',
                session_id: sessionId,
                content: allMessages[i].content,
                tool_call_id: allMessages[i].tool_call_id,
                ts: allMessages[i].ts
              }
            });
          }
        }
      }
      // After tools, back to RUNNING
      this.transitionState(sessionFSM, SessionState.RUNNING);
    } catch (error) {
      log('error', `Tool execution failed for session ${sessionId}: ${error.message}`);
      this.transitionState(sessionFSM, SessionState.FAILED, { error: error.message });
    }
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
