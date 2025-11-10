// event-item.mjs - Individual event in the timeline
export class EventItem extends HTMLElement {
  static observedAttributes = ['timestamp', 'type', 'agent', 'agent-color', 'context-tokens', 'collapsible'];

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.expanded = false;
  }

  connectedCallback() {
    this.render();
  }

  attributeChangedCallback() {
    this.render();
  }

  getTypeConfig() {
    const type = this.getAttribute('type') || 'response';
    const configs = {
      response: { color: '#00ff88', icon: '💬', label: 'RESPONSE' },
      tool: { color: '#bb88ff', icon: '🔧', label: 'TOOL' },
      thinking: { color: '#ffaa33', icon: '💭', label: 'THINKING' },
      hook: { color: '#00ffff', icon: '⚓', label: 'HOOK' },
      'user_request': { color: '#00d4ff', icon: '👤', label: 'USER' },
      'tool_call': { color: '#bb88ff', icon: '🔧', label: 'TOOL CALL' },
      'tool_response': { color: '#9966ff', icon: '✓', label: 'TOOL RESULT' }
    };
    return configs[type] || configs.response;
  }

  toggleExpand = () => {
    this.expanded = !this.expanded;
    const content = this.shadowRoot.querySelector('.content');
    const button = this.shadowRoot.querySelector('.show-more');
    
    if (this.expanded) {
      content.style.maxHeight = 'none';
      if (button) button.textContent = 'Show Less';
    } else {
      content.style.maxHeight = '100px';
      if (button) button.textContent = 'Show More';
    }

    this.dispatchEvent(new CustomEvent('expand-toggle', {
      bubbles: true,
      composed: true,
      detail: { expanded: this.expanded }
    }));
  }

  handleAgentClick = (e) => {
    e.stopPropagation();
    this.dispatchEvent(new CustomEvent('agent-filter', {
      bubbles: true,
      composed: true,
      detail: { agent: this.getAttribute('agent') }
    }));
  }

  render() {
    const timestamp = this.getAttribute('timestamp') || '';
    const agent = this.getAttribute('agent') || 'system';
    const agentColor = this.getAttribute('agent-color') || '#00d4ff';
    const contextTokens = this.getAttribute('context-tokens') || '';
    const collapsible = this.getAttribute('collapsible') !== 'false';
    
    const typeConfig = this.getTypeConfig();
    const content = this.innerHTML || this.textContent || '';
    const needsCollapse = collapsible && content.length > 200;

    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
          padding: 1rem;
          border-bottom: 1px solid #2a2a2a;
          font-family: 'Inter', -apple-system, sans-serif;
          position: relative;
          animation: fadeIn 0.3s ease;
        }
        
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        
        :host(:hover) {
          background: #1a1a1a;
        }
        
        .thread-line {
          position: absolute;
          left: 3.25rem;
          top: 0;
          bottom: 0;
          width: 2px;
          background: ${agentColor}33;
        }
        
        .header {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          margin-bottom: 0.75rem;
        }
        
        .timestamp {
          font-family: 'JetBrains Mono', monospace;
          font-size: 0.75rem;
          color: #666;
          min-width: 70px;
        }
        
        .type-badge {
          display: inline-flex;
          align-items: center;
          gap: 0.375rem;
          padding: 0.25rem 0.625rem;
          background: ${typeConfig.color}22;
          color: ${typeConfig.color};
          font-size: 0.625rem;
          font-weight: 700;
          text-transform: uppercase;
          border-radius: 4px;
          letter-spacing: 0.05em;
          border: 1px solid ${typeConfig.color}44;
        }
        
        .icon {
          font-size: 0.875rem;
        }
        
        .agent-name {
          font-size: 0.75rem;
          color: ${agentColor};
          cursor: pointer;
          font-weight: 600;
          transition: all 0.2s;
        }
        
        .agent-name:hover {
          color: ${agentColor};
          text-shadow: 0 0 8px ${agentColor};
        }
        
        .context {
          font-size: 0.625rem;
          color: #666;
          font-family: 'JetBrains Mono', monospace;
          margin-left: auto;
        }
        
        .content {
          margin-left: 4.75rem;
          color: #e0e0e0;
          font-size: 0.875rem;
          line-height: 1.6;
          white-space: pre-wrap;
          word-break: break-word;
          max-height: ${needsCollapse ? '100px' : 'none'};
          overflow: hidden;
          transition: max-height 0.3s ease;
        }
        
        .content code {
          background: #2a2a2a;
          padding: 0.125rem 0.375rem;
          border-radius: 3px;
          font-family: 'JetBrains Mono', monospace;
          font-size: 0.8125rem;
          color: #bb88ff;
        }
        
        .show-more {
          margin-left: 4.75rem;
          margin-top: 0.5rem;
          background: none;
          border: none;
          color: #00d4ff;
          font-size: 0.75rem;
          cursor: pointer;
          padding: 0;
          transition: all 0.2s;
        }
        
        .show-more:hover {
          color: #00ffff;
          text-shadow: 0 0 8px #00d4ff;
        }
      </style>
      
      <div class="thread-line" part="thread-line"></div>
      
      <div class="header">
        <div class="timestamp" part="timestamp">${timestamp}</div>
        <div class="type-badge" part="type-badge">
          <span class="icon">${typeConfig.icon}</span>
          <span>${typeConfig.label}</span>
        </div>
        <div class="agent-name" part="agent-name">${agent}</div>
        ${contextTokens ? `<div class="context">${contextTokens}</div>` : ''}
      </div>
      
      <div class="content" part="content">
        <slot>${content}</slot>
      </div>
      
      ${needsCollapse ? '<button class="show-more" part="show-more">Show More</button>' : ''}
    `;

    // Add event listeners
    const agentNameEl = this.shadowRoot.querySelector('.agent-name');
    if (agentNameEl) {
      agentNameEl.addEventListener('click', this.handleAgentClick);
    }

    const showMoreBtn = this.shadowRoot.querySelector('.show-more');
    if (showMoreBtn) {
      showMoreBtn.addEventListener('click', this.toggleExpand);
    }
  }
}

customElements.define('event-item', EventItem);
