#!/usr/bin/env bun
import fs from 'fs/promises';
import yaml from 'js-yaml';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { ptyManager } from '../../plugins/shell/pty-manager.mjs';
import { templateManager } from '../lib/templates.mjs';
import { ChannelManager } from './channel-manager.mjs';
import { FSMEngine } from './fsm-engine.mjs';
import { ChannelHandlers } from './handlers/channel-handlers.mjs';
import { AgentHandlers } from './handlers/agent-handlers.mjs';
import { MessageHandlers } from './handlers/message-handlers.mjs';
import { PtyHandlers } from './handlers/pty-handlers.mjs';
import { SessionHandlers } from './handlers/session-handlers.mjs';
import { TemplateHandlers } from './handlers/template-handlers.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DEFAULT_PORT = 3002;
const DISCONNECT_TIMEOUT = 30000; // 30 seconds

class ObservabilityServer {
  constructor(port = DEFAULT_PORT) {
    this.port = port;
    this.httpServer = null;
    this.clients = new Set();
    this.eventBuffer = [];
    this.maxBufferSize = 1000;
    this.metrics = {
      activeAgents: 0,
      runningTasks: 0,
      logCount: 0,
      totalCost: 0,
      activeDaemons: new Set()
    };
    this.agentStates = new Map();
    this.statusCheckInterval = null;
    this.baseDir = __dirname;
    this.workspaceRoot = join(__dirname, '..', '..');
    
    // Initialize Channel Manager and FSM Engine
    this.channelManager = new ChannelManager(this.workspaceRoot);
    this.fsmEngine = new FSMEngine(this.channelManager);
    
    // Set FSM Engine reference in Channel Manager
    this.channelManager.setFSMEngine(this.fsmEngine);
    
    // PTY streaming setup
    this.ptyStreamIntervals = new Map(); // Map of sessionKey -> interval
    
    // Initialize handlers
    this.channelHandlers = new ChannelHandlers(this);
    this.agentHandlers = new AgentHandlers(this);
    this.messageHandlers = new MessageHandlers(this);
    this.ptyHandlers = new PtyHandlers(this);
    this.sessionHandlers = new SessionHandlers(this, this.workspaceRoot);
    this.templateHandlers = new TemplateHandlers(this.workspaceRoot);
  }

  async start() {
    // Start HTTP/WebSocket server FIRST so clients can connect immediately
    // This ensures the browser doesn't wait for initialization before connecting
    this.startHttpServer();
    this.startStatusChecker();
    console.log(`Observability server running on http://localhost:${this.port}`);
    
    // Initialize Channel Manager (load existing channels) in background
    await this.channelManager.initialize();
    
    // Load existing sessions and register with FSM engine
    await this.loadAndRegisterSessions();
    
    // Start FSM Engine (main processing loop)
    this.fsmEngine.start().catch(err => {
      console.error('FSM Engine error:', err);
    });
    
    templateManager.initialize(); // Initialize centralized template cache
    console.log(`🤖 FSM Engine started - processing agent sessions`);
  }

  async loadAndRegisterSessions() {
    const sessions = await this.loadSessions();
    
    for (const sessionData of sessions) {
      if (sessionData.metadata && sessionData.metadata.session_id) {
        const sessionId = sessionData.metadata.session_id;
        
        // Get FSM state from session metadata, or default to CREATED
        let fsmState = sessionData.metadata.fsm_state || 'created';
        const stateData = sessionData.metadata.state_data || {};
        
        // Check if session has pending user messages and should be in PENDING state
        const messages = sessionData.spec?.messages || [];
        const hasPendingUserMessage = messages.length > 0 && 
          messages[messages.length - 1].role === 'user' &&
          (!sessionData.metadata.fsm_state || sessionData.metadata.fsm_state === 'created' || sessionData.metadata.fsm_state === 'success');
        
        if (hasPendingUserMessage) {
          fsmState = 'pending';
          console.log(`📝 Session ${sessionId} has pending user message, setting state to PENDING`);
        }
        
        // Register session with FSM engine
        const sessionFSM = this.fsmEngine.registerSession(sessionId, fsmState);
        sessionFSM.stateData = stateData;
        
        // Register with ChannelManager for tracking
        this.channelManager.registerSession(sessionId, {
          name: sessionData.metadata.name,
          template: sessionData.metadata.template,
          created_at: sessionData.metadata.created_at
        });
        
        console.log(`📝 Registered session ${sessionId} with FSM state: ${fsmState}`);
      }
    }
    
    console.log(`✅ Loaded ${sessions.length} existing sessions`);
  }

