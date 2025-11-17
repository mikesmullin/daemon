// Message Input - Compose and send messages with @mention support
class MessageInput extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.suggestions = [];
    this.selectedSuggestion = 0;
    this.isRecording = false;
  }

  connectedCallback() {
    this.render();
    this.setupEventListeners();
  }

  disconnectedCallback() {
    this.cleanup();
  }

  static get observedAttributes() {
    return ['current-channel', 'agents'];
  }

  attributeChangedCallback() {
    this.render();
  }

  setupEventListeners() {
    // Listen for autocomplete results from backend
    this.handleAutocompleteResults = (event) => {
      const { suggestions } = event.detail;
      this.addTemplateSuggestions(suggestions);
    };
    
    // Listen for populate-mention events from agent list
    this.handlePopulateMention = (event) => {
      const { name, sessionId } = event.detail;
      const textarea = this.shadowRoot?.querySelector('.message-textarea');
      if (textarea) {
        textarea.value = `@${name}#${sessionId} `;
        textarea.focus();
        textarea.selectionStart = textarea.selectionEnd = textarea.value.length;
      }
    };
    
    this.addEventListener('autocomplete-results', this.handleAutocompleteResults);
    this.addEventListener('populate-mention', this.handlePopulateMention);
  }

  cleanup() {
    if (this.handleAutocompleteResults) {
      this.removeEventListener('autocomplete-results', this.handleAutocompleteResults);
    }
    if (this.handlePopulateMention) {
      this.removeEventListener('populate-mention', this.handlePopulateMention);
    }
  }

  get currentChannel() {
    return this.getAttribute('current-channel');
  }

  get agents() {
    try {
      return JSON.parse(this.getAttribute('agents') || '[]');
    } catch {
      return [];
    }
  }

  render() {
    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
          background: #1a1a1a;
          border-top: 1px solid #333;
          padding: 1rem 1.5rem;
        }
        
        .input-container {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }
        
        .textarea-wrapper {
          position: relative;
          background: #0f0f0f;
          border: 1px solid #333;
          border-radius: 8px;
          transition: all 0.2s;
        }
        
        .textarea-wrapper:focus-within {
          border-color: #00d4ff;
          box-shadow: 0 0 0 2px rgba(0, 212, 255, 0.2);
        }
        
        .message-textarea {
          width: 100%;
          min-height: 60px;
          max-height: 200px;
          padding: 0.75rem;
          padding-right: 3rem;
          background: transparent;
          border: none;
          color: #e0e0e0;
          font-family: 'Inter', sans-serif;
          font-size: 0.875rem;
          line-height: 1.5;
          resize: vertical;
          outline: none;
        }
        
        .message-textarea::placeholder {
          color: #555;
        }
        
        .mention-pill {
          display: inline-block;
          background: rgba(0, 212, 255, 0.15);
          color: #00d4ff;
          padding: 0.125rem 0.5rem;
          border-radius: 12px;
          font-size: 0.875rem;
          font-weight: 500;
          margin: 0 0.125rem;
          border: 1px solid rgba(0, 212, 255, 0.3);
        }
        
        .voice-btn {
          position: absolute;
          top: 0.75rem;
          right: 0.75rem;
          width: 32px;
          height: 32px;
          border: none;
          background: #2a2a2a;
          color: #888;
          border-radius: 6px;
          cursor: pointer;
          font-size: 1.125rem;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s;
        }
        
        .voice-btn:hover {
          background: #333;
          color: #00d4ff;
        }
        
        .voice-btn.recording {
          background: #ff0000;
          color: #fff;
          animation: pulse 1s ease-in-out infinite;
        }
        
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.7; }
        }
        
        .autocomplete {
          position: absolute;
          bottom: 100%;
          left: 0;
          right: 0;
          background: #1a1a1a;
          border: 1px solid #333;
          border-radius: 8px 8px 0 0;
          max-height: 200px;
          overflow-y: auto;
          display: none;
        }
        
        .autocomplete.show {
          display: block;
        }
        
        .suggestion {
          padding: 0.5rem 0.75rem;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 0.5rem;
          transition: background 0.2s;
        }
        
        .suggestion:hover,
        .suggestion.selected {
          background: #2a2a2a;
        }
        
        .suggestion-avatar {
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
        }
        
        .suggestion-name {
          color: #e0e0e0;
          font-size: 0.875rem;
        }
        
        .suggestion-id {
          color: #666;
          font-size: 0.75rem;
          margin-left: auto;
        }
        
        .bottom-bar {
          display: flex;
          align-items: center;
          justify-content: flex-end;
        }
        
        .send-btn {
          padding: 0.5rem 1.5rem;
          background: #00d4ff;
          color: #000;
          border: none;
          border-radius: 6px;
          font-weight: 600;
          font-size: 0.875rem;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 0.5rem;
          transition: all 0.2s;
        }
        
        .send-btn:hover {
          background: #00bbdd;
        }
        
        .send-btn:disabled {
          background: #333;
          color: #666;
          cursor: not-allowed;
        }
        
        .error-msg {
          color: #ff6464;
          font-size: 0.75rem;
          margin-top: 0.25rem;
        }
      </style>
      
      <div class="input-container">
        <div class="textarea-wrapper">
          <div class="autocomplete"></div>
          <textarea
            class="message-textarea"
            placeholder="Type a message... Use @mention to select an agent"
            rows="1"
          ></textarea>
          <button class="voice-btn" title="Voice dictation">🎤</button>
        </div>
        <div class="bottom-bar">
          <button class="send-btn">
            <span>▶</span>
            <span>SEND</span>
          </button>
        </div>
        <div class="error-msg" style="display: none;"></div>
      </div>
    `;

    const textarea = this.shadowRoot.querySelector('.message-textarea');
    const autocomplete = this.shadowRoot.querySelector('.autocomplete');
    const voiceBtn = this.shadowRoot.querySelector('.voice-btn');
    const sendBtn = this.shadowRoot.querySelector('.send-btn');
    const errorMsg = this.shadowRoot.querySelector('.error-msg');

    // Auto-resize textarea
    textarea.addEventListener('input', () => {
      textarea.style.height = 'auto';
      textarea.style.height = Math.min(textarea.scrollHeight, 200) + 'px';
      
      this.handleMentionInput(textarea, autocomplete);
    });

    // Keyboard navigation for autocomplete
    textarea.addEventListener('keydown', (e) => {
      if (this.suggestions.length > 0 && autocomplete.classList.contains('show')) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          this.selectedSuggestion = Math.min(this.selectedSuggestion + 1, this.suggestions.length - 1);
          this.renderSuggestions(autocomplete);
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          this.selectedSuggestion = Math.max(this.selectedSuggestion - 1, 0);
          this.renderSuggestions(autocomplete);
        } else if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          if (this.suggestions.length > 0) {
            this.selectSuggestion(textarea, this.suggestions[this.selectedSuggestion]);
          } else {
            this.sendMessage(textarea, errorMsg);
          }
        } else if (e.key === 'Escape') {
          autocomplete.classList.remove('show');
        }
      } else if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.sendMessage(textarea, errorMsg);
      }
    });

    // Voice dictation
    voiceBtn.addEventListener('click', () => {
      this.toggleVoiceDictation(textarea, voiceBtn);
    });

    // Send button
    sendBtn.addEventListener('click', () => {
      this.sendMessage(textarea, errorMsg);
    });

    // Click outside to close autocomplete
    document.addEventListener('click', (e) => {
      if (!this.shadowRoot.contains(e.target)) {
        autocomplete.classList.remove('show');
      }
    });
  }

  handleMentionInput(textarea, autocomplete) {
    const text = textarea.value;
    const cursorPos = textarea.selectionStart;
    
    // Find @mention at cursor position
    const beforeCursor = text.slice(0, cursorPos);
    const match = beforeCursor.match(/@(\w*)$/);
    
    if (match) {
      const query = match[1].toLowerCase();
      this.updateSuggestions(query, autocomplete);
    } else {
      autocomplete.classList.remove('show');
    }
  }

  updateSuggestions(query, autocomplete) {
    // Combine channel agents with template search
    const channelAgents = this.agents.map(a => ({
      type: 'agent',
      name: a.name,
      sessionId: a.session_id,
      display: `${a.name}#${a.session_id}`
    }));

    // Filter by query
    this.suggestions = channelAgents.filter(s => 
      s.name.toLowerCase().includes(query) || 
      s.display.toLowerCase().includes(query)
    );

    // Request template autocomplete from server (for templates not yet instantiated)
    if (query.length >= 1) {
      this.dispatchEvent(new CustomEvent('template-search', { 
        detail: { query: `@${query}` },
        bubbles: true,
        composed: true
      }));
    }

    this.selectedSuggestion = 0;
    this.renderSuggestions(autocomplete);
  }

  addTemplateSuggestions(templateSuggestions) {
    if (!templateSuggestions || !Array.isArray(templateSuggestions)) {
      return;
    }

    // Convert template suggestions to same format as agent suggestions
    const templates = templateSuggestions.map(t => ({
      type: 'template',
      name: t.name,
      sessionId: null, // Templates don't have session IDs yet
      display: t.name,
      path: t.path
    }));

    // Add templates to suggestions if they're not already agents in the channel
    const existingNames = new Set(this.suggestions.map(s => s.name));
    const newTemplates = templates.filter(t => !existingNames.has(t.name));

    this.suggestions = [...this.suggestions, ...newTemplates];

    const autocomplete = this.shadowRoot?.querySelector('.autocomplete');
    if (autocomplete) {
      this.renderSuggestions(autocomplete);
    }
  }

  renderSuggestions(autocomplete) {
    if (this.suggestions.length === 0) {
      autocomplete.classList.remove('show');
      return;
    }

    autocomplete.classList.add('show');
    autocomplete.innerHTML = this.suggestions.map((s, i) => {
      const sessionIdDisplay = s.sessionId ? `#${s.sessionId}` : '<span style="color: #666; font-size: 0.7rem;">(new)</span>';
      return `
        <div class="suggestion ${i === this.selectedSuggestion ? 'selected' : ''}" data-index="${i}">
          <div class="suggestion-avatar">${s.name[0].toUpperCase()}</div>
          <div class="suggestion-name">${this.escapeHtml(s.name)}</div>
          <div class="suggestion-id">${sessionIdDisplay}</div>
        </div>
      `;
    }).join('');

    // Click handler for suggestions
    autocomplete.querySelectorAll('.suggestion').forEach((el, i) => {
      el.addEventListener('click', () => {
        const textarea = this.shadowRoot.querySelector('.message-textarea');
        this.selectSuggestion(textarea, this.suggestions[i]);
      });
    });
  }

  selectSuggestion(textarea, suggestion) {
    const text = textarea.value;
    const cursorPos = textarea.selectionStart;
    const beforeCursor = text.slice(0, cursorPos);
    const afterCursor = text.slice(cursorPos);
    
    // Replace @mention with selected suggestion
    // For templates without session ID, just use template name
    const mentionText = suggestion.sessionId 
      ? `@${suggestion.name}#${suggestion.sessionId}` 
      : `@${suggestion.name}`;
    
    const newBefore = beforeCursor.replace(/@\w*$/, mentionText);
    textarea.value = newBefore + ' ' + afterCursor;
    textarea.selectionStart = textarea.selectionEnd = newBefore.length + 1;
    
    const autocomplete = this.shadowRoot.querySelector('.autocomplete');
    autocomplete.classList.remove('show');
    
    textarea.focus();
  }

  toggleVoiceDictation(textarea, voiceBtn) {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      alert('Speech recognition not supported in this browser');
      return;
    }

    if (this.isRecording) {
      this.stopRecording();
      voiceBtn.classList.remove('recording');
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-US';

    recognition.onstart = () => {
      this.isRecording = true;
      voiceBtn.classList.add('recording');
    };

    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      textarea.value = textarea.value + (textarea.value ? ' ' : '') + transcript;
      textarea.dispatchEvent(new Event('input'));
    };

    recognition.onerror = (event) => {
      console.error('Speech recognition error:', event.error);
      this.isRecording = false;
      voiceBtn.classList.remove('recording');
    };

    recognition.onend = () => {
      this.isRecording = false;
      voiceBtn.classList.remove('recording');
    };

    this.recognition = recognition;
    recognition.start();
  }

  stopRecording() {
    if (this.recognition) {
      this.recognition.stop();
      this.isRecording = false;
    }
  }

  sendMessage(textarea, errorMsg) {
    const content = textarea.value.trim();
    
    if (!content) {
      return;
    }

    if (!this.currentChannel) {
      this.showError(errorMsg, 'No channel selected');
      return;
    }

    // Check if it's a slash command
    if (content.startsWith('/')) {
      this.handleSlashCommand(content, errorMsg);
      
      // Clear input
      textarea.value = '';
      textarea.style.height = 'auto';
      errorMsg.style.display = 'none';
      return;
    }

    // Extract @mention - now support both @name#id and @name formats
    const mentionWithIdMatch = content.match(/@(\w+)#(\d+)/);
    const mentionOnlyMatch = content.match(/@(\w+)(?!\w)/);
    
    if (mentionWithIdMatch) {
      // Has session ID - send to specific agent session
      const [, agentName, sessionId] = mentionWithIdMatch;

      this.dispatchEvent(new CustomEvent('message-submit', {
        detail: {
          agent: `${agentName}#${sessionId}`,
          sessionId: parseInt(sessionId, 10),
          content: content
        },
        bubbles: true,
        composed: true
      }));
    } else if (mentionOnlyMatch) {
      // Only has template name - will create new agent in channel
      const [, templateName] = mentionOnlyMatch;

      this.dispatchEvent(new CustomEvent('message-submit', {
        detail: {
          agent: `@${templateName}`,
          sessionId: null,
          template: templateName,
          content: content
        },
        bubbles: true,
        composed: true
      }));
    } else {
      this.showError(errorMsg, 'Please @mention an agent (e.g., @alice#12 or @solo)');
      return;
    }

    // Clear input
    textarea.value = '';
    textarea.style.height = 'auto';
    errorMsg.style.display = 'none';
  }

  handleSlashCommand(content, errorMsg) {
    // Parse slash command
    const parts = content.trim().split(/\s+/);
    const command = parts[0].toLowerCase();
    const args = parts.slice(1);

    let commandType, commandData;

    switch (command) {
      case '/join':
        // /join <channel-name>
        if (args.length === 0) {
          this.showError(errorMsg, 'Usage: /join <channel-name>');
          return;
        }
        commandType = 'channel:join';
        commandData = { name: args[0] };
        break;

      case '/invite':
        // /invite @template or /invite @agent#id
        if (args.length === 0) {
          this.showError(errorMsg, 'Usage: /invite @template');
          return;
        }
        
        const mentionArg = args[0];
        if (!mentionArg.startsWith('@')) {
          this.showError(errorMsg, 'Usage: /invite @template');
          return;
        }

        const templateName = mentionArg.slice(1); // Remove @ prefix
        const prompt = args.slice(1).join(' ') || 'You have been invited to the channel';
        
        commandType = 'agent:invite';
        commandData = { 
          channel: this.currentChannel,
          template: templateName,
          prompt: prompt
        };
        break;

      case '/part':
        // /part (leave current channel)
        if (!this.currentChannel) {
          this.showError(errorMsg, 'No channel selected');
          return;
        }
        
        // Show confirmation for /part
        if (!confirm(`Are you sure you want to leave and delete the channel "${this.currentChannel}"?`)) {
          return;
        }
        
        commandType = 'channel:part';
        commandData = { name: this.currentChannel };
        break;

      default:
        this.showError(errorMsg, `Unknown command: ${command}. Available commands: /join, /invite, /part`);
        return;
    }

    // Dispatch slash command event
    this.dispatchEvent(new CustomEvent('slash-command', {
      detail: {
        command: commandType,
        data: commandData,
        originalText: content
      },
      bubbles: true,
      composed: true
    }));
  }

  showError(errorMsg, message) {
    errorMsg.textContent = message;
    errorMsg.style.display = 'block';
    setTimeout(() => {
      errorMsg.style.display = 'none';
    }, 3000);
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

customElements.define('message-input', MessageInput);
