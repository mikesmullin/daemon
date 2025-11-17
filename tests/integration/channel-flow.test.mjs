import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { mkdirSync } from 'fs';

describe('Channel Flow Integration', () => {
  let tempDir;
  let channelManager;
  let fsmEngine;

  beforeAll(async () => {
    // Create temporary directory for test
    tempDir = mkdtempSync(join(tmpdir(), 'daemon-integration-'));
    mkdirSync(join(tempDir, 'agents', 'channels'), { recursive: true });
    mkdirSync(join(tempDir, 'agents', 'sessions'), { recursive: true });

    // Import and initialize components
    const { ChannelManager } = await import('../../src/observability/channel-manager.mjs');
    const { FSMEngine } = await import('../../src/observability/fsm-engine.mjs');

    channelManager = new ChannelManager(tempDir);
    await channelManager.initialize();

    fsmEngine = new FSMEngine(channelManager);
  });

  afterAll(() => {
    // Clean up temp directory
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('complete channel workflow: create → invite agent → send message', async () => {
    // Step 1: Create a channel
    const channel = await channelManager.createChannel('dev', 'Development channel');
    expect(channel.name).toBe('dev');

    // Step 2: Create a session FSM (simulating agent invitation)
    const sessionFSM = fsmEngine.registerSession(1);
    expect(sessionFSM.sessionId).toBe(1);
    expect(sessionFSM.state).toBe('created');

    // Step 3: Add session to channel
    await channelManager.addSessionToChannel('dev', 1);
    const updatedChannel = channelManager.getChannel('dev');
    expect(updatedChannel.agentSessions).toContain(1);

    // Step 4: Transition session to pending (user sends message)
    fsmEngine.transitionState(sessionFSM, 'pending');
    expect(sessionFSM.state).toBe('pending');

    // Step 5: Transition to running (engine picks up)
    fsmEngine.transitionState(sessionFSM, 'running');
    expect(sessionFSM.state).toBe('running');

    // Step 6: Verify channel-session mapping
    const channelName = channelManager.getChannelForSession(1);
    expect(channelName).toBe('dev');
  });

  test('multi-agent channel workflow', async () => {
    // Create a channel with multiple agents
    const channel = await channelManager.createChannel('team', 'Team channel');

    // Create multiple session FSMs
    const session1 = fsmEngine.registerSession(10);
    const session2 = fsmEngine.registerSession(11);
    const session3 = fsmEngine.registerSession(12);

    // Add all sessions to channel
    await channelManager.addSessionToChannel('team', 10);
    await channelManager.addSessionToChannel('team', 11);
    await channelManager.addSessionToChannel('team', 12);

    // Verify all sessions are in channel
    const teamChannel = channelManager.getChannel('team');
    expect(teamChannel.agentSessions).toContain(10);
    expect(teamChannel.agentSessions).toContain(11);
    expect(teamChannel.agentSessions).toContain(12);

    // Transition sessions to different states
    fsmEngine.transitionState(session1, 'pending');
    fsmEngine.transitionState(session1, 'running');
    
    fsmEngine.transitionState(session2, 'pending');
    fsmEngine.transitionState(session2, 'running');
    fsmEngine.transitionState(session2, 'tool_exec');
    
    fsmEngine.transitionState(session3, 'pending');
    fsmEngine.transitionState(session3, 'running');
    fsmEngine.transitionState(session3, 'paused');

    // Verify states
    expect(session1.state).toBe('running');
    expect(session2.state).toBe('tool_exec');
    expect(session3.state).toBe('paused');
  });

  test('channel deletion cleans up sessions', async () => {
    // Create channel and add sessions
    await channelManager.createChannel('temp', 'Temporary channel');
    await channelManager.addSessionToChannel('temp', 20);
    await channelManager.addSessionToChannel('temp', 21);

    // Verify sessions are mapped
    expect(channelManager.getChannelForSession(20)).toBe('temp');
    expect(channelManager.getChannelForSession(21)).toBe('temp');

    // Delete channel
    await channelManager.deleteChannel('temp');

    // Verify sessions are unmapped
    expect(channelManager.getChannelForSession(20)).toBeUndefined();
    expect(channelManager.getChannelForSession(21)).toBeUndefined();
  });

  test('event emission propagates through channel manager', async () => {
    const events = [];
    
    // Create mock WebSocket client
    const mockClient = {
      readyState: 1, // OPEN
      send: (data) => {
        events.push(JSON.parse(data));
      }
    };

    // Add client to channel manager
    channelManager.addClient(mockClient);

    // Create channel and session
    await channelManager.createChannel('events', 'Event test');
    const sessionFSM = fsmEngine.registerSession(30);

    // Clear initial events
    events.length = 0;

    // Trigger state transition (should emit event)
    fsmEngine.transitionState(sessionFSM, 'pending');

    // Verify event was emitted
    expect(events.length).toBeGreaterThan(0);
    
    const stateChangeEvent = events.find(e => e.type === 'state:changed');
    expect(stateChangeEvent).toBeDefined();
    expect(stateChangeEvent.data.session_id).toBe(30);
  });

  test('getAllSessions returns all sessions across channels', async () => {
    // Create multiple channels
    await channelManager.createChannel('dev1', 'Dev 1');
    await channelManager.createChannel('dev2', 'Dev 2');
    await channelManager.createChannel('dev3', 'Dev 3');

    // Register sessions with manager
    channelManager.registerSession(40, { channelName: 'dev1' });
    channelManager.registerSession(41, { channelName: 'dev1' });
    channelManager.registerSession(42, { channelName: 'dev2' });
    channelManager.registerSession(43, { channelName: 'dev3' });

    // Get all sessions
    const allSessions = channelManager.getAllSessions();

    // Verify all sessions are returned
    expect(allSessions.some(s => s.id === 40)).toBe(true);
    expect(allSessions.some(s => s.id === 41)).toBe(true);
    expect(allSessions.some(s => s.id === 42)).toBe(true);
    expect(allSessions.some(s => s.id === 43)).toBe(true);
    expect(allSessions.length).toBeGreaterThanOrEqual(4);
  });
});
