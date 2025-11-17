import { describe, test, expect, beforeEach, mock } from 'bun:test';
import { FSMEngine, SessionState, StateTransitions } from '../../../src/observability/fsm-engine.mjs';

// Mock ChannelManager
class MockChannelManager {
  constructor() {
    this.events = [];
  }

  emit(type, data) {
    this.events.push({ type, data });
  }

  getLastEvent() {
    return this.events[this.events.length - 1];
  }

  clearEvents() {
    this.events = [];
  }
}

describe('SessionState', () => {
  test('defines all expected states', () => {
    expect(SessionState.CREATED).toBe('created');
    expect(SessionState.PENDING).toBe('pending');
    expect(SessionState.RUNNING).toBe('running');
    expect(SessionState.TOOL_EXEC).toBe('tool_exec');
    expect(SessionState.HUMAN_INPUT).toBe('human_input');
    expect(SessionState.PAUSED).toBe('paused');
    expect(SessionState.SUCCESS).toBe('success');
    expect(SessionState.FAILED).toBe('failed');
    expect(SessionState.STOPPED).toBe('stopped');
  });
});

describe('StateTransitions', () => {
  test('defines valid transitions from CREATED', () => {
    expect(StateTransitions[SessionState.CREATED]).toEqual([SessionState.PENDING]);
  });

  test('defines valid transitions from PENDING', () => {
    const validTransitions = StateTransitions[SessionState.PENDING];
    expect(validTransitions).toContain(SessionState.RUNNING);
    expect(validTransitions).toContain(SessionState.PAUSED);
    expect(validTransitions).toContain(SessionState.STOPPED);
  });

  test('defines valid transitions from RUNNING', () => {
    const validTransitions = StateTransitions[SessionState.RUNNING];
    expect(validTransitions).toContain(SessionState.TOOL_EXEC);
    expect(validTransitions).toContain(SessionState.SUCCESS);
    expect(validTransitions).toContain(SessionState.FAILED);
    expect(validTransitions).toContain(SessionState.PAUSED);
    expect(validTransitions).toContain(SessionState.STOPPED);
  });

  test('defines valid transitions from TOOL_EXEC', () => {
    const validTransitions = StateTransitions[SessionState.TOOL_EXEC];
    expect(validTransitions).toContain(SessionState.RUNNING);
    expect(validTransitions).toContain(SessionState.HUMAN_INPUT);
    expect(validTransitions).toContain(SessionState.PAUSED);
    expect(validTransitions).toContain(SessionState.STOPPED);
    expect(validTransitions).toContain(SessionState.FAILED);
  });

  test('STOPPED and SUCCESS are terminal states', () => {
    expect(StateTransitions[SessionState.STOPPED]).toEqual([]);
    expect(StateTransitions[SessionState.SUCCESS]).toEqual([]);
  });

  test('FAILED can transition to PENDING (retry)', () => {
    expect(StateTransitions[SessionState.FAILED]).toContain(SessionState.PENDING);
  });
});

