// orchestrator-panel.mjs - Right sidebar for system actions
export class OrchestratorPanel extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  connectedCallback() {
    this.render();
  }

  addAction(action) {
    const actionEl = document.createElement('orchestrator-action');
    actionEl.setAttribute('tool', action.tool || 'unknown');
    actionEl.setAttribute('time', this.formatTime(action.timestamp));
    if (action.params) {
      actionEl.setAttribute('params', JSON.stringify(action.params, null, 2));
    }
    actionEl.textContent = action.description || '';
    this.appendChild(actionEl);
  }

  formatTime(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit',
      hour12: true
    });
  }

  clear() {
    while (this.firstChild) {
      this.removeChild(this.firstChild);
    }
  }

  render() {
    const title = this.getAttribute('title') || 'ORCHESTRATOR ACTIONS';

    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
          height: 100%;
          background: #0f0f0f;
          font-family: 'Inter', -apple-system, sans-serif;
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
        
        .content {
          height: calc(100% - 60px);
          overflow: visible;
          padding: 0;
        }
        
        .empty-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          height: 100%;
          color: #666;
          gap: 1rem;
          text-align: center;
          font-size: 0.875rem;
        }
        
        .empty-icon {
          font-size: 2rem;
          opacity: 0.5;
        }
      </style>
      
      <div class="header">
        <div class="title">${title}</div>
      </div>
      
      <div class="content">
        <slot>
          <div class="empty-state">
            <div class="empty-icon">🎯</div>
            <div>No orchestrator actions yet</div>
          </div>
        </slot>
      </div>
    `;
  }
}

customElements.define('orchestrator-panel', OrchestratorPanel);
