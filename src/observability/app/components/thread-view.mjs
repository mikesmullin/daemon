// Thread View - Main chat thread displaying all events
class ThreadView extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.autoFollow = true;
    this.userScrolling = false;
    this.scrollCheckTimer = null;
    
    // Internal data storage (for properties set by Alpine.js)
    this._events = [];
    this._filter = '';
    this._currentChannel = null;
  }

  connectedCallback() {
    this.render();
    this.setupScrollDetection();
  }

  disconnectedCallback() {
    if (this.scrollCheckTimer) {
      clearTimeout(this.scrollCheckTimer);
    }
  }

  static get observedAttributes() {
    return ['events', 'filter', 'current-channel'];
  }

  attributeChangedCallback() {
    this.render();
    if (this.autoFollow && !this.userScrolling) {
      this.scrollToBottom();
    }
  }

  // Support both property and attribute setting (for Alpine.js)
  set events(value) {
    if (Array.isArray(value)) {
      this._events = value;
      this.render();
      if (this.autoFollow && !this.userScrolling) {
        this.scrollToBottom();
      }
    }
  }

  get events() {
    // First try internal property (set by Alpine.js)
    console.log('🔍 thread-view events getter: _events:', this._events, 'length:', this._events?.length);
    if (this._events && this._events.length > 0) {
      console.log('🔍 Returning _events array');
      return this._events;
    }
    // Fall back to attribute
    console.log('🔍 Falling back to attribute');
    try {
      return JSON.parse(this.getAttribute('events') || '[]');
    } catch {
      return [];
    }
  }

  set filter(value) {
    this._filter = value || '';
    this.render();
  }

  get filter() {
    // First try internal property
    if (this._filter !== '') {
      return this._filter;
    }
    // Fall back to attribute
    return this.getAttribute('filter') || '';
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

  scrollToBottom() {
    requestAnimationFrame(() => {
      const container = this.shadowRoot.querySelector('.events-container');
      if (container) {
        container.scrollTop = container.scrollHeight;
      }
    });
  }

  setupScrollDetection() {
    const container = this.shadowRoot.querySelector('.events-container');
    if (!container) return;

    container.addEventListener('scroll', () => {
      // Check if user has scrolled up from bottom
      const isAtBottom = container.scrollHeight - container.scrollTop <= container.clientHeight + 50;
      
      if (isAtBottom) {
        // User scrolled back to bottom - re-enable auto-follow
        this.userScrolling = false;
        this.autoFollow = true;
      } else {
        // User scrolled up - disable auto-follow
        this.userScrolling = true;
        this.autoFollow = false;
      }
    });
  }

  isScrolledToBottom() {
    const container = this.shadowRoot.querySelector('.events-container');
    if (!container) return true;
    
    return container.scrollHeight - container.scrollTop <= container.clientHeight + 50;
  }

  render() {
    // Use _events directly instead of getter to avoid timing issues
    let events = this._events || [];
    console.log('🔍 thread-view render: _events:', this._events?.length, 'using:', events.length, 'currentChannel:', this._currentChannel, 'filter:', this._filter);

    // Apply filter if present
    if (this._filter && this._filter.trim()) {
      // Dispatch event to app for filtering (app.js has the Lucene parser)
      const filterEvent = new CustomEvent('request-filter', { 
        detail: { events, filter: this._filter },
        bubbles: true,
        composed: true
      });
      this.dispatchEvent(filterEvent);
      
      // For now, do simple client-side filtering until we implement full Lucene parser in component
      events = this.simpleFilter(events, this._filter);
      console.log('🔍 After filtering:', events.length, 'events remain');
    }

    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: flex;
          flex-direction: column;
          flex: 1;
          overflow: hidden;
        }
        
        .events-container {
          flex: 1;
          overflow-y: auto;
          overflow-x: hidden;
          padding: 1.5rem;
          display: flex;
          flex-direction: column;
          gap: 1rem;
          scroll-behavior: smooth;
        }
        
        /* Custom scrollbar */
        .events-container::-webkit-scrollbar {
          width: 8px;
        }
        
        .events-container::-webkit-scrollbar-track {
          background: transparent;
        }
        
        .events-container::-webkit-scrollbar-thumb {
          background: #333;
          border-radius: 4px;
        }
        
        .events-container:hover::-webkit-scrollbar-thumb {
          background: #555;
        }
        
        .event-bubble {
          max-width: 70%;
          padding: 0.75rem 1rem;
          border-radius: 12px;
          position: relative;
          word-wrap: break-word;
          transition: all 0.2s ease;
        }
        
        .event-bubble:hover {
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
        }
        
        .event-bubble.user {
          align-self: flex-end;
          background: linear-gradient(135deg, #00d4ff 0%, #0099cc 100%);
          color: #000;
        }
        
        .event-bubble.agent,
        .event-bubble.tool,
        .event-bubble.thinking {
          align-self: flex-start;
          background: #1a1a1a;
          border: 1px solid #333;
        }
        
        .event-header {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          margin-bottom: 0.5rem;
          font-size: 0.875rem;
          flex-wrap: wrap;
        }
        
        .status-indicator {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          flex-shrink: 0;
        }
        
        .status-indicator.working { 
          background: #ffa500;
          animation: pulse 1.5s ease-in-out infinite;
        }
        .status-indicator.success { background: #00ff00; }
        .status-indicator.fail { background: #ff0000; }
        
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
        
        .event-icon {
          font-size: 1rem;
          line-height: 1;
        }
        
        .avatar {
          width: 24px;
          height: 24px;
          border-radius: 50%;
          background: #00d4ff;
          color: #000;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 0.75rem;
          font-weight: 600;
          flex-shrink: 0;
        }
        
        .agent-name {
          font-weight: 600;
          color: #00d4ff;
        }
        
        .user-name {
          font-weight: 600;
          color: #000;
        }
        
        .session-id {
          color: #888;
          font-size: 0.75rem;
        }
        
        .event-content {
          color: #e0e0e0;
          line-height: 1.5;
          white-space: pre-wrap;
        }
        
        .event-bubble.user .event-content {
          color: #000;
        }
        
        .timestamp {
          font-size: 0.65rem;
          color: #666;
          margin-top: 0.5rem;
          opacity: 0;
          transition: opacity 0.2s;
          font-family: 'JetBrains Mono', monospace;
        }
        
        .event-bubble:hover .timestamp {
          opacity: 1;
        }
        
        .action-buttons {
          position: absolute;
          top: 0.5rem;
          right: 0.5rem;
          opacity: 0;
          transition: opacity 0.2s;
          display: flex;
          gap: 0.25rem;
        }
        
        .event-bubble:hover .action-buttons {
          opacity: 1;
        }
        
        .action-btn {
          width: 24px;
          height: 24px;
          border: none;
          background: rgba(0, 0, 0, 0.5);
          color: #e0e0e0;
          border-radius: 4px;
          cursor: pointer;
          font-size: 0.875rem;
          transition: all 0.2s;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        
        .action-btn:hover {
          background: rgba(0, 0, 0, 0.8);
          color: #00d4ff;
        }
        
        .empty-state {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #666;
          font-size: 0.875rem;
        }
        
        .code-block {
          background: #0a0a0a;
          border: 1px solid #2a2a2a;
          border-radius: 6px;
          padding: 0.75rem;
          margin-top: 0.5rem;
          font-family: 'JetBrains Mono', monospace;
          font-size: 0.875rem;
          max-height: 300px;
          overflow-y: auto;
          color: #e0e0e0;
        }
        
        /* Custom scrollbar for code blocks */
        .code-block::-webkit-scrollbar {
          width: 6px;
          height: 6px;
        }
        
        .code-block::-webkit-scrollbar-track {
          background: transparent;
        }
        
        .code-block::-webkit-scrollbar-thumb {
          background: #2a2a2a;
          border-radius: 3px;
        }
        
        .code-block:hover::-webkit-scrollbar-thumb {
          background: #3a3a3a;
        }
        
        .tool-info {
          font-size: 0.875rem;
          color: #888;
          margin-top: 0.25rem;
        }
        
        .minus-btn {
          width: 20px;
          height: 20px;
          border: none;
          background: rgba(255, 100, 100, 0.2);
          color: #ff6464;
          border-radius: 4px;
          cursor: pointer;
          font-size: 0.75rem;
          margin-left: 0.5rem;
          transition: all 0.2s;
          display: inline-flex;
          align-items: center;
          justify-content: center;
        }
        
        .minus-btn:hover {
          background: rgba(255, 100, 100, 0.4);
        }
        
        .show-more {
          margin-top: 0.5rem;
          padding: 0.25rem 0.75rem;
          background: rgba(0, 212, 255, 0.1);
          border: 1px solid #00d4ff;
          border-radius: 4px;
          color: #00d4ff;
          font-size: 0.75rem;
          cursor: pointer;
          transition: all 0.2s;
        }
        
        .show-more:hover {
          background: rgba(0, 212, 255, 0.2);
        }
      </style>
      
      <div class="events-container">
        ${events.length === 0 ? `
          <div class="empty-state">
            ${this.currentChannel ? 'No events yet. Start a conversation!' : 'Select a channel to view messages'}
          </div>
        ` : events.map((event, index) => this.renderEvent(event, index)).join('')}
      </div>
    `;

    // Set up scroll detection after render
    this.setupScrollDetection();

    // Set up event listeners
    this.shadowRoot.querySelectorAll('.action-btn[data-action="edit"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const bubbleElement = btn.closest('.event-bubble');
        const eventId = bubbleElement.dataset.eventId;
        const event = events.find((e, i) => i == eventId);
        if (event) {
          this.showEditableForBubble(bubbleElement, event, eventId);
        }
      });
    });

    this.shadowRoot.querySelectorAll('.minus-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const field = btn.dataset.field;
        const value = btn.dataset.value;
        this.dispatchEvent(new CustomEvent('filter-add', { 
          detail: { field, value, exclude: true } 
        }));
      });
    });

    // Handle PTY view requests
    this.shadowRoot.querySelectorAll('[data-action="view-pty"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const ptyId = btn.dataset.ptyId;
        this.dispatchEvent(new CustomEvent('pty-view', { detail: { sessionId: ptyId } }));
      });
    });

    // Handle show more toggles
    this.shadowRoot.querySelectorAll('.show-more').forEach(btn => {
      btn.addEventListener('click', () => {
        const codeBlock = btn.previousElementSibling;
        if (codeBlock && codeBlock.classList.contains('code-block')) {
          const isTruncated = codeBlock.dataset.truncated === 'true';
          if (isTruncated) {
            codeBlock.textContent = codeBlock.dataset.fullContent;
            codeBlock.dataset.truncated = 'false';
            btn.textContent = 'show less';
          } else {
            codeBlock.textContent = codeBlock.dataset.shortContent;
            codeBlock.dataset.truncated = 'true';
            btn.textContent = 'show more';
          }
        }
      });
    });
  }

  renderEvent(event, index) {
    // Determine type from original message structure if not present
    let type = event.type;
    if (!type && event.role) {
      if (event.role === 'user') {
        type = 'USER_REQUEST';
      } else if (event.role === 'assistant') {
        if (event.tool_calls) {
          type = 'TOOL_CALL';
        } else {
          type = 'RESPONSE';
        }
      } else if (event.role === 'tool') {
        type = 'TOOL_RESPONSE';
      }
    }
    
    const timestamp = event.timestamp || event.ts;
    const formattedTime = timestamp ? this.formatTimestamp(timestamp) : '';

    switch (type) {
      case 'USER_REQUEST':
        return this.renderUserMessage(event, index, formattedTime);
      case 'RESPONSE':
        return this.renderAgentMessage(event, index, formattedTime);
      case 'TOOL_CALL':
        return this.renderToolCall(event, index, formattedTime);
      case 'TOOL_RESPONSE':
        return this.renderToolResponse(event, index, formattedTime);
      case 'THINKING':
        return this.renderThinking(event, index, formattedTime);
      default:
        return this.renderGenericEvent(event, index, formattedTime);
    }
  }

  formatTimestamp(timestamp) {
    const date = new Date(timestamp);
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    const milliseconds = String(date.getMilliseconds()).padStart(3, '0');
    return `${hours}:${minutes}:${seconds}.${milliseconds}`;
  }

  renderUserMessage(event, index, timestamp) {
    return `
      <div class="event-bubble user" data-event-id="${index}">
        <div class="event-header">
          <div class="avatar">👤</div>
          <span class="user-name">user</span>
          <button class="minus-btn" data-field="role" data-value="user" title="Filter out user messages">−</button>
        </div>
        <div class="event-content">${this.escapeHtml(event.content || '')}</div>
        <div class="timestamp">${timestamp}</div>
        <div class="action-buttons">
          <button class="action-btn" data-action="edit" title="Edit">✎</button>
        </div>
      </div>
    `;
  }

  renderAgentMessage(event, index, timestamp) {
    const agentName = event.agent || 'unknown';
    const sessionId = event.session_id || '';
    const avatar = agentName[0].toUpperCase();

    return `
      <div class="event-bubble agent" data-event-id="${index}">
        <div class="event-header">
          <div class="status-indicator success"></div>
          <div class="event-icon">🤖</div>
          <div class="avatar">${avatar}</div>
          <span class="agent-name">${this.escapeHtml(agentName)}</span>
          ${sessionId ? `<span class="session-id">#${sessionId}</span>` : ''}
          <button class="minus-btn" data-field="session" data-value="${sessionId}" title="Filter out this agent">−</button>
        </div>
        <div class="event-content">${this.escapeHtml(event.content || '')}</div>
        <div class="timestamp">${timestamp}</div>
        <div class="action-buttons">
          <button class="action-btn" data-action="edit" title="Edit">✎</button>
        </div>
      </div>
    `;
  }

  renderToolCall(event, index, timestamp) {
    const agentName = event.agent || 'unknown';
    const sessionId = event.session_id || '';
    
    // Handle original session message structure with tool_calls array
    let toolName = 'unknown_tool';
    let params = {};
    
    if (event.tool_calls && event.tool_calls.length > 0) {
      // Original structure: role='assistant', tool_calls=[{id, type, function: {name, arguments}}]
      const toolCall = event.tool_calls[0];
      toolName = toolCall.function?.name || 'unknown_tool';
      
      // Arguments might be string or object
      if (toolCall.function?.arguments) {
        if (typeof toolCall.function.arguments === 'string') {
          try {
            params = JSON.parse(toolCall.function.arguments);
          } catch (e) {
            params = { raw: toolCall.function.arguments };
          }
        } else {
          params = toolCall.function.arguments;
        }
      }
    }
    
    const avatar = agentName[0].toUpperCase();
    
    const paramsJson = JSON.stringify(params, null, 2);
    const maxLength = 500;
    const isTruncated = paramsJson.length > maxLength;
    const displayParams = isTruncated ? paramsJson.slice(0, maxLength) : paramsJson;

    return `
      <div class="event-bubble tool" data-event-id="${index}">
        <div class="event-header">
          <div class="status-indicator working"></div>
          <div class="event-icon">🔧</div>
          <div class="avatar">${avatar}</div>
          <span class="agent-name">${this.escapeHtml(agentName)}</span>
          ${sessionId ? `<span class="session-id">#${sessionId}</span>` : ''}
          <button class="minus-btn" data-field="session" data-value="${sessionId}" title="Filter out this agent">−</button>
        </div>
        <div class="tool-info">
          Tool: <strong>${this.escapeHtml(toolName)}</strong>
          <button class="minus-btn" data-field="tool" data-value="${toolName}" title="Filter out this tool">−</button>
        </div>
        ${Object.keys(params).length > 0 ? `
          <div class="code-block" 
               data-truncated="${isTruncated}" 
               data-full-content="${this.escapeHtml(paramsJson)}"
               data-short-content="${this.escapeHtml(displayParams)}">${this.escapeHtml(displayParams)}</div>
          ${isTruncated ? '<button class="show-more">show more</button>' : ''}
        ` : ''}
        <div class="timestamp">${timestamp}</div>
        <div class="action-buttons">
          <button class="action-btn" data-action="edit" title="Edit">✎</button>
        </div>
      </div>
    `;
  }

  renderToolResponse(event, index, timestamp) {
    const success = event.success !== false;
    const output = event.content || ''; // Tool responses use 'content' field
    const outputStr = String(output);
    
    const maxLength = 500;
    const isTruncated = outputStr.length > maxLength;
    const displayOutput = isTruncated ? outputStr.slice(0, maxLength) : outputStr;

    return `
      <div class="event-bubble tool" data-event-id="${index}">
        <div class="event-header">
          <div class="status-indicator ${success ? 'success' : 'fail'}"></div>
          <div class="event-icon">${success ? '✓' : '✗'}</div>
          <span class="tool-info">Tool Response ${success ? '(success)' : '(failed)'}</span>
        </div>
        ${output ? `
          <div class="code-block"
               data-truncated="${isTruncated}"
               data-full-content="${this.escapeHtml(outputStr)}"
               data-short-content="${this.escapeHtml(displayOutput)}">${this.escapeHtml(displayOutput)}</div>
          ${isTruncated ? '<button class="show-more">show more</button>' : ''}
        ` : ''}
        <div class="timestamp">${timestamp}</div>
        <div class="action-buttons">
          <button class="action-btn" data-action="edit" title="Edit">✎</button>
        </div>
      </div>
    `;
  }

  renderThinking(event, index, timestamp) {
    const agentName = event.agent || 'unknown';
    const sessionId = event.session_id || '';
    const avatar = agentName[0].toUpperCase();
    const content = event.content || event.thinking || '';
    
    const maxLength = 300;
    const isTruncated = content.length > maxLength;
    const displayContent = isTruncated ? content.slice(0, maxLength) : content;

    return `
      <div class="event-bubble thinking" data-event-id="${index}">
        <div class="event-header">
          <div class="status-indicator working"></div>
          <div class="event-icon">💭</div>
          <div class="avatar">${avatar}</div>
          <span class="agent-name">${this.escapeHtml(agentName)}</span>
          ${sessionId ? `<span class="session-id">#${sessionId}</span>` : ''}
          <button class="minus-btn" data-field="session" data-value="${sessionId}" title="Filter out this agent">−</button>
        </div>
        <div class="code-block"
             data-truncated="${isTruncated}"
             data-full-content="${this.escapeHtml(content)}"
             data-short-content="${this.escapeHtml(displayContent)}">${this.escapeHtml(displayContent)}</div>
        ${isTruncated ? '<button class="show-more">show more</button>' : ''}
        <div class="timestamp">${timestamp}</div>
        <div class="action-buttons">
          <button class="action-btn" data-action="edit" title="Edit">✎</button>
        </div>
      </div>
    `;
  }

  renderGenericEvent(event, index, timestamp) {
    const eventJson = JSON.stringify(event, null, 2);
    const maxLength = 500;
    const isTruncated = eventJson.length > maxLength;
    const displayJson = isTruncated ? eventJson.slice(0, maxLength) : eventJson;

    return `
      <div class="event-bubble agent" data-event-id="${index}">
        <div class="event-header">
          <span class="tool-info">${this.escapeHtml(event.type || 'UNKNOWN')}</span>
        </div>
        <div class="code-block"
             data-truncated="${isTruncated}"
             data-full-content="${this.escapeHtml(eventJson)}"
             data-short-content="${this.escapeHtml(displayJson)}">${this.escapeHtml(displayJson)}</div>
        ${isTruncated ? '<button class="show-more">show more</button>' : ''}
        <div class="timestamp">${timestamp}</div>
        <div class="action-buttons">
          <button class="action-btn" data-action="edit" title="Edit">✎</button>
        </div>
      </div>
    `;
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
  
  simpleFilter(events, filterStr) {
    if (!filterStr || !filterStr.trim()) {
      return events;
    }
    
    try {
      // Parse simple filter syntax: field:value, NOT field:value, AND, OR
      const filters = this.parseSimpleFilter(filterStr);
      
      return events.filter(event => this.matchesFilters(event, filters));
    } catch (err) {
      console.error('Filter error:', err);
      return events; // Return all events on error
    }
  }
  
  parseSimpleFilter(filterStr) {
    // Split by AND/OR but keep track of NOT
    const parts = filterStr.split(/\s+(AND|OR)\s+/i);
    const filters = [];
    let currentLogic = 'AND';
    
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i].trim();
      
      if (part === 'AND' || part === 'OR') {
        currentLogic = part;
      } else if (part) {
        const isNot = part.startsWith('NOT ');
        const term = isNot ? part.substring(4).trim() : part;
        const colonIndex = term.indexOf(':');
        
        if (colonIndex > 0) {
          const field = term.substring(0, colonIndex);
          const value = term.substring(colonIndex + 1);
          
          filters.push({
            field: field.toLowerCase(),
            value: value.toLowerCase(),
            not: isNot,
            logic: currentLogic
          });
        }
      }
    }
    
    return filters;
  }
  
  matchesFilters(event, filters) {
    if (filters.length === 0) return true;
    
    let result = true;
    let lastLogic = 'AND';
    
    for (const filter of filters) {
      const matches = this.matchesFilter(event, filter);
      const filterResult = filter.not ? !matches : matches;
      
      if (filter.logic === 'OR' || lastLogic === 'OR') {
        result = result || filterResult;
      } else {
        result = result && filterResult;
      }
      
      lastLogic = filter.logic;
    }
    
    return result;
  }
  
  matchesFilter(event, filter) {
    const { field, value } = filter;
    
    switch (field) {
      case 'session':
      case 'session_id':
        return String(event.session_id || '').toLowerCase().includes(value);
      
      case 'agent':
      case 'agent_name':
        return String(event.agent || '').toLowerCase().includes(value);
      
      case 'tool':
      case 'tool_name':
        return String(event.tool_call?.name || event.tool_name || '').toLowerCase().includes(value);
      
      case 'type':
      case 'event_type':
        return String(event.type || '').toLowerCase().includes(value);
      
      case 'content':
      case 'message':
        return String(event.content || '').toLowerCase().includes(value);
      
      case 'role':
        // Map event type to role
        if (event.type === 'USER_REQUEST') return 'user'.includes(value);
        if (event.type === 'RESPONSE') return 'assistant'.includes(value);
        if (event.type === 'TOOL_CALL' || event.type === 'TOOL_RESPONSE') return 'tool'.includes(value);
        return false;
      
      default:
        // Try direct property access
        return String(event[field] || '').toLowerCase().includes(value);
    }
  }
  
  showEditableForBubble(bubbleElement, event, eventId) {
    // Store original bubble HTML so we can restore it
    const originalHTML = bubbleElement.outerHTML;
    
    // Create editable-bubble element
    const editableBubble = document.createElement('editable-bubble');
    editableBubble.event = event;
    editableBubble.dataset.eventId = eventId;
    editableBubble.dataset.originalHtml = originalHTML;
    
    // Handle save event
    const handleSave = (e) => {
      e.stopPropagation();
      const { originalEvent, updatedEvent, isDelete, yaml } = e.detail;
      
      // Emit event to app.js for backend sync
      this.dispatchEvent(new CustomEvent('event-save', {
        bubbles: true,
        composed: true,
        detail: { originalEvent, updatedEvent, isDelete, yaml }
      }));
      
      // Remove the editable bubble and restore original (will be updated by re-render)
      editableBubble.removeEventListener('save-event', handleSave);
      editableBubble.removeEventListener('cancel-edit', handleCancel);
      
      // Trigger re-render which will show updated event
      this.render();
    };
    
    // Handle cancel event
    const handleCancel = (e) => {
      e.stopPropagation();
      
      // Restore original bubble HTML
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = originalHTML;
      const restoredBubble = tempDiv.firstElementChild;
      
      editableBubble.replaceWith(restoredBubble);
      
      // Re-attach event listeners to the restored bubble
      this.reattachBubbleListeners(restoredBubble, event, eventId);
      
      // Clean up event listeners
      editableBubble.removeEventListener('save-event', handleSave);
      editableBubble.removeEventListener('cancel-edit', handleCancel);
    };
    
    editableBubble.addEventListener('save-event', handleSave);
    editableBubble.addEventListener('cancel-edit', handleCancel);
    
    // Replace the bubble with the editable component
    bubbleElement.replaceWith(editableBubble);
  }
  
  reattachBubbleListeners(bubbleElement, event, eventId) {
    // Re-attach edit button listener
    const editBtn = bubbleElement.querySelector('.action-btn[data-action="edit"]');
    if (editBtn) {
      editBtn.addEventListener('click', () => {
        this.showEditableForBubble(bubbleElement, event, eventId);
      });
    }
    
    // Re-attach minus button listeners
    bubbleElement.querySelectorAll('.minus-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const field = btn.dataset.field;
        const value = btn.dataset.value;
        this.dispatchEvent(new CustomEvent('filter-add', { 
          detail: { field, value, exclude: true } 
        }));
      });
    });
  }
}

customElements.define('thread-view', ThreadView);