describe('FSMEngine', () => {
  let engine;
  let mockChannelManager;

  beforeEach(() => {
    mockChannelManager = new MockChannelManager();
    engine = new FSMEngine(mockChannelManager);
  });

  describe('initialization', () => {
    test('creates FSM engine with correct defaults', () => {
      expect(engine.running).toBe(false);
      expect(engine.tickInterval).toBe(100);
      expect(engine.activeSessions.size).toBe(0);
      expect(engine.aiCallbacks.size).toBe(0);
    });

    test('stores reference to channel manager', () => {
      expect(engine.channelManager).toBe(mockChannelManager);
    });
  });

  describe('start and stop', () => {
    test('starts the engine', async () => {
      const startPromise = engine.start();
      
      expect(engine.running).toBe(true);
      
      // Stop immediately to prevent infinite loop
      engine.stop();
      await startPromise;
    });

    test('stops the engine', async () => {
      const startPromise = engine.start();
      
      await new Promise(resolve => setTimeout(resolve, 50));
      engine.stop();
      
      await startPromise;
      expect(engine.running).toBe(false);
    });

    test('warns when starting already running engine', async () => {
      const startPromise = engine.start();
      
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // Try to start again
      await engine.start();
      
      engine.stop();
      await startPromise;
    });
  });

  describe('state validation', () => {
    test('validates valid state transition', () => {
      const isValid = engine.isValidTransition(SessionState.CREATED, SessionState.PENDING);
      expect(isValid).toBe(true);
    });

    test('rejects invalid state transition', () => {
      const isValid = engine.isValidTransition(SessionState.CREATED, SessionState.RUNNING);
      expect(isValid).toBe(false);
    });

    test('allows transition from PAUSED to PENDING', () => {
      const isValid = engine.isValidTransition(SessionState.PAUSED, SessionState.PENDING);
      expect(isValid).toBe(true);
    });
  });

  describe('session FSM management', () => {
    test('creates session FSM', () => {
      const sessionFSM = engine.registerSession(1);

      expect(sessionFSM.sessionId).toBe(1);
      expect(sessionFSM.state).toBe(SessionState.CREATED);
      expect(engine.activeSessions.has('1')).toBe(true);
    });

    test('gets existing session FSM', () => {
      engine.registerSession(1);
      const sessionFSM = engine.getSession(1);

      expect(sessionFSM).toBeDefined();
      expect(sessionFSM.sessionId).toBe(1);
    });

    test('returns undefined for non-existent session FSM', () => {
      const sessionFSM = engine.getSession(999);
      expect(sessionFSM).toBeUndefined();
    });

    test('removes session FSM', () => {
      engine.registerSession(1);
      engine.unregisterSession(1);

      expect(engine.activeSessions.has('1')).toBe(false);
    });
  });

  describe('state transitions', () => {
    test('transitions session to valid new state', () => {
      const sessionFSM = engine.registerSession(1);
      
      engine.transitionState(sessionFSM, SessionState.PENDING);

      expect(sessionFSM.state).toBe(SessionState.PENDING);
    });

    test('emits state change event on transition', () => {
      const sessionFSM = engine.registerSession(1);
      
      mockChannelManager.clearEvents();
      engine.transitionState(sessionFSM, SessionState.PENDING);

      const event = mockChannelManager.getLastEvent();
      expect(event.type).toBe('state:changed');
      expect(event.data.session_id).toBe(1);
      expect(event.data.old_state).toBe(SessionState.CREATED);
      expect(event.data.new_state).toBe(SessionState.PENDING);
    });

    test('allows invalid transitions in permissive mode', () => {
      const sessionFSM = engine.registerSession(1);
      
      // Should warn but allow
      engine.transitionState(sessionFSM, SessionState.RUNNING);
      expect(sessionFSM.state).toBe(SessionState.RUNNING);
    });

    test('stores state data on transition', () => {
      const sessionFSM = engine.registerSession(1);
      
      engine.transitionState(sessionFSM, SessionState.PENDING, {
        timestamp: '2025-11-16T12:00:00Z'
      });

      expect(sessionFSM.stateData.timestamp).toBe('2025-11-16T12:00:00Z');
    });
  });

  describe('session lifecycle', () => {
    test('transitions from CREATED to PENDING', () => {
      const sessionFSM = engine.registerSession(1);
      
      engine.transitionState(sessionFSM, SessionState.PENDING);

      expect(sessionFSM.state).toBe(SessionState.PENDING);
    });

    test('transitions from PENDING to RUNNING', () => {
      const sessionFSM = engine.registerSession(1);
      engine.transitionState(sessionFSM, SessionState.PENDING);
      
      engine.transitionState(sessionFSM, SessionState.RUNNING);

      expect(sessionFSM.state).toBe(SessionState.RUNNING);
    });

    test('transitions from RUNNING to TOOL_EXEC', () => {
      const sessionFSM = engine.registerSession(1);
      engine.transitionState(sessionFSM, SessionState.PENDING);
      engine.transitionState(sessionFSM, SessionState.RUNNING);
      
      engine.transitionState(sessionFSM, SessionState.TOOL_EXEC);

      expect(sessionFSM.state).toBe(SessionState.TOOL_EXEC);
    });

    test('transitions from TOOL_EXEC to RUNNING', () => {
      const sessionFSM = engine.registerSession(1);
      engine.transitionState(sessionFSM, SessionState.PENDING);
      engine.transitionState(sessionFSM, SessionState.RUNNING);
      engine.transitionState(sessionFSM, SessionState.TOOL_EXEC);
      
      engine.transitionState(sessionFSM, SessionState.RUNNING);

      expect(sessionFSM.state).toBe(SessionState.RUNNING);
    });

    test('transitions from RUNNING to SUCCESS', () => {
      const sessionFSM = engine.registerSession(1);
      engine.transitionState(sessionFSM, SessionState.PENDING);
      engine.transitionState(sessionFSM, SessionState.RUNNING);
      
      engine.transitionState(sessionFSM, SessionState.SUCCESS);

      expect(sessionFSM.state).toBe(SessionState.SUCCESS);
    });
  });

  describe('pause and resume', () => {
    test('pauses session from RUNNING state', () => {
      const sessionFSM = engine.registerSession(1);
      engine.transitionState(sessionFSM, SessionState.PENDING);
      engine.transitionState(sessionFSM, SessionState.RUNNING);
      
      engine.transitionState(sessionFSM, SessionState.PAUSED);

      expect(sessionFSM.state).toBe(SessionState.PAUSED);
    });

    test('resumes session from PAUSED to PENDING', () => {
      const sessionFSM = engine.registerSession(1);
      engine.transitionState(sessionFSM, SessionState.PENDING);
      engine.transitionState(sessionFSM, SessionState.RUNNING);
      engine.transitionState(sessionFSM, SessionState.PAUSED);
      
      engine.transitionState(sessionFSM, SessionState.PENDING);

      expect(sessionFSM.state).toBe(SessionState.PENDING);
    });
  });

  describe('error handling', () => {
    test('transitions to FAILED on error', () => {
      const sessionFSM = engine.registerSession(1);
      engine.transitionState(sessionFSM, SessionState.PENDING);
      engine.transitionState(sessionFSM, SessionState.RUNNING);
      
      engine.transitionState(sessionFSM, SessionState.FAILED, {
        error: 'Test error'
      });

      expect(sessionFSM.state).toBe(SessionState.FAILED);
      expect(sessionFSM.stateData.error).toBe('Test error');
    });

    test('can retry from FAILED state', () => {
      const sessionFSM = engine.registerSession(1);
      engine.transitionState(sessionFSM, SessionState.PENDING);
      engine.transitionState(sessionFSM, SessionState.RUNNING);
      engine.transitionState(sessionFSM, SessionState.FAILED);
      
      engine.transitionState(sessionFSM, SessionState.PENDING);

      expect(sessionFSM.state).toBe(SessionState.PENDING);
    });
  });

  describe('stop session', () => {
    test('stops session from any non-terminal state', () => {
      const sessionFSM = engine.registerSession(1);
      engine.transitionState(sessionFSM, SessionState.PENDING);
      
      engine.transitionState(sessionFSM, SessionState.STOPPED);

      expect(sessionFSM.state).toBe(SessionState.STOPPED);
    });

    test('can still transition from STOPPED state in permissive mode', () => {
      const sessionFSM = engine.registerSession(1);
      engine.transitionState(sessionFSM, SessionState.PENDING);
      engine.transitionState(sessionFSM, SessionState.STOPPED);
      
      // Permissive mode allows this
      engine.transitionState(sessionFSM, SessionState.PENDING);
      expect(sessionFSM.state).toBe(SessionState.PENDING);
    });
  });

  describe('tick processing', () => {
    test('processes all active sessions on tick', async () => {
      const sessionFSM1 = engine.registerSession(1);
      const sessionFSM2 = engine.registerSession(2);

      await engine.tick();

      // Both sessions should still be active
      expect(engine.activeSessions.has('1')).toBe(true);
      expect(engine.activeSessions.has('2')).toBe(true);
    });

    test('handles errors during session processing', async () => {
      const sessionFSM = engine.registerSession(1);
      engine.transitionState(sessionFSM, SessionState.PENDING);
      
      // Mock processSession to throw error
      const originalProcessSession = engine.processSession;
      engine.processSession = mock(() => {
        throw new Error('Processing error');
      });

      await engine.tick();

      // Session should transition to FAILED
      expect(sessionFSM.state).toBe(SessionState.FAILED);
      
      // Restore original method
      engine.processSession = originalProcessSession;
    });
  });
});