  handleEvent(event) {
    // Add to buffer
    this.eventBuffer.push(event);
    if (this.eventBuffer.length > this.maxBufferSize) {
      this.eventBuffer.shift();
    }

    // Update metrics based on event type
    this.updateMetrics(event);

    // Broadcast to all connected WebSocket clients
    this.broadcast({
      type: 'event',
      data: event
    });
  }

  updateMetrics(event) {
    // Track daemon PIDs
    if (event.daemon_pid) {
      this.metrics.activeDaemons.add(event.daemon_pid);
    }

    // Update metrics based on event type
    switch (event.type) {
      case 'METRIC_SNAPSHOT':
        this.updateAgentState(event);
        break;
      case 'GLOBAL_METRIC_SNAPSHOT':
        this.metrics.activeAgents = event.active_agents || 0;
        this.metrics.runningTasks = event.running_agents || 0;
        this.metrics.logCount = event.log_entries || 0;
        this.metrics.totalCost = event.total_token_cost || 0;
        break;
      case 'USER_REQUEST':
      case 'RESPONSE':
        this.metrics.logCount++;
        // Also track agent from these events if not yet in agentStates
        if (event.agent && event.session_id) {
          const agentKey = `${event.agent}_${event.session_id}`;
          if (!this.agentStates.has(agentKey)) {
            this.agentStates.set(agentKey, {
              name: event.agent,
              sessionId: event.session_id,
              status: event.type === 'USER_REQUEST' ? 'running' : 'ready',
              model: event.model || 'unknown',
              tokensUsed: event.context_tokens || 0,
              cost: event.cost || 0,
              summary: event.type === 'USER_REQUEST' ? 'Processing...' : (event.content || '').substring(0, 50),
              activeTasks: 0,
              messages: 1,
              lastUpdate: event.timestamp || new Date().toISOString()
            });
          }
        }
        break;
      case 'STOP':
        // Mark agent as stopped
        if (event.agent && event.session_id) {
          const agentKey = `${event.agent}_${event.session_id}`;
          const agent = this.agentStates.get(agentKey);
          if (agent) {
            agent.status = 'stopped';
            agent.lastUpdate = event.timestamp || new Date().toISOString();
          }
        }
        break;
      case 'TOOL_CALL':
        // Could track running tasks here
        break;
    }

    // Broadcast updated metrics
    this.broadcast({
      type: 'metrics',
      data: {
        ...this.metrics,
        activeDaemons: this.metrics.activeDaemons.size,
        agents: Array.from(this.agentStates.values())
      }
    });
  }

  updateAgentState(snapshot) {
    const agentKey = `${snapshot.agent}_${snapshot.session_id}`;
    this.agentStates.set(agentKey, {
      name: snapshot.agent,
      sessionId: snapshot.session_id,
      status: snapshot.status,
      model: snapshot.model,
      tokensUsed: snapshot.counters?.total_tokens || 0,
      cost: snapshot.token_cost || 0,
      summary: snapshot.summary,
      activeTasks: snapshot.counters?.tool_invocations || 0,
      messages: snapshot.counters?.assistant_responses || 0,
      lastUpdate: snapshot.timestamp
    });
  }

  updateConnectionStatus(newStatus) {
    // Connection status tracking (for future multi-client coordination)
    if (this.connectionStatus !== newStatus) {
      this.connectionStatus = newStatus;
      this.broadcast({
        type: 'connection',
        data: { status: newStatus }
      });
    }
  }

  startStatusChecker() {
    // Status checker for agent states - runs every 5 seconds
    this.statusCheckInterval = setInterval(() => {
      // Check for stale agents (no activity in 30 seconds)
      const now = Date.now();
      for (const [key, agent] of this.agentStates.entries()) {
        const lastUpdate = new Date(agent.lastUpdate).getTime();
        if (now - lastUpdate > DISCONNECT_TIMEOUT && agent.status !== 'stopped') {
          agent.status = 'offline';
        }
      }
    }, 5000);
  }

