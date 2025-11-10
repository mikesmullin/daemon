// event-stream.mjs - Main event timeline container
export class EventStream extends HTMLElement {
  static observedAttributes = ['auto-follow', 'filter-agent', 'filter-types'];

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.autoFollow = true;
    this.filterAgent = '';
    this.filterTypes = { response: true, tool: true, thinking: true, hook: true };
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
      this.applyFilters();
    } else if (name === 'filter-types') {
      try {
        this.filterTypes = JSON.parse(newValue || '{"response":true,"tool":true,"thinking":true,"hook":true}');
      } catch (e) {
        console.error('Failed to parse filter-types:', e);
      }
      this.applyFilters();
    }
  }

  applyFilters() {
    // Apply visibility filters to existing event items
    const items = this.querySelectorAll('event-item');
    items.forEach(item => {
      const agent = item.getAttribute('agent');
      const type = item.getAttribute('type');
      
      let visible = true;
      
      // Filter by agent
      if (this.filterAgent && agent !== this.filterAgent) {
        visible = false;
      }
      
      // Filter by type categories (checkbox style - show if enabled)
      const typeCategory = this.getTypeCategory(type);
      if (!this.filterTypes[typeCategory]) {
        visible = false;
      }
      
      item.style.display = visible ? 'block' : 'none';
    });
  }

  getTypeCategory(type) {
    // Map event types to filter categories
    if (type === 'response' || type === 'user_request') return 'response';
    if (type === 'tool_call' || type === 'tool_response') return 'tool';
    if (type === 'thinking') return 'thinking';
    if (type === 'hook') return 'hook';
    return 'response'; // default
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
    const mappedType = this.mapEventType(event.type);
    const agent = event.agent || 'system';
    
    eventItem.setAttribute('timestamp', event.timestamp);
    eventItem.setAttribute('type', mappedType);
    eventItem.setAttribute('agent', agent);
    
    if (event.session_id) {
      eventItem.setAttribute('session-id', event.session_id);
    }
    
    // For tool events, use event.tool; for hook events, use original event.type
    if (event.tool) {
      eventItem.setAttribute('tool-name', event.tool);
    } else if (mappedType === 'hook') {
      eventItem.setAttribute('tool-name', event.type);
    }
    
    if (event.context_tokens) {
      eventItem.setAttribute('context-tokens', event.context_tokens);
    }

    eventItem.textContent = this.formatEventContent(event);
    
    // Apply filters to new item
    let visible = true;
    if (this.filterAgent && agent !== this.filterAgent) {
      visible = false;
    }
    
    // Check if type category is enabled in filter
    const typeCategory = this.getTypeCategory(mappedType);
    if (!this.filterTypes[typeCategory]) {
      visible = false;
    }
    
    if (!visible) {
      eventItem.style.display = 'none';
    }
    
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
    
    if (event.type === 'TOOL_CALL' && event.params) {
      return JSON.stringify(event.params, null, 2);
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
