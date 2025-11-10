// agent-card.mjs - Agent status card component
export class AgentCard extends HTMLElement {
  static observedAttributes = ['name', 'status', 'model', 'tokens-used', 'tokens-total', 'cost', 'active-tasks', 'tools-in-use', 'messages', 'errors'];

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  connectedCallback() {
    this.render();
    this.addEventListener('click', this.handleClick);
  }

  disconnectedCallback() {
    this.removeEventListener('click', this.handleClick);
  }

  attributeChangedCallback() {
    this.render();
  }

  handleClick = () => {
    this.dispatchEvent(new CustomEvent('agent-click', {
      bubbles: true,
      composed: true,
      detail: { agent: this.getAttribute('name') }
    }));
  }

  getStatusColor() {
    const status = this.getAttribute('status') || 'idle';
    const colors = {
      idle: '#666',
      running: '#00ff88',
      stopped: '#ff4444',
      error: '#ff4444',
      ready: '#ffaa33'
    };
    return colors[status] || '#666';
  }

  getProgressColor(percentage) {
    if (percentage < 70) return '#00ff88';
    if (percentage < 90) return '#ffaa33';
    return '#ff4444';
  }

  render() {
    const name = this.getAttribute('name') || 'unknown-agent';
    const status = this.getAttribute('status') || 'idle';
    const model = this.getAttribute('model') || 'N/A';
    const tokensUsed = parseInt(this.getAttribute('tokens-used') || '0');
    const tokensTotal = parseInt(this.getAttribute('tokens-total') || '200000');
    const cost = parseFloat(this.getAttribute('cost') || '0').toFixed(4);
    const activeTasks = this.getAttribute('active-tasks') || '0';
    const toolsInUse = this.getAttribute('tools-in-use') || '0';
    const messages = this.getAttribute('messages') || '0';
    const errors = this.getAttribute('errors') || '0';

    const percentage = (tokensUsed / tokensTotal) * 100;
    const progressColor = this.getProgressColor(percentage);
    const statusColor = this.getStatusColor();

    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
          background: #1a1a1a;
          border: 1px solid #333;
          border-radius: 8px;
          padding: 1rem;
          margin-bottom: 0.75rem;
          cursor: pointer;
          transition: all 0.2s;
          font-family: 'Inter', -apple-system, sans-serif;
        }
        
        :host(:hover) {
          background: #222;
          border-color: ${statusColor};
          box-shadow: 0 4px 12px rgba(0, 212, 255, 0.1);
          transform: translateY(-2px);
        }
        
        .header {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          margin-bottom: 0.75rem;
        }
        
        .avatar {
          width: 12px;
          height: 12px;
          border-radius: 50%;
          background: ${statusColor};
          box-shadow: 0 0 8px ${statusColor};
          flex-shrink: 0;
        }
        
        .info {
          flex: 1;
          min-width: 0;
        }
        
        .name {
          font-size: 0.875rem;
          font-weight: 600;
          color: #e0e0e0;
          margin-bottom: 0.25rem;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        
        .status-badge {
          display: inline-block;
          padding: 0.125rem 0.5rem;
          background: ${statusColor}22;
          color: ${statusColor};
          font-size: 0.625rem;
          font-weight: 600;
          text-transform: uppercase;
          border-radius: 4px;
          letter-spacing: 0.05em;
        }
        
        .model {
          font-size: 0.75rem;
          color: #888;
          font-family: 'JetBrains Mono', monospace;
          margin-top: 0.5rem;
        }
        
        .progress {
          margin: 0.75rem 0;
        }
        
        .progress-label {
          font-size: 0.625rem;
          color: #888;
          margin-bottom: 0.25rem;
          display: flex;
          justify-content: space-between;
        }
        
        .progress-bar-bg {
          width: 100%;
          height: 6px;
          background: #2a2a2a;
          border-radius: 3px;
          overflow: hidden;
        }
        
        .progress-bar {
          height: 100%;
          background: ${progressColor};
          width: ${percentage}%;
          transition: all 0.3s ease;
          box-shadow: 0 0 8px ${progressColor}88;
        }
        
        .stats {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 0.5rem;
          margin-top: 0.75rem;
        }
        
        .stat {
          display: flex;
          align-items: center;
          gap: 0.375rem;
          font-size: 0.75rem;
        }
        
        .stat-icon {
          color: #666;
          font-size: 0.875rem;
        }
        
        .stat-value {
          color: #e0e0e0;
          font-weight: 500;
        }
        
        .cost {
          margin-top: 0.75rem;
          padding-top: 0.75rem;
          border-top: 1px solid #333;
          font-size: 0.75rem;
          color: #888;
          display: flex;
          justify-content: space-between;
        }
        
        .cost-value {
          color: #00ff88;
          font-weight: 600;
          font-family: 'JetBrains Mono', monospace;
        }
        
        .error {
          color: #ff4444;
        }
      </style>
      
      <div class="header">
        <div class="avatar" part="avatar"></div>
        <div class="info">
          <div class="name">${name}</div>
          <span class="status-badge" part="status-badge">${status}</span>
        </div>
      </div>
      
      <div class="model">Model: ${model}</div>
      
      <div class="progress">
        <div class="progress-label">
          <span>Token Usage</span>
          <span>${tokensUsed.toLocaleString()} / ${tokensTotal.toLocaleString()}</span>
        </div>
        <div class="progress-bar-bg">
          <div class="progress-bar" part="progress-bar"></div>
        </div>
      </div>
      
      <div class="stats">
        <div class="stat">
          <span class="stat-icon">📋</span>
          <span class="stat-value">${activeTasks}</span>
          <span style="color: #666;">tasks</span>
        </div>
        <div class="stat">
          <span class="stat-icon">🔧</span>
          <span class="stat-value">${toolsInUse}</span>
          <span style="color: #666;">tools</span>
        </div>
        <div class="stat">
          <span class="stat-icon">💬</span>
          <span class="stat-value">${messages}</span>
          <span style="color: #666;">msgs</span>
        </div>
        <div class="stat ${errors !== '0' ? 'error' : ''}">
          <span class="stat-icon">⚠️</span>
          <span class="stat-value">${errors}</span>
          <span style="color: #666;">errors</span>
        </div>
      </div>
      
      <div class="cost" part="cost">
        <span>Cost</span>
        <span class="cost-value">$${cost}</span>
      </div>
    `;
  }
}

customElements.define('agent-card', AgentCard);