  startHttpServer() {
    const server = Bun.serve({
      port: this.port,
      fetch: (req, server) => {
        const url = new URL(req.url);

        // WebSocket upgrade
        if (req.headers.get('upgrade') === 'websocket') {
          const upgraded = server.upgrade(req);
          if (!upgraded) {
            return new Response('WebSocket upgrade failed', { status: 500 });
          }
          return undefined;
        }

        // Serve static files
        if (url.pathname === '/' || url.pathname === '/index.html') {
          return new Response(Bun.file(join(__dirname, 'app', 'index.html')));
        }

        if (url.pathname === '/test-notification-sound.html') {
          return new Response(Bun.file(join(__dirname, 'app', 'test-notification-sound.html')));
        }

        if (url.pathname === '/app.css') {
          return new Response(Bun.file(join(__dirname, 'app', 'app.css')), {
            headers: { 'Content-Type': 'text/css' }
          });
        }

        if (url.pathname === '/app.js') {
          return new Response(Bun.file(join(__dirname, 'app', 'app.js')), {
            headers: { 'Content-Type': 'application/javascript' }
          });
        }

        if (url.pathname.startsWith('/components/')) {
          const componentPath = join(__dirname, 'app', 'components', url.pathname.slice('/components/'.length));
          return new Response(Bun.file(componentPath), {
            headers: { 'Content-Type': 'application/javascript' }
          });
        }

        if (url.pathname.startsWith('/audio/')) {
          const audioPath = join(__dirname, 'app', 'audio', url.pathname.slice('/audio/'.length));
          return new Response(Bun.file(audioPath), {
            headers: { 'Content-Type': 'audio/ogg' }
          });
        }

        // API endpoints
        if (url.pathname === '/api/events') {
          return Response.json(this.eventBuffer);
        }

        if (url.pathname === '/api/metrics') {
          return Response.json({
            ...this.metrics,
            activeDaemons: this.metrics.activeDaemons.size,
            agents: Array.from(this.agentStates.values()),
            connectionStatus: this.connectionStatus
          });
        }

        return new Response('Not Found', { status: 404 });
      },
      websocket: {
        open: async (ws) => {
          this.clients.add(ws);
          // Register with ChannelManager for broadcasting
          this.channelManager.wsClients.add(ws);
          
          // Initialize PTY subscriptions set for this client
          ws.ptySubscriptions = new Set();
          
          // Load channels and sessions from disk
          const channels = this.channelManager.getAllChannels();
          const sessions = await this.loadSessions();
          
          // Send initial state
          ws.send(JSON.stringify({
            type: 'init',
            data: {
              channels: channels,
              sessions: sessions,
              events: this.eventBuffer.slice(-100), // Last 100 events
              metrics: {
                ...this.metrics,
                activeDaemons: this.metrics.activeDaemons.size,
                agents: Array.from(this.agentStates.values())
              },
              connectionStatus: this.connectionStatus
            }
          }));
        },
        message: (ws, message) => {
          try {
            const msg = JSON.parse(message);
            this.handleClientMessage(ws, msg);
          } catch (err) {
            console.error('Failed to parse WebSocket message:', err);
          }
        },
        close: (ws) => {
          // Clean up PTY subscriptions for this client
          if (this.ptyHandlers) {
            this.ptyHandlers.cleanup(ws);
          }
          this.clients.delete(ws);
          // Unregister from ChannelManager
          this.channelManager.wsClients.delete(ws);
        }
      }
    });

    this.httpServer = server;
  }

