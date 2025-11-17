// chat-message.mjs - Individual chat message bubble with markdown support
export class ChatMessage extends HTMLElement {
  static observedAttributes = ['type', 'content', 'timestamp', 'tool', 'params'];

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.expanded = false;
  }

  connectedCallback() {
    this.render();
  }

  attributeChangedCallback() {
    if (this.shadowRoot.innerHTML) {
      this.render();
    }
  }

  toggleExpand() {
    this.expanded = !this.expanded;
    this.render();
  }

  getTypeTheme(type) {
    const themes = {
      response: { bg: '#1a1a1a', border: '#00d4ff', text: '#e0e0e0' },
      user_request: { bg: '#0d2535', border: '#00d4ff', text: '#fff' },
      tool_call: { bg: '#1a1a1a', border: '#ff8844', text: '#e0e0e0' },
      tool_response: { bg: '#1a1a1a', border: '#ff8844', text: '#e0e0e0' },
      thinking: { bg: '#1a1a1a', border: '#bb88ff', text: '#e0e0e0' },
      hook: { bg: '#1a1a1a', border: '#00ff88', text: '#e0e0e0' }
    };
    return themes[type?.toLowerCase()] || themes.response;
  }

  formatTimestamp(timestamp) {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', { 
      hour12: false, 
      hour: '2-digit', 
      minute: '2-digit', 
      second: '2-digit' 
    });
  }

  formatParams(params) {
    if (!params) return '';
    try {
      const obj = typeof params === 'string' ? JSON.parse(params) : params;
      return JSON.stringify(obj, null, 2);
    } catch (e) {
      return params;
    }
  }

  render() {
    const type = this.getAttribute('type') || 'response';
    const content = this.getAttribute('content') || '';
    const timestamp = this.getAttribute('timestamp') || '';
    const tool = this.getAttribute('tool') || '';
    const params = this.getAttribute('params') || '';
    
    const theme = this.getTypeTheme(type);
    const isUser = type === 'USER_REQUEST' || type === 'user_request';
    const isTool = type === 'TOOL_CALL' || type === 'tool_call';
    const align = isUser ? 'right' : 'left';
    
    // Parse markdown for response types using marked.js if available
    let renderedContent = content;
    if ((type === 'RESPONSE' || type === 'response') && window.marked) {
      try {
        renderedContent = window.marked.parse(content);
      } catch (e) {
        renderedContent = content;
      }
    }

    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
        }

        .message-wrapper {
          display: flex;
          justify-content: ${align === 'right' ? 'flex-end' : 'flex-start'};
          align-items: flex-start;
          margin-top: 7px;
          margin-bottom: 7px;
        }

        .message-bubble {
          max-width: 85%;
          background: ${theme.bg};
          border-left: 3px solid ${theme.border};
          border-radius: 12px;
          padding: 0.75rem 1rem;
          color: ${theme.text};
          box-shadow: 0 2px 4px rgba(0,0,0,0.3);
        }

        .user-bubble {
          background: linear-gradient(135deg, #0d2535 0%, #0a1d2a 100%);
          border: 1px solid ${theme.border};
          border-left: 3px solid ${theme.border};
        }

        .message-header {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          margin-bottom: 0.5rem;
          font-size: 0.75rem;
          color: #888;
        }

        .tool-pill {
          display: inline-flex;
          align-items: center;
          gap: 0.25rem;
          background: ${theme.border}22;
          color: ${theme.border};
          padding: 0.25rem 0.5rem;
          border-radius: 12px;
          font-family: 'JetBrains Mono', monospace;
          font-size: 0.7rem;
          font-weight: 600;
        }

        .message-content {
          line-height: 1.5;
          word-wrap: break-word;
        }

        .message-content p {
          margin: 0.5em 0;
        }

        .message-content p:first-child {
          margin-top: 0;
        }

        .message-content p:last-child {
          margin-bottom: 0;
        }

        .message-content code {
          background: #0a0a0a;
          padding: 0.125rem 0.25rem;
          border-radius: 3px;
          font-family: 'JetBrains Mono', monospace;
          font-size: 0.85em;
          color: #00d4ff;
        }

        .message-content pre {
          background: #0a0a0a;
          padding: 0.75rem;
          border-radius: 6px;
          overflow-x: auto;
          margin: 0.5em 0;
        }

        .message-content pre code {
          background: none;
          padding: 0;
          color: #e0e0e0;
        }

        .params-section {
          margin-top: 0.5rem;
          padding-top: 0.5rem;
          border-top: 1px solid #333;
        }

        .params-label {
          font-size: 0.75rem;
          color: #888;
          margin-bottom: 0.25rem;
          font-weight: 600;
        }

        .params-content {
          background: #0a0a0a;
          padding: 0.75rem;
          border-radius: 6px;
          font-family: 'JetBrains Mono', monospace;
          font-size: 0.75rem;
          color: #e0e0e0;
          overflow-x: auto;
          white-space: pre-wrap;
          word-break: break-all;
        }

        .params-content.collapsed {
          max-height: 100px;
          overflow: hidden;
          position: relative;
        }

        .expand-button {
          margin-top: 0.5rem;
          background: transparent;
          border: 1px solid #333;
          color: #888;
          padding: 0.25rem 0.75rem;
          border-radius: 6px;
          cursor: pointer;
          font-size: 0.75rem;
          transition: all 0.2s;
        }

        .expand-button:hover {
          background: #1a1a1a;
          border-color: ${theme.border};
          color: ${theme.border};
        }

        .timestamp {
          font-size: 0.7rem;
          color: #666;
          margin-top: 0.5rem;
        }

        /* Syntax highlighting for JSON */
        .params-content .json-key { color: #00d4ff; }
        .params-content .json-string { color: #00ff88; }
        .params-content .json-number { color: #ff8844; }
        .params-content .json-boolean { color: #bb88ff; }
        .params-content .json-null { color: #888; }
      </style>

      <div class="message-wrapper">
        <div class="message-bubble ${isUser ? 'user-bubble' : ''}">
          ${isTool ? `
            <div class="message-header">
              <span class="tool-pill">🔧 Tool: ${tool}</span>
            </div>
          ` : ''}
          
          <div class="message-content">
            ${type === 'RESPONSE' || type === 'response' ? renderedContent : content}
          </div>

          ${params && isTool ? `
            <div class="params-section">
              <div class="params-label">Parameters:</div>
              <div class="params-content ${this.expanded ? '' : 'collapsed'}">
${this.formatParams(params)}
              </div>
              ${this.formatParams(params).length > 200 ? `
                <button class="expand-button" onclick="this.getRootNode().host.toggleExpand()">
                  ${this.expanded ? 'Show Less' : 'Show More'}
                </button>
              ` : ''}
            </div>
          ` : ''}

          <div class="timestamp">${this.formatTimestamp(timestamp)}</div>
        </div>
      </div>
    `;
  }
}

customElements.define('chat-message', ChatMessage);
