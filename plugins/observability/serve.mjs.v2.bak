#!/usr/bin/env bun
import dgram from 'dgram';
import fs from 'fs/promises';
import yaml from 'js-yaml';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DEFAULT_PORT = 3002;
const DISCONNECT_TIMEOUT = 30000; // 30 seconds

class ObservabilityServer {
  constructor(port = DEFAULT_PORT) {
    this.port = port;
    this.udpServer = null;
    this.httpServer = null;
    this.clients = new Set();
    this.lastUdpActivity = null;
    this.connectionStatus = 'connecting';
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
  }

  start() {
    this.startUdpServer();
    this.startHttpServer();
    this.startStatusChecker();
    console.log(`🔍 Observability server running on http://localhost:${this.port}`);
    console.log(`📡 Listening for UDP events on port ${this.port}`);
  }

  startUdpServer() {
    this.udpServer = dgram.createSocket('udp4');

    this.udpServer.on('message', (msg, rinfo) => {
      try {
        const event = JSON.parse(msg.toString());
        this.handleEvent(event);
        this.lastUdpActivity = Date.now();
        this.updateConnectionStatus('connected');
      } catch (err) {
        console.error('Failed to parse UDP message:', err);
      }
    });

    this.udpServer.on('error', (err) => {
      console.error('UDP server error:', err);
    });

    this.udpServer.bind(this.port);
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
    if (this.connectionStatus !== newStatus) {
      this.connectionStatus = newStatus;
      this.broadcast({
        type: 'connection',
        data: { status: newStatus }
      });
    }
  }

  startStatusChecker() {
    this.statusCheckInterval = setInterval(() => {
      if (this.lastUdpActivity) {
        const timeSinceLastActivity = Date.now() - this.lastUdpActivity;
        if (timeSinceLastActivity > DISCONNECT_TIMEOUT) {
          this.updateConnectionStatus('disconnected');
        }
      }
    }, 5000); // Check every 5 seconds
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
          return new Response(Bun.file(join(__dirname, 'public', 'index.html')));
        }

        if (url.pathname.startsWith('/components/')) {
          const componentPath = join(__dirname, 'components', url.pathname.slice('/components/'.length));
          return new Response(Bun.file(componentPath), {
            headers: { 'Content-Type': 'application/javascript' }
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
        open: (ws) => {
          this.clients.add(ws);
          // Send initial state
          ws.send(JSON.stringify({
            type: 'init',
            data: {
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
          this.clients.delete(ws);
        }
      }
    });

    this.httpServer = server;
  }

  handleClientMessage(ws, msg) {
    switch (msg.type) {
      case 'clear':
        this.eventBuffer = [];
        this.broadcast({ type: 'clear' });
        break;

      case 'ping':
        ws.send(JSON.stringify({ type: 'pong' }));
        break;

      // Client requests to submit a new user message for a session
      // payload: { type: 'submit', session_id: '123', content: 'Hello' }
      case 'submit':
        (async () => {
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
            this.handleEvent(event);
          } catch (err) {
            ws.send(JSON.stringify({ type: 'submit:response', ok: false, error: err.message }));
          }
        })();
        break;
    }
  }

  async appendUserMessage(sessionId, content) {
    // sessions directory relative to plugin
    const sessionsDir = join(__dirname, '..', '..', 'agents', 'sessions');
    const procDir = join(__dirname, '..', '..', 'agents', 'proc');
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

  stop() {
    if (this.statusCheckInterval) {
      clearInterval(this.statusCheckInterval);
    }
    if (this.udpServer) {
      this.udpServer.close();
    }
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
  server.start();

  process.on('SIGINT', () => {
    console.log('\nShutting down...');
    server.stop();
    process.exit(0);
  });
}

export default ObservabilityServer;