  handleClientMessage(ws, msg) {
    try {
      switch (msg.type) {
        case 'clear':
          this.eventBuffer = [];
          this.broadcast({ type: 'clear' });
          break;

        case 'ping':
          ws.send(JSON.stringify({ type: 'pong' }));
          break;

        // Client requests to submit a new user message for a session
        case 'submit':
          this.messageHandlers.handleSubmit(ws, msg, this);
          break;

        // Channel operations
        case 'channel:create':
        case 'channel:join':
          this.channelHandlers.handleCreate(ws, msg);
          break;

        case 'channel:delete':
        case 'channel:part':
          this.channelHandlers.handleDelete(ws, msg);
          break;

        case 'channel:add_agent':
          this.channelHandlers.handleAddAgent(ws, msg);
          break;

        case 'channel:remove_agent':
          this.channelHandlers.handleRemoveAgent(ws, msg);
          break;

        case 'channel:list':
          this.channelHandlers.handleList(ws, msg);
          break;

        // Agent operations
        case 'agent:invite':
          this.agentHandlers.handleInvite(ws, msg);
          break;

        case 'agent:pause':
          this.agentHandlers.handlePause(ws, msg);
          break;

        case 'agent:resume':
          this.agentHandlers.handleResume(ws, msg);
          break;

        case 'agent:stop':
          this.agentHandlers.handleStop(ws, msg);
          break;

        // Message operations
        case 'message:submit':
          this.messageHandlers.handleMessageSubmit(ws, msg);
          break;

        // Tool interactions
        case 'tool:approve':
          this.messageHandlers.handleToolApprove(ws, msg);
          break;

        case 'tool:reject':
          this.messageHandlers.handleToolReject(ws, msg);
          break;

        case 'tool:reply':
          this.messageHandlers.handleToolReply(ws, msg);
          break;

        // PTY operations
        case 'pty:attach':
          this.ptyHandlers.handleAttach(ws, msg);
          break;

        case 'pty:detach':
          this.ptyHandlers.handleDetach(ws, msg);
          break;

        case 'pty:input':
          this.ptyHandlers.handleInput(ws, msg);
          break;

        case 'pty:close':
          this.ptyHandlers.handleClose(ws, msg);
          break;

        // Session YAML editing
        case 'session:update':
          this.sessionHandlers.handleUpdate(ws, msg);
          break;

        // Template management
        case 'template:list':
          this.templateHandlers.handleList(ws, msg);
          break;

        case 'template:get':
          this.templateHandlers.handleGet(ws, msg);
          break;

        case 'template:save':
          this.templateHandlers.handleSave(ws, msg);
          break;

        case 'template:delete':
          this.templateHandlers.handleDelete(ws, msg);
          break;

        case 'template:autocomplete':
          this.templateHandlers.handleAutocomplete(ws, msg);
          break;

        default:
          ws.send(JSON.stringify({ 
            type: 'error', 
            error: `Unknown message type: ${msg.type}` 
          }));
      }
    } catch (err) {
      console.error('Error handling client message:', err);
      ws.send(JSON.stringify({ 
        type: 'error', 
        error: err.message 
      }));
    }
  }

  // === Utility Methods ===

  async loadChannels() {
    const channelsDir = join(this.workspaceRoot, 'agents', 'channels');
    const channels = [];
    
    try {
      const files = await fs.readdir(channelsDir);
      
      for (const file of files) {
        if (file.endsWith('.yaml')) {
          try {
            const filePath = join(channelsDir, file);
            const content = await fs.readFile(filePath, 'utf8');
            const channelData = yaml.load(content);
            
            if (channelData && channelData.metadata) {
              channels.push(channelData);
            }
          } catch (err) {
            console.warn(`Failed to load channel ${file}:`, err.message);
          }
        }
      }
    } catch (err) {
      console.warn('Failed to read channels directory:', err.message);
    }
    
    return channels;
  }

  async loadSessions() {
    const sessionsDir = join(this.workspaceRoot, 'agents', 'sessions');
    const sessions = [];
    
    try {
      const files = await fs.readdir(sessionsDir);
      
      for (const file of files) {
        if (file.endsWith('.yaml')) {
          try {
            const filePath = join(sessionsDir, file);
            const content = await fs.readFile(filePath, 'utf8');
            const sessionData = yaml.load(content);
            
            if (sessionData && sessionData.metadata) {
              // Add session_id to metadata (derived from filename)
              const sessionId = file.replace('.yaml', '');
              sessionData.metadata.session_id = sessionId;
              
              sessions.push(sessionData);
            }
          } catch (err) {
            console.warn(`Failed to load session ${file}:`, err.message);
          }
        }
      }
    } catch (err) {
      console.warn('Failed to read sessions directory:', err.message);
    }
    
    return sessions;
  }

  async appendUserMessage(sessionId, content) {
    // sessions directory relative to plugin
    const sessionsDir = join(__dirname, '..', '..', 'agents', 'sessions');
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

    return { ok: true, agent: sessionData.metadata?.name };
  }

  broadcast(message) {
    const msgStr = JSON.stringify(message);
    for (const client of this.clients) {
      try {
        client.send(msgStr);
      } catch (err) {
        console.error('Failed to send to client:', err);
        this.clients.delete(client);
      }
    }
  }

