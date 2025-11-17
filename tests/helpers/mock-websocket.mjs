import { EventEmitter } from 'events';

/**
 * Mock WebSocket client for testing
 */
export class MockWebSocket extends EventEmitter {
  constructor() {
    super();
    this.readyState = MockWebSocket.CONNECTING;
    this.sentMessages = [];
    this.url = null;
  }

  static get CONNECTING() { return 0; }
  static get OPEN() { return 1; }
  static get CLOSING() { return 2; }
  static get CLOSED() { return 3; }

  /**
   * Simulate connection opening
   */
  open() {
    this.readyState = MockWebSocket.OPEN;
    this.emit('open');
  }

  /**
   * Send a message to the server
   */
  send(data) {
    if (this.readyState !== MockWebSocket.OPEN) {
      throw new Error('WebSocket is not open');
    }
    
    const message = typeof data === 'string' ? data : JSON.stringify(data);
    this.sentMessages.push(message);
    this.emit('send', message);
  }

  /**
   * Simulate receiving a message from the server
   */
  receiveMessage(data) {
    if (this.readyState !== MockWebSocket.OPEN) {
      return;
    }
    
    const message = typeof data === 'string' ? data : JSON.stringify(data);
    this.emit('message', { data: message });
  }

  /**
   * Close the connection
   */
  close(code = 1000, reason = '') {
    this.readyState = MockWebSocket.CLOSING;
    setTimeout(() => {
      this.readyState = MockWebSocket.CLOSED;
      this.emit('close', { code, reason });
    }, 0);
  }

  /**
   * Get all sent messages
   */
  getSentMessages() {
    return this.sentMessages;
  }

  /**
   * Get the last sent message
   */
  getLastSentMessage() {
    if (this.sentMessages.length === 0) {
      return null;
    }
    
    const last = this.sentMessages[this.sentMessages.length - 1];
    try {
      return JSON.parse(last);
    } catch {
      return last;
    }
  }

  /**
   * Clear sent messages
   */
  clearSentMessages() {
    this.sentMessages = [];
  }
  
  /**
   * Alias for clearSentMessages
   */
  clearMessages() {
    this.sentMessages = [];
  }
  
  /**
   * Wait for a message matching a condition
   * @param {function} condition - Function that receives parsed message and returns true if it matches
   * @param {number} timeout - Timeout in milliseconds
   * @returns {Promise<object>}
   */
  waitForMessage(condition, timeout = 5000) {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.removeListener('message', handler);
        reject(new Error('Timeout waiting for message'));
      }, timeout);

      const handler = (event) => {
        try {
          const message = JSON.parse(event.data);
          if (condition(message)) {
            clearTimeout(timeoutId);
            this.removeListener('message', handler);
            resolve(message);
          }
        } catch (err) {
          // Ignore parse errors
        }
      };

      this.on('message', handler);
    });
  }
}

/**
 * Mock WebSocket server for testing
 */
export class MockWebSocketServer extends EventEmitter {
  constructor() {
    super();
    this.clients = new Set();
    this.isRunning = false;
  }

  /**
   * Start the mock server
   */
  start() {
    this.isRunning = true;
    this.emit('start');
  }

  /**
   * Stop the mock server
   */
  stop() {
    this.isRunning = false;
    for (const client of this.clients) {
      client.close();
    }
    this.clients.clear();
    this.emit('stop');
  }

  /**
   * Add a mock client
   */
  addClient(client) {
    if (!this.isRunning) {
      throw new Error('Server is not running');
    }
    
    this.clients.add(client);
    client.open();
    this.emit('connection', client);
  }

  /**
   * Remove a client
   */
  removeClient(client) {
    this.clients.delete(client);
  }

  /**
   * Broadcast a message to all clients
   */
  broadcast(data) {
    for (const client of this.clients) {
      if (client.readyState === MockWebSocket.OPEN) {
        client.receiveMessage(data);
      }
    }
  }

  /**
   * Get all connected clients
   */
  getClients() {
    return Array.from(this.clients);
  }
}

/**
 * Create a mock WebSocket client
 * @param {string} url - WebSocket URL
 * @returns {MockWebSocket}
 */
export function createMockWebSocket(url = 'ws://localhost:3002') {
  const ws = new MockWebSocket();
  ws.url = url;
  return ws;
}

/**
 * Create a mock WebSocket server
 * @returns {MockWebSocketServer}
 */
export function createMockWebSocketServer() {
  return new MockWebSocketServer();
}
