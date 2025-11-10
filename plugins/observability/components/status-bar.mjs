// status-bar.mjs - Global status bar component
export class StatusBar extends HTMLElement {
  static observedAttributes = ['title', 'connection', 'active', 'running', 'logs', 'cost'];

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  connectedCallback() {
    this.render();
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (oldValue !== newValue) {
      this.render();
    }
  }

  render() {
    const title = this.getAttribute('title') || 'MULTI-AGENT OBSERVABILITY';
    const connection = this.getAttribute('connection') || 'disconnected';
    const active = this.getAttribute('active') || '0';
    const running = this.getAttribute('running') || '0';
    const logs = this.getAttribute('logs') || '0';
    const cost = parseFloat(this.getAttribute('cost') || '0').toFixed(3);

    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
          background: #1a1a1a;
          border-bottom: 1px solid #333;
          font-family: 'Inter', -apple-system, sans-serif;
        }
        
        .bar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0.75rem 1.5rem;
          height: 60px;
        }
        
        .left {
          display: flex;
          align-items: center;
          gap: 2rem;
        }
        
        .title {
          font-size: 0.875rem;
          font-weight: 700;
          letter-spacing: 0.05em;
          color: #00d4ff;
          text-transform: uppercase;
        }
        
        .connection {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          font-size: 0.75rem;
          color: #a0a0a0;
        }
        
        .dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          transition: all 0.3s ease;
        }
        
        .dot.connected {
          background: #00ff88;
          box-shadow: 0 0 8px #00ff88;
        }
        
        .dot.connected.pulse {
          animation: pulse 0.5s ease-out;
        }
        
        .dot.connecting {
          background: #ffaa33;
          box-shadow: 0 0 8px #ffaa33;
          animation: blink 1.5s infinite;
        }
        
        .dot.disconnected {
          background: #ff4444;
          box-shadow: 0 0 8px #ff4444;
        }
        
        @keyframes pulse {
          0% { transform: scale(1); }
          50% { transform: scale(1.5); opacity: 0.7; }
          100% { transform: scale(1); }
        }
        
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        
        .counters {
          display: flex;
          gap: 2rem;
        }
        
        .counter {
          display: flex;
          flex-direction: column;
          gap: 0.125rem;
        }
        
        .counter-label {
          font-size: 0.625rem;
          color: #666;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        
        .counter-value {
          font-size: 1rem;
          font-weight: 600;
          color: #e0e0e0;
          font-family: 'JetBrains Mono', monospace;
        }
        
        .actions {
          display: flex;
          gap: 0.75rem;
        }
        
        ::slotted(button) {
          padding: 0.5rem 1rem;
          border: 1px solid #444;
          background: #2a2a2a;
          color: #e0e0e0;
          font-size: 0.75rem;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          cursor: pointer;
          transition: all 0.2s;
          border-radius: 4px;
        }
        
        ::slotted(button:hover) {
          background: #333;
          border-color: #00d4ff;
          color: #00d4ff;
        }
      </style>
      
      <div class="bar">
        <div class="left">
          <div class="title" part="title">
            <slot name="title">${title}</slot>
          </div>
          <div class="connection" part="connection">
            <div class="dot ${connection}" part="connection-indicator"></div>
            <span>${connection.toUpperCase()}</span>
          </div>
        </div>
        
        <div class="counters" part="counters">
          <div class="counter">
            <div class="counter-label">Active Agents</div>
            <div class="counter-value">${active}</div>
          </div>
          <div class="counter">
            <div class="counter-label">Running Tasks</div>
            <div class="counter-value">${running}</div>
          </div>
          <div class="counter">
            <div class="counter-label">Log Entries</div>
            <div class="counter-value">${logs}</div>
          </div>
          <div class="counter">
            <div class="counter-label">Total Cost</div>
            <div class="counter-value">$${cost}</div>
          </div>
        </div>
        
        <div class="actions">
          <slot name="actions"></slot>
        </div>
      </div>
    `;
  }

  triggerPulse() {
    const dot = this.shadowRoot.querySelector('.dot');
    if (dot && dot.classList.contains('connected')) {
      dot.classList.remove('pulse');
      void dot.offsetWidth; // Force reflow
      dot.classList.add('pulse');
    }
  }
}

customElements.define('status-bar', StatusBar);