  /**
   * Start streaming PTY output to a WebSocket client
   * @param {string} sessionKey - Combined session ID (agentId:ptyId)
   * @param {string} agentSessionId - Agent session ID
   * @param {string} ptySessionId - PTY session ID
   * @param {WebSocket} ws - WebSocket client
   */
  startPtyStreaming(sessionKey, agentSessionId, ptySessionId, ws) {
    // Create unique key for this client's stream
    const streamKey = `${sessionKey}:${ws}`;
    
    // Clear any existing interval for this stream
    if (this.ptyStreamIntervals.has(streamKey)) {
      clearInterval(this.ptyStreamIntervals.get(streamKey));
    }

    // Poll for new output every 100ms
    const interval = setInterval(() => {
      try {
        const session = ptyManager.getSession(agentSessionId, ptySessionId);
        
        // Stop if session is gone or closed
        if (!session || session.closed) {
          this.stopPtyStreaming(sessionKey, ws);
          ws.send(JSON.stringify({
            type: 'pty:closed',
            session_id: sessionKey,
            exit_code: session?.exitCode,
            signal: session?.signal
          }));
          return;
        }

        // Check if client is still subscribed
        if (!ws.ptySubscriptions || !ws.ptySubscriptions.has(sessionKey)) {
          this.stopPtyStreaming(sessionKey, ws);
          return;
        }

        // Read new content since last read
        const result = session.read({ sinceLastRead: true });
        
        // Only send if there's new content
        if (result.content && result.content.length > 0) {
          ws.send(JSON.stringify({
            type: 'pty:output',
            session_id: sessionKey,
            data: result.content
          }));
        }
      } catch (err) {
        console.error('PTY streaming error:', err);
        this.stopPtyStreaming(sessionKey, ws);
      }
    }, 100);

    this.ptyStreamIntervals.set(streamKey, interval);
  }

  /**
   * Stop streaming PTY output to a WebSocket client
   * @param {string} sessionKey - Combined session ID
   * @param {WebSocket} ws - WebSocket client
   */
  stopPtyStreaming(sessionKey, ws) {
    const streamKey = `${sessionKey}:${ws}`;
    
    if (this.ptyStreamIntervals.has(streamKey)) {
      clearInterval(this.ptyStreamIntervals.get(streamKey));
      this.ptyStreamIntervals.delete(streamKey);
    }
  }

  /**
   * Close a PTY session
   * @param {string} agentSessionId - Agent session ID
   * @param {string} ptySessionId - PTY session ID
   */
  closePtySession(agentSessionId, ptySessionId) {
    const sessionKey = `${agentSessionId}:${ptySessionId}`;
    
    // Stop all streaming for this PTY
    for (const [streamKey, interval] of this.ptyStreamIntervals.entries()) {
      if (streamKey.startsWith(sessionKey + ':')) {
        clearInterval(interval);
        this.ptyStreamIntervals.delete(streamKey);
      }
    }

    // Close the PTY session
    const closed = ptyManager.closeSession(agentSessionId, ptySessionId, true);
    
    // Notify all clients
    if (closed) {
      this.broadcast({
        type: 'pty:closed',
        session_id: sessionKey
      });
    }
    
    return closed;
  }

  stop() {
    if (this.statusCheckInterval) {
      clearInterval(this.statusCheckInterval);
    }
    
    // Stop FSM Engine
    if (this.fsmEngine) {
      this.fsmEngine.stop();
    }
    
    // Clean up all PTY streaming intervals
    for (const [streamKey, interval] of this.ptyStreamIntervals.entries()) {
      clearInterval(interval);
    }
    this.ptyStreamIntervals.clear();
    
    if (this.httpServer) {
      this.httpServer.stop();
    }
    console.log('Observability server stopped');
  }
}

// CLI entry point
if (import.meta.main) {
  const port = parseInt(process.argv[2] || DEFAULT_PORT);
  const server = new ObservabilityServer(port);
  
  // Start is now async
  server.start().catch(err => {
    console.error('Failed to start server:', err);
    process.exit(1);
  });

  process.on('SIGINT', () => {
    console.log('\nShutting down...');
    server.stop();
    process.exit(0);
  });
}

export default ObservabilityServer;
