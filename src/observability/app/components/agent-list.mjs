// Agent List - Shows all agents in the current channel
class AgentList extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    
    // Internal data storage (for properties set by Alpine.js)
    this._agents = [];
    this._currentChannel = null;
  }

  connectedCallback() {
    this.render();
  }

  static get observedAttributes() {
    return ['agents', 'current-channel'];
  }

  attributeChangedCallback() {
    this.render();
  }

  // Support both property and attribute setting (for Alpine.js)
  set agents(value) {
    if (Array.isArray(value)) {
      this._agents = value;
      this.render();
    }
  }

  get agents() {
    // First try internal property (set by Alpine.js)
    if (this._agents && this._agents.length > 0) {
      return this._agents;
    }
    // Fall back to attribute
    try {
      return JSON.parse(this.getAttribute('agents') || '[]');
    } catch {
      return [];
    }
  }

  set currentChannel(value) {
    this._currentChannel = value;
    this.render();
  }

  get currentChannel() {
    // First try internal property
    if (this._currentChannel !== null) {
      return this._currentChannel;
    }
    // Fall back to attribute
    return this.getAttribute('current-channel');
  }

  render() {
    const agents = this.agents;

    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: flex;
          flex-direction: column;
          height: 100%;
        }
        
        .header {
          padding: 1rem 1.5rem;
          background: #1a1a1a;
          border-bottom: 1px solid #333;
        }
        
        .title {
          font-size: 0.875rem;
          font-weight: 700;
          color: #e0e0e0;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        
        .agents-container {
          flex: 1;
          overflow-y: auto;
          padding: 0.5rem;
        }
        
        .agent-card {
          background: #1a1a1a;
          border: 1px solid #333;
          border-radius: 8px;
          padding: 0.75rem;
          margin-bottom: 0.5rem;
          transition: all 0.2s;
        }
        
        .agent-card:hover {
          border-color: #00d4ff;
          box-shadow: 0 0 0 1px #00d4ff22;
        }
        
        .agent-header {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          margin-bottom: 0.5rem;
        }
        
        .status-indicator {
          width: 10px;
          height: 10px;
          border-radius: 50%;
          flex-shrink: 0;
        }
        
        .status-indicator.online { background: #00ff00; }
        .status-indicator.working { 
          background: #00ff00; 
          animation: pulse 1.5s ease-in-out infinite;
        }
        .status-indicator.paused { background: #ffa500; }
        .status-indicator.unresponsive { 
          background: #ffa500; 
          animation: pulse 1.5s ease-in-out infinite;
        }
        .status-indicator.error { background: #ff0000; }
        .status-indicator.offline { 
          background: #ff0000; 
          animation: pulse 1.5s ease-in-out infinite;
        }
        .status-indicator.stopped { background: #666; }
        
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
        
        .avatar {
          width: 28px;
          height: 28px;
          border-radius: 50%;
          background: #00d4ff;
          color: #000;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 0.875rem;
          font-weight: 600;
          flex-shrink: 0;
        }
        
        .agent-info {
          flex: 1;
          min-width: 0;
        }
        
        .agent-name {
          font-weight: 600;
          color: #e0e0e0;
          font-size: 0.875rem;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          cursor: pointer;
          transition: color 0.2s;
        }
        
        .agent-name:hover {
          color: #00d4ff;
        }
        
        .session-id {
          color: #666;
          font-size: 0.75rem;
        }
        
        .action-bar {
          display: flex;
          gap: 0.25rem;
          opacity: 0;
          transition: opacity 0.2s;
        }
        
        .agent-card:hover .action-bar {
          opacity: 1;
        }
        
        .action-btn {
          width: 24px;
          height: 24px;
          border: none;
          background: #2a2a2a;
          color: #888;
          border-radius: 4px;
          cursor: pointer;
          font-size: 0.75rem;
          font-weight: 600;
          transition: all 0.2s;
          display: flex;
          align-items: center;
          justify-content: center;
          font-family: 'Inter', sans-serif;
        }
        
        .action-btn:hover {
          background: #333;
          color: #e0e0e0;
        }
        
        .action-btn.mute:hover { color: #ffa500; }
        .action-btn.pause:hover { color: #ffa500; }
        .action-btn.stop:hover { color: #ff0000; }
        
        .pty-list {
          margin-top: 0.5rem;
          padding-left: 1.5rem;
        }
        
        .pty-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.25rem;
          padding: 0.25rem 0.5rem;
          font-size: 0.75rem;
          color: #888;
          cursor: pointer;
          transition: all 0.2s;
          border-radius: 4px;
        }
        
        .pty-item:hover {
          color: #00d4ff;
          background: #1a1a1a;
        }
        
        .pty-icon {
          margin-right: 0.25rem;
        }
        
        .pty-cmd {
          flex: 1;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          font-family: 'JetBrains Mono', monospace;
          min-width: 0;
        }
        
        .pty-close {
          width: 18px;
          height: 18px;
          border: none;
          background: transparent;
          color: #666;
          cursor: pointer;
          border-radius: 3px;
          font-size: 0.875rem;
          opacity: 0;
          transition: all 0.2s;
          flex-shrink: 0;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        
        .pty-item:hover .pty-close {
          opacity: 1;
        }
        
        .pty-close:hover {
          background: #ff0000;
          color: #fff;
        }
        
        .empty-state {
          padding: 2rem 1rem;
          text-align: center;
          color: #666;
          font-size: 0.875rem;
        }
      </style>
      
      <div class="header">
        <div class="title">Agents</div>
      </div>
      
      <div class="agents-container">
        ${agents.length === 0 ? `
          <div class="empty-state">
            No agents in this channel yet.
          </div>
        ` : agents.map(agent => this.renderAgent(agent)).join('')}
      </div>
    `;

    // Set up event listeners
    this.shadowRoot.querySelectorAll('[data-action="mute"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const sessionId = btn.closest('.agent-card').dataset.sessionId;
        this.dispatchEvent(new CustomEvent('agent-mute', { 
          detail: { sessionId } 
        }));
      });
    });

    this.shadowRoot.querySelectorAll('[data-action="pause"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const sessionId = btn.closest('.agent-card').dataset.sessionId;
        const status = btn.closest('.agent-card').dataset.status;
        if (status === 'paused') {
          this.dispatchEvent(new CustomEvent('agent-resume', { 
            detail: { sessionId } 
          }));
        } else {
          this.dispatchEvent(new CustomEvent('agent-pause', { 
            detail: { sessionId } 
          }));
        }
      });
    });

    this.shadowRoot.querySelectorAll('[data-action="stop"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const sessionId = btn.closest('.agent-card').dataset.sessionId;
        if (confirm('Stop this agent?')) {
          this.dispatchEvent(new CustomEvent('agent-stop', { 
            detail: { sessionId } 
          }));
        }
      });
    });

    this.shadowRoot.querySelectorAll('.pty-item').forEach(item => {
      item.addEventListener('click', (e) => {
        if (e.target.closest('.pty-close')) return;
        const ptyId = item.dataset.ptyId;
        this.dispatchEvent(new CustomEvent('pty-view', { 
          detail: { sessionId: ptyId } 
        }));
      });
    });

    this.shadowRoot.querySelectorAll('.pty-close').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const ptyId = btn.closest('.pty-item').dataset.ptyId;
        this.dispatchEvent(new CustomEvent('pty-close', { 
          detail: { sessionId: ptyId } 
        }));
      });
    });

    // Add click handler for agent names to populate @mention
    this.shadowRoot.querySelectorAll('.agent-name').forEach(nameEl => {
      nameEl.addEventListener('click', (e) => {
        e.stopPropagation();
        const card = nameEl.closest('.agent-card');
        const name = card.querySelector('.agent-info .agent-name').textContent.trim();
        const sessionId = parseInt(card.dataset.sessionId, 10);
        this.dispatchEvent(new CustomEvent('agent-mention', { 
          detail: { name, sessionId } 
        }));
      });
    });
  }

  renderAgent(agent) {
    const name = agent.name || 'unknown';
    const sessionId = agent.session_id || agent.id || '';
    const status = agent.status || 'online';
    const avatar = name[0].toUpperCase();
    const ptySessions = agent.pty_sessions || [];

    return `
      <div class="agent-card" data-session-id="${sessionId}" data-status="${status}">
        <div class="agent-header">
          <div class="status-indicator ${status}"></div>
          <div class="avatar">${avatar}</div>
          <div class="agent-info">
            <div class="agent-name" title="${this.escapeHtml(name)}">${this.escapeHtml(name)}</div>
            ${sessionId ? `<div class="session-id">#${sessionId}</div>` : ''}
          </div>
          <div class="action-bar">
            <button class="action-btn mute" data-action="mute" title="Mute this agent">M</button>
            <button class="action-btn pause" data-action="pause" title="${status === 'paused' ? 'Resume' : 'Pause'}">
              ${status === 'paused' ? 'R' : 'P'}
            </button>
            <button class="action-btn stop" data-action="stop" title="Stop this agent">S</button>
          </div>
        </div>
        
        ${ptySessions.length > 0 ? `
          <div class="pty-list">
            ${ptySessions.map(pty => `
              <div class="pty-item" data-pty-id="${pty.id}" title="${this.escapeHtml(pty.cmd || 'No command')}">
                <span class="pty-icon">∟</span>
                <span class="pty-cmd">pty #${pty.id} ${this.escapeHtml(pty.cmd || '')}</span>
                <button class="pty-close" title="Close PTY">c</button>
              </div>
            `).join('')}
          </div>
        ` : ''}
      </div>
    `;
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

customElements.define('agent-list', AgentList);
