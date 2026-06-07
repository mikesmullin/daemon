// orchestrator-action.mjs - Individual orchestrator action card
export class OrchestratorAction extends HTMLElement {
  static observedAttributes = ['tool', 'time', 'params', 'collapsible'];

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

  toggleExpand = () => {
    this.expanded = !this.expanded;
    const params = this.shadowRoot.querySelector('.params');
    const button = this.shadowRoot.querySelector('.expand-btn');
    
    if (params && button) {
      if (this.expanded) {
        params.style.display = 'block';
        button.textContent = '▼';
      } else {
        params.style.display = 'none';
        button.textContent = '▶';
      }
    }

    this.dispatchEvent(new CustomEvent('expand-params', {
      bubbles: true,
      composed: true,
      detail: { expanded: this.expanded }
    }));
  }

  copyParams = () => {
    const params = this.getAttribute('params');
    if (params) {
      navigator.clipboard.writeText(params);
      const button = this.shadowRoot.querySelector('.copy-btn');
      if (button) {
        const originalText = button.textContent;
        button.textContent = '✓';
        setTimeout(() => {
          button.textContent = originalText;
        }, 1000);
      }
    }
  }

  render() {
    const tool = this.getAttribute('tool') || 'unknown';
    const time = this.getAttribute('time') || '';
    const params = this.getAttribute('params') || '';
    const collapsible = this.getAttribute('collapsible') !== 'false';
    const hasParams = params.trim().length > 0;

    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
          background: #1a1a1a;
          border: 1px solid #333;
          border-radius: 6px;
          margin-bottom: 0.75rem;
          overflow: hidden;
          transition: all 0.2s;
        }
        
        :host(:hover) {
          border-color: #444;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
        }
        
        .header {
          padding: 0.75rem 1rem;
          display: flex;
          align-items: center;
          justify-content: space-between;
          cursor: ${hasParams && collapsible ? 'pointer' : 'default'};
        }
        
        .header:hover {
          background: ${hasParams && collapsible ? '#222' : 'transparent'};
        }
        
        .left {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          flex: 1;
        }
        
        .expand-btn {
          color: #666;
          font-size: 0.75rem;
          width: 16px;
          text-align: center;
          transition: color 0.2s;
        }
        
        .header:hover .expand-btn {
          color: #00d4ff;
        }
        
        .tool-badge {
          display: inline-block;
          padding: 0.25rem 0.625rem;
          background: #bb88ff22;
          color: #bb88ff;
          font-size: 0.625rem;
          font-weight: 700;
          text-transform: uppercase;
          border-radius: 4px;
          letter-spacing: 0.05em;
          border: 1px solid #bb88ff44;
        }
        
        .time {
          font-size: 0.625rem;
          color: #666;
          font-family: 'JetBrains Mono', monospace;
        }
        
        .actions {
          display: flex;
          gap: 0.5rem;
        }
        
        .copy-btn {
          background: none;
          border: 1px solid #444;
          color: #888;
          padding: 0.25rem 0.5rem;
          font-size: 0.625rem;
          border-radius: 3px;
          cursor: pointer;
          transition: all 0.2s;
        }
        
        .copy-btn:hover {
          background: #2a2a2a;
          color: #00d4ff;
          border-color: #00d4ff;
        }
        
        .description {
          padding: 0 1rem 0.75rem 1rem;
          font-size: 0.75rem;
          color: #a0a0a0;
          line-height: 1.5;
        }
        
        .params {
          display: none;
          margin: 0.75rem 1rem;
          background: #0f0f0f;
          border: 1px solid #333;
          border-radius: 4px;
          padding: 0.75rem;
          max-height: 300px;
          overflow-y: auto;
        }
        
        .params::-webkit-scrollbar {
          width: 6px;
        }
        
        .params::-webkit-scrollbar-track {
          background: #1a1a1a;
        }
        
        .params::-webkit-scrollbar-thumb {
          background: #333;
          border-radius: 3px;
        }
        
        .params pre {
          margin: 0;
          font-family: 'JetBrains Mono', monospace;
          font-size: 0.75rem;
          color: #e0e0e0;
          white-space: pre-wrap;
          word-break: break-word;
        }
        
        .params code {
          color: #bb88ff;
        }
      </style>
      
      <div class="header">
        <div class="left">
          ${hasParams && collapsible ? '<span class="expand-btn">▶</span>' : ''}
          <span class="tool-badge" part="tool-badge">${tool}</span>
        </div>
        <div class="actions">
          <span class="time">${time}</span>
          ${hasParams ? '<button class="copy-btn">Copy</button>' : ''}
        </div>
      </div>
      
      ${this.textContent ? `<div class="description"><slot></slot></div>` : ''}
      
      ${hasParams ? `
        <div class="params" part="params-block">
          <pre><code>${this.escapeHtml(params)}</code></pre>
        </div>
      ` : ''}
    `;

    // Add event listeners
    if (hasParams && collapsible) {
      const header = this.shadowRoot.querySelector('.header');
      header?.addEventListener('click', this.toggleExpand);
    }

    const copyBtn = this.shadowRoot.querySelector('.copy-btn');
    copyBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.copyParams();
    });
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

customElements.define('orchestrator-action', OrchestratorAction);
