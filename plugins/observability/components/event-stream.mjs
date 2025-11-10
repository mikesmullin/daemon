// event-stream.mjs - Main event timeline container
export class EventStream extends HTMLElement {
  static observedAttributes = ['auto-follow', 'filter-agent', 'filter-type'];

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.autoFollow = true;
    this.filterAgent = '';
    this.filterType = '';
  }

  connectedCallback() {
    this.render();
    this.setupObservers();
  }

  disconnectedCallback() {
    if (this.mutationObserver) {
      this.mutationObserver.disconnect();
    }
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (name === 'auto-follow') {
      this.autoFollow = newValue !== 'false';
    } else if (name === 'filter-agent') {
      this.filterAgent = newValue || '';
    } else if (name === 'filter-type') {
      this.filterType = newValue || '';
    }
  }

  setupObservers() {
    // Watch for new child elements and auto-scroll if enabled
    this.mutationObserver = new MutationObserver((mutations) => {
      if (this.autoFollow) {
        this.scrollToBottom();
      }
    });

    this.mutationObserver.observe(this, {
      childList: true
    });
  }

  scrollToBottom() {
    const container = this.shadowRoot.querySelector('.stream-container');
    if (container) {
      container.scrollTo({
        top: container.scrollHeight,
        behavior: 'smooth'
      });
    }
  }

  appendEvent(event) {
    const eventItem = document.createElement('event-item');
    eventItem.setAttribute('timestamp', this.formatTimestamp(event.timestamp));
    eventItem.setAttribute('type', this.mapEventType(event.type));
    eventItem.setAttribute('agent', event.agent || 'system');
    eventItem.setAttribute('agent-color', this.getAgentColor(event.agent));
    
    if (event.context_tokens) {
      eventItem.setAttribute('context-tokens', event.context_tokens);
    }

    eventItem.textContent = this.formatEventContent(event);
    this.appendChild(eventItem);

    this.dispatchEvent(new CustomEvent('new-event', {
      bubbles: true,
      composed: true,
      detail: { event }
    }));
  }

  formatTimestamp(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', { 
      hour12: false, 
      hour: '2-digit', 
      minute: '2-digit', 
      second: '2-digit' 
    });
  }

  mapEventType(type) {
    const mapping = {
      'USER_REQUEST': 'user_request',
      'RESPONSE': 'response',
      'TOOL_CALL': 'tool_call',
      'TOOL_RESPONSE': 'tool_response',
      'THINKING': 'thinking',
      'USERPROMPTSUBMIT': 'hook',
      'PRETOOLUSE': 'hook',
      'POSTTOOLUSE': 'hook',
      'STOP': 'hook',
      'SUBAGENTSTOP': 'hook',
      'SESSIONSTART': 'hook',
      'SESSIONEND': 'hook',
      'NOTIFICATION': 'hook'
    };
    return mapping[type] || 'response';
  }

  formatEventContent(event) {
    if (event.content) return event.content;
    if (event.type === 'TOOL_CALL' && event.tool) {
      return `${event.tool}(${JSON.stringify(event.params || {}, null, 2)})`;
    }
    if (event.type === 'TOOL_RESPONSE' && event.result) {
      return event.result;
    }
    return JSON.stringify(event, null, 2);
  }

  getAgentColor(agentName) {
    if (!agentName) return '#00d4ff';
    
    // Simple hash to consistent color
    let hash = 0;
    for (let i = 0; i < agentName.length; i++) {
      hash = agentName.charCodeAt(i) + ((hash << 5) - hash);
    }
    
    const colors = [
      '#00d4ff', '#00ff88', '#bb88ff', '#ffaa33', 
      '#ff6b9d', '#00ffff', '#9966ff', '#ff8844'
    ];
    return colors[Math.abs(hash) % colors.length];
  }

  clear() {
    while (this.firstChild) {
      this.removeChild(this.firstChild);
    }
  }

  render() {
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
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        
        .title {
          font-size: 0.875rem;
          font-weight: 700;
          color: #e0e0e0;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        
        .stream-container {
          height: calc(100% - 60px);
          overflow-y: auto;
          overflow-x: hidden;
          scroll-behavior: smooth;
        }
        
        .stream-container::-webkit-scrollbar {
          width: 8px;
        }
        
        .stream-container::-webkit-scrollbar-track {
          background: #1a1a1a;
        }
        
        .stream-container::-webkit-scrollbar-thumb {
          background: #333;
          border-radius: 4px;
        }
        
        .stream-container::-webkit-scrollbar-thumb:hover {
          background: #444;
        }
        
        .empty-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          height: 100%;
          color: #666;
          gap: 1rem;
        }
        
        .empty-icon {
          font-size: 3rem;
          opacity: 0.5;
        }
        
        .empty-text {
          font-size: 0.875rem;
          text-align: center;
        }
      </style>
      
      <div class="header">
        <div class="title">
          <slot name="header">Live Event Stream</slot>
        </div>
        <slot name="controls"></slot>
      </div>
      
      <div class="stream-container">
        <slot>
          <div class="empty-state">
            <div class="empty-icon">📡</div>
            <div class="empty-text">
              Waiting for events...<br>
              <small>Start a daemon with --observe flag to see activity</small>
            </div>
          </div>
        </slot>
      </div>
    `;
  }
}

customElements.define('event-stream', EventStream);
