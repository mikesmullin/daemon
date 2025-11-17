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
    
    this.sentMessages.push(data);
    this.emit('send', data);
  }

  /**
   * Simulate receiving a message from the server
   */
  receiveMessage(data) {
    if (this.readyState !== MockWebSocket.OPEN) {
      throw new Error('WebSocket is not open');
    }
    
    this.emit('message', { data });
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
    return this.sentMessages[this.sentMessages.length - 1];
  }

  /**
   * Clear sent messages
   */
  clearSentMessages() {
    this.sentMessages = [];
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
