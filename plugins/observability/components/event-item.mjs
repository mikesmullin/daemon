// event-item.mjs - Individual event in the timeline
export class EventItem extends HTMLElement {
  static observedAttributes = ['timestamp', 'type', 'agent', 'session-id', 'tool-name', 'collapsible'];

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

  getTypeTheme() {
    const type = this.getAttribute('type') || 'response';
    const themes = {
      response: { 
        color: '#00d4ff',
        bgColor: '#00d4ff11',
        borderColor: '#00d4ff44',
        icon: '💬',
        label: 'RESPONSE'
      },
      tool: { 
        color: '#ff8800',
        bgColor: '#ff880011', 
        borderColor: '#ff880044',
        icon: '🔧',
        label: 'TOOL'
      },
      tool_call: { 
        color: '#ff8800',
        bgColor: '#ff880011',
        borderColor: '#ff880044',
        icon: '🔧',
        label: 'TOOL CALL'
      },
      tool_response: { 
        color: '#ff8800',
        bgColor: '#ff880011',
        borderColor: '#ff880044',
        icon: '✓',
        label: 'TOOL RESULT'
      },
      thinking: { 
        color: '#bb88ff',
        bgColor: '#bb88ff11',
        borderColor: '#bb88ff44',
        icon: '💭',
        label: 'THINKING'
      },
      hook: { 
        color: '#00ff88',
        bgColor: '#00ff8811',
        borderColor: '#00ff8844',
        icon: '⚓',
        label: 'HOOK'
      },
      user_request: { 
        color: '#00d4ff',
        bgColor: '#00d4ff11',
        borderColor: '#00d4ff44',
        icon: '�',
        label: 'RESPONSE'
      }
    };
    return themes[type] || themes.response;
  }

  getEventName() {
    const type = this.getAttribute('type') || 'response';
    const agent = this.getAttribute('agent') || 'system';
    const toolName = this.getAttribute('tool-name') || '';
    
    if (type === 'tool_call' || type === 'tool_response') {
      return toolName || 'unknown_tool';
    }
    if (type === 'hook') {
      return toolName || 'unknown_hook';
    }
    if (type === 'user_request') {
      return 'USER';
    }
    return agent; // response, thinking
  }

  formatTimestamp(isoTimestamp) {
    if (!isoTimestamp) return '';
    const date = new Date(isoTimestamp);
    return date.toLocaleTimeString('en-US', { 
      hour12: false, 
      hour: '2-digit', 
      minute: '2-digit', 
      second: '2-digit' 
    });
  }

  toggleExpand = () => {
    this.expanded = !this.expanded;
    this.render(); // Re-render to update content display
  }

  render() {
    const timestamp = this.getAttribute('timestamp') || '';
    const type = this.getAttribute('type') || 'response';
    const agent = this.getAttribute('agent') || 'system';
    const sessionId = this.getAttribute('session-id') || '';
    const collapsible = this.getAttribute('collapsible') !== 'false';
    
    const theme = this.getTypeTheme();
    const eventName = this.getEventName();
    const content = this.innerHTML || this.textContent || '';
    const needsCollapse = collapsible && content.length > 200;
    const displayContent = (needsCollapse && !this.expanded) ? content.substring(0, 200) + '...' : content;
    const formattedTime = this.formatTimestamp(timestamp);

    // Check if content is JSON
    const isJSON = content.trim().startsWith('{') || content.trim().startsWith('[');
    
    // Render markdown for response types
    const isResponse = type === 'response' || type === 'user_request';
    let renderedContent = displayContent;
    if (isResponse && !isJSON && typeof marked !== 'undefined') {
      try {
        renderedContent = marked.parse(displayContent);
      } catch (e) {
        renderedContent = displayContent;
      }
    }

    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
          margin-bottom: 0.75rem;
          font-family: 'Inter', -apple-system, sans-serif;
          position: relative;
          animation: slideIn 0.3s ease, borderFlash 0.5s ease;
        }
        
        @keyframes slideIn {
          from { opacity: 0; transform: translateX(-10px); }
          to { opacity: 1; transform: translateX(0); }
        }
        
        @keyframes borderFlash {
          0%, 100% { border-left-color: ${theme.borderColor}; }
          50% { border-left-color: ${theme.color}; }
        }
        
        .event-container {
          background: ${theme.bgColor};
          border-left: 4px solid ${theme.borderColor};
          border-radius: 0;
          padding: 1rem;
          margin: 5px 0;
          transition: all 0.2s;
        }
        
