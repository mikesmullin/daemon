// PTY Viewer - Full-screen terminal view using xterm.js
class PtyViewer extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.terminal = null;
    this.fitAddon = null;
    this.isAttached = false;
    
    // Bind event handler
    this.handlePtyData = this.handlePtyData.bind(this);
  }

  connectedCallback() {
    this.render();
    this.initTerminal();
    
    // Listen for PTY data events from parent (app.js)
    window.addEventListener('pty:output', this.handlePtyData);
  }

  disconnectedCallback() {
    if (this.terminal) {
      this.terminal.dispose();
    }
    this.detachFromPty();
    
    // Remove event listener
    window.removeEventListener('pty:output', this.handlePtyData);
  }

  static get observedAttributes() {
    return ['session-id'];
  }

  get sessionId() {
    return this.getAttribute('session-id');
  }
  
  /**
   * Handle PTY output data from parent
   * Called when app.js receives pty:output from WebSocket
   */
  handlePtyData(event) {
    const { sessionId, data, initialContent } = event.detail || {};
    
    // Only handle data for our session
    if (sessionId !== this.sessionId) return;
    
    if (this.terminal) {
      if (initialContent !== undefined) {
        // Initial buffer content when attaching
        this.terminal.clear();
        this.terminal.write(initialContent);
      } else if (data !== undefined) {
        // Stream data
        this.terminal.write(data);
      }
    }
  }

  render() {
    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
          background: #000;
        }
        
        .pty-container {
          height: 100vh;
          display: flex;
          flex-direction: column;
        }
        
        .header {
          padding: 1rem 1.5rem;
          background: #1a1a1a;
          border-bottom: 1px solid #333;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        
        .title {
          color: #e0e0e0;
          font-size: 0.875rem;
          font-weight: 600;
        }
        
        .close-btn {
          width: 32px;
          height: 32px;
          border: none;
          background: #2a2a2a;
          color: #e0e0e0;
          border-radius: 6px;
          cursor: pointer;
          font-size: 1.25rem;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s;
        }
        
        .close-btn:hover {
          background: #ff0000;
          color: #fff;
        }
        
        .terminal-wrapper {
          flex: 1;
          padding: 1rem;
          overflow: hidden;
        }
        
        #terminal {
          width: 100%;
          height: 100%;
        }
      </style>
      
      <div class="pty-container">
        <div class="header">
          <div class="title">PTY Session: ${this.escapeHtml(this.sessionId || 'unknown')}</div>
          <button class="close-btn" title="Close">✕</button>
        </div>
        <div class="terminal-wrapper">
          <div id="terminal"></div>
        </div>
      </div>
    `;

    // Close button handler
    this.shadowRoot.querySelector('.close-btn').addEventListener('click', () => {
      this.dispatchEvent(new CustomEvent('close'));
    });
  }

  initTerminal() {
    // Wait for xterm.js to be available
    if (typeof Terminal === 'undefined') {
      console.error('xterm.js not loaded');
      return;
    }

    const terminalEl = this.shadowRoot.querySelector('#terminal');
    
    this.terminal = new Terminal({
      cursorBlink: true,
      theme: {
        background: '#0f0f0f',
        foreground: '#e0e0e0',
        cursor: '#00d4ff',
        cursorAccent: '#000',
        selection: 'rgba(0, 212, 255, 0.3)',
        black: '#000000',
        red: '#ff6b6b',
        green: '#00ff00',
        yellow: '#ffcc00',
        blue: '#00d4ff',
        magenta: '#ff00ff',
        cyan: '#00ffff',
        white: '#ffffff',
        brightBlack: '#666666',
        brightRed: '#ff8888',
        brightGreen: '#88ff88',
        brightYellow: '#ffdd88',
        brightBlue: '#88ddff',
        brightMagenta: '#ff88ff',
        brightCyan: '#88ffff',
        brightWhite: '#ffffff'
      },
      fontSize: 14,
      fontFamily: "'JetBrains Mono', monospace",
      scrollback: 10000,
      convertEol: true,
      // Fixed size (no fit addon for now per PRD)
      cols: 80,
      rows: 24
    });

    this.terminal.open(terminalEl);

    // Handle user input
    this.terminal.onData((data) => {
      this.sendInput(data);
    });

    // Attach to PTY session
    this.attachToPty();

    // Welcome message
    this.terminal.writeln('\x1b[1;36m📡 Connecting to PTY session...\x1b[0m');
  }

  attachToPty() {
    if (!this.sessionId || this.isAttached) return;

    // Dispatch event that app.js will handle and send via WebSocket
    window.dispatchEvent(new CustomEvent('pty:attach-request', {
      detail: { sessionId: this.sessionId }
    }));
    
    this.isAttached = true;
  }

  detachFromPty() {
    if (!this.sessionId || !this.isAttached) return;

    // Dispatch event that app.js will handle and send via WebSocket
    window.dispatchEvent(new CustomEvent('pty:detach-request', {
      detail: { sessionId: this.sessionId }
    }));
    
    this.isAttached = false;
  }

  sendInput(data) {
    if (!this.sessionId) return;

    // Dispatch event that app.js will handle and send via WebSocket
    window.dispatchEvent(new CustomEvent('pty:input-request', {
      detail: {
        sessionId: this.sessionId,
        data: data
      }
    }));
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

customElements.define('pty-viewer', PtyViewer);
