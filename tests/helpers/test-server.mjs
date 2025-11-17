import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { mkdirSync } from 'fs';

/**
 * Helper to start and stop a test server instance
 */
export class TestServer {
  constructor(port = 0) {
    this.port = port || this.getRandomPort();
    this.server = null;
    this.tempDir = null;
  }

  /**
   * Get a random available port
   */
  getRandomPort() {
    return 30000 + Math.floor(Math.random() * 10000);
  }

  /**
   * Create a temporary directory for test data
   */
  createTempDir() {
    this.tempDir = mkdtempSync(join(tmpdir(), 'daemon-test-'));
    
    // Create necessary subdirectories
    mkdirSync(join(this.tempDir, 'agents', 'channels'), { recursive: true });
    mkdirSync(join(this.tempDir, 'agents', 'sessions'), { recursive: true });
    mkdirSync(join(this.tempDir, 'agents', 'templates'), { recursive: true });
    
    return this.tempDir;
  }

  /**
   * Start the test server
   */
  async start() {
    this.createTempDir();
    
    // Import the server class dynamically
    const { default: ObservabilityServer } = await import('../../src/observability/daemon-browser.mjs');
    
    // Create server instance with temp directory
    this.server = new ObservabilityServer(this.port, {
      baseDir: this.tempDir,
      silent: true // Suppress logs during tests
    });
    
    // Start the server
    await this.server.start();
    
    return this;
  }

  /**
   * Stop the test server
   */
  async stop() {
    if (this.server) {
      await this.server.stop();
      this.server = null;
    }
    
    if (this.tempDir) {
      rmSync(this.tempDir, { recursive: true, force: true });
      this.tempDir = null;
    }
  }

  /**
   * Get the server URL
   */
  getUrl() {
    return `http://localhost:${this.port}`;
  }

  /**
   * Get the WebSocket URL
   */
  getWsUrl() {
    return `ws://localhost:${this.port}`;
  }

  /**
   * Get the temporary directory
   */
  getTempDir() {
    return this.tempDir;
  }

  /**
   * Get the server instance
   */
  getServer() {
    return this.server;
  }
}

/**
 * Create a test server and clean it up automatically
 */
export async function withTestServer(testFn) {
  const server = new TestServer();
  
  try {
    await server.start();
    await testFn(server);
  } finally {
    await server.stop();
  }
}