        .event-container:hover {
          background: ${theme.bgColor}dd;
          border-left-color: ${theme.color};
        }
        
        .header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 0.75rem;
        }
        
        .header-left {
          display: flex;
          align-items: center;
          gap: 0.75rem;
        }
        
        .session-id {
          font-family: 'JetBrains Mono', monospace;
          font-size: 0.75rem;
          color: #e0e0e0;
          font-weight: 600;
        }
        
        .event-pill {
          display: inline-flex;
          align-items: center;
          gap: 0.375rem;
          padding: 0.375rem 0.625rem;
          background: ${theme.color}22;
          border: 1px solid ${theme.color};
          border-radius: 6px;
        }
        
        .event-icon {
          font-size: 1rem;
        }
        
        .event-label {
          font-size: 0.6875rem;
          font-weight: 700;
          color: ${theme.color};
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        
        .event-name {
          font-family: 'JetBrains Mono', monospace;
          font-size: 0.875rem;
          font-weight: 700;
          color: ${theme.color};
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        
        .timestamp {
          font-family: 'JetBrains Mono', monospace;
          font-size: 0.75rem;
          color: #888;
        }
        
        .content-wrapper {
          margin-top: 0.75rem;
        }
        
        .content-block {
          background: transparent;
          border: none;
          border-radius: 0;
          padding: 0;
          max-height: ${needsCollapse ? '200px' : 'none'};
          overflow: hidden;
          transition: max-height 0.3s ease;
        }
        
        .content-block.expanded {
          max-height: none;
        }
        
        .content-text {
          color: #e0e0e0;
          font-size: 0.875rem;
          line-height: 1.6;
          white-space: pre-wrap;
          word-break: break-word;
          padding: 0.75rem;
        }
        
        .content-text p {
          margin: 0 0 0.75rem 0;
        }
        
        .content-text p:last-child {
          margin-bottom: 0;
        }
        
        .content-text code {
          background: #2a2a2a;
          padding: 0.125rem 0.375rem;
          border-radius: 3px;
          font-family: 'JetBrains Mono', monospace;
          color: #bb88ff;
        }
        
        .content-text pre {
          background: #000;
          padding: 0.75rem;
          border-radius: 6px;
          border: 1px solid ${theme.borderColor};
          overflow-x: auto;
          margin: 0.75rem 0;
        }
        
        .content-text pre code {
          background: transparent;
          padding: 0;
          color: #fff;
        }
        
        .content-json {
          background: #000;
          color: #fff;
          font-family: 'JetBrains Mono', monospace;
          font-size: 0.8125rem;
          padding: 0.75rem;
          border-radius: 6px;
          border: 1px solid ${theme.borderColor};
          overflow-x: auto;
          line-height: 1.5;
        }
        
        .show-more {
          margin-top: 0.75rem;
          padding: 0.375rem 0.875rem;
          background: ${theme.color}22;
          border: 1px solid ${theme.color};
          border-radius: 6px;
          color: ${theme.color};
          font-size: 0.6875rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          cursor: pointer;
          transition: all 0.2s;
          font-family: 'Inter', -apple-system, sans-serif;
        }
        
        .show-more:hover {
          background: ${theme.color}44;
          box-shadow: 0 0 8px ${theme.color}44;
        }
      </style>
      
      <div class="event-container">
        <div class="header">
          <div class="header-left">
            ${sessionId ? `<div class="session-id">${sessionId}</div>` : ''}
            <div class="event-pill">
              <span class="event-icon">${theme.icon}</span>
              <span class="event-label">${theme.label}</span>
            </div>
            <div class="event-name">${eventName}</div>
          </div>
          <div class="timestamp">${formattedTime}</div>
        </div>
        
        <div class="content-wrapper">
          <div class="content-block ${this.expanded ? 'expanded' : ''}">
            ${isJSON ? 
              `<pre class="content-json">${displayContent}</pre>` : 
              (isResponse ? 
                `<div class="content-text">${renderedContent}</div>` : 
                `<div class="content-text">${displayContent}</div>`)
            }
          </div>
          ${needsCollapse ? `<button class="show-more">${this.expanded ? 'SHOW LESS' : 'SHOW MORE'}</button>` : ''}
        </div>
      </div>
    `;

    // Add event listener
    const showMoreBtn = this.shadowRoot.querySelector('.show-more');
    if (showMoreBtn) {
      showMoreBtn.addEventListener('click', this.toggleExpand);
    }
  }
}

customElements.define('event-item', EventItem);
