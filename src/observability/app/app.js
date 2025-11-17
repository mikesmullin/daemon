function app() {
  return {
    // WebSocket
    ws: null,
    wsState: 'disconnected', // 'disconnected' | 'connecting' | 'connected'
    wsReconnectTimer: null,
    messageQueue: [], // Messages to send when reconnected
    
    // UI State
    channelsSidebarOpen: true,
    currentPage: 'chat', // 'chat' | 'settings'
    currentChannel: null,
    ptyViewSession: null,
    
    // Data
    channels: [],
    sessions: [], // All sessions across all channels
    agents: {}, // Agents per channel: { channelName: [agent, ...] }
    events: [], // All events
    luceneFilters: {}, // Per-channel filters: { channelName: 'filter string' }
    mutedChannels: new Set(),
    mutedAgents: new Set(),
    
    // Computed
    get channelAgents() {
      if (!this.currentChannel) return [];
      return this.agents[this.currentChannel] || [];
    },
    
    get workingAgents() {
      return this.channelAgents.filter(a => 
        a.status === 'running' || a.status === 'working' || a.status === 'tool_exec'
      );
    },
    
    get luceneFilter() {
      return this.currentChannel ? (this.luceneFilters[this.currentChannel] || '') : '';
    },
    
    get filteredEvents() {
      let filtered = this.events.filter(e => {
        // Filter by current channel
        if (e.channel !== this.currentChannel) return false;
        
        return true;
      });
      
      // Apply Lucene filter if present
      const currentFilter = this.luceneFilter;
      if (currentFilter) {
        filtered = this.applyLuceneFilter(filtered, currentFilter);
      }
      
      return filtered;
    },
    
    init() {
      this.connectWebSocket();
      this.loadFromLocalStorage();
      this.setupPtyEventHandlers();
      
      // Play notification sound test
      // const audio = new Audio('/audio/notification.ogg');
      // audio.volume = 0.3;
      // audio.play().catch(() => {});
    },
    
    setupPtyEventHandlers() {
      // Listen for PTY attach requests from pty-viewer component
      window.addEventListener('pty:attach-request', (event) => {
        const { sessionId } = event.detail;
        this.send({
          type: 'pty:attach',
          session_id: sessionId
        });
      });
      
      // Listen for PTY detach requests from pty-viewer component
      window.addEventListener('pty:detach-request', (event) => {
        const { sessionId } = event.detail;
        this.send({
          type: 'pty:detach',
          session_id: sessionId
        });
      });
      
      // Listen for PTY input from pty-viewer component
      window.addEventListener('pty:input-request', (event) => {
        const { sessionId, data } = event.detail;
        this.send({
          type: 'pty:input',
          session_id: sessionId,
          data: data
        });
      });
    },
    
    connectWebSocket() {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}`;
      
      this.wsState = 'connecting';
      this.ws = new WebSocket(wsUrl);
      
      this.ws.onopen = () => {
        console.log('✅ WebSocket connected');
        this.wsState = 'connected';
        
        // Clear reconnect timer
        if (this.wsReconnectTimer) {
          clearTimeout(this.wsReconnectTimer);
          this.wsReconnectTimer = null;
        }
        
        // Send queued messages
        while (this.messageQueue.length > 0) {
          const msg = this.messageQueue.shift();
          this.send(msg);
        }
      };
      
      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          this.handleMessage(msg);
        } catch (err) {
          console.error('Failed to parse message:', err);
        }
      };
      
      this.ws.onerror = (error) => {
        console.error('WebSocket error:', error);
      };
      
      this.ws.onclose = () => {
        console.log('❌ WebSocket disconnected');
        this.wsState = 'disconnected';
        
        // Reconnect after 5 seconds
        this.wsReconnectTimer = setTimeout(() => {
          console.log('🔄 Attempting to reconnect...');
          this.connectWebSocket();
        }, 5000);
      };
    },
    
    handleMessage(msg) {
      console.debug(`📨 ${msg.type} ${JSON.stringify(msg)}`);
      
      switch (msg.type) {
        case 'init':
          this.handleInit(msg.data);
          break;
        case 'event':
          this.handleEvent(msg);
          break;
        case 'channel:created':
        case 'channel:joined':
          this.addChannel(msg.channel);
          this.showFeedbackMessage(`Joined channel "${msg.channel.metadata.name}"`);
          // Auto-select the newly created/joined channel
          this.currentChannel = msg.channel.metadata.name;
          break;
        case 'channel:deleted':
          this.removeChannel(msg.channel);
          this.showFeedbackMessage(`Left channel "${msg.channel}"`);
          break;
        case 'agent:invited':
          this.addAgent(msg);
          this.showFeedbackMessage(`Invited agent @${msg.agent} to ${msg.channel}`);
          break;
        case 'session:updated':
          this.updateSession(msg);
          break;
        case 'pty:attached':
          this.handlePtyAttached(msg);
          break;
        case 'pty:output':
          this.handlePtyOutput(msg);
          break;
        case 'pty:closed':
          this.handlePtyClosed(msg);
          break;
        case 'template:autocomplete:response':
          this.handleTemplateAutocomplete(msg);
          break;
        case 'template:list:response':
          this.handleTemplateListResponse(msg);
          break;
        case 'template:get:response':
          this.handleTemplateGetResponse(msg);
          break;
        case 'template:save:response':
          this.handleTemplateSaveResponse(msg);
          break;
        case 'template:delete:response':
          this.handleTemplateDeleteResponse(msg);
          break;
        case 'error':
          this.handleError(msg);
          break;
        default:
          // Handle other message types
          console.log('Unhandled message type:', msg.type);
          break;
      }
    },
    
    handleInit(data) {
      console.log('🔍 handleInit received:', JSON.stringify(data, null, 2));
      
      // Reset currentChannel to clear any bad values from localStorage
      this.currentChannel = null;
      
      this.channels = data.channels || [];
      this.sessions = data.sessions || [];
      this.events = data.events || [];
      
      console.log('🔍 After assignment:', {
        channelsCount: this.channels.length,
        sessionsCount: this.sessions.length,
        eventsCount: this.events.length
      });
      
      // Build agents list from sessions and channels
      this.agents = {};
      
      // For each channel, find its agent sessions
      for (const channel of this.channels) {
        const channelName = channel.metadata.name;
        this.agents[channelName] = [];
        
        const sessionIds = channel.spec?.agent_sessions || [];
        
        for (const sessionId of sessionIds) {
          // Find the session with this ID
          const session = this.sessions.find(s => s.metadata?.session_id === sessionId);
          
          if (session) {
            this.agents[channelName].push({
              name: session.metadata.name || 'unknown',
              session_id: sessionId,
              status: session.metadata?.state || 'unknown',
              model: session.metadata?.model || 'unknown',
              ptys: [] // TODO: Extract PTY info from session if available
            });
          }
        }
      }
      
      console.log('🔍 Built agents:', JSON.stringify(this.agents, null, 2));
      
      console.log('🔍 BEFORE auto-select: currentChannel=', this.currentChannel, 'type=', typeof this.currentChannel);
      if (this.currentChannel && typeof this.currentChannel === 'object') {
        console.log('🔍 currentChannel is an object! Keys:', Object.keys(this.currentChannel));
        console.log('🔍 currentChannel stringified:', JSON.stringify(this.currentChannel));
      }
      
      // Don't auto-select - let user choose
      // Auto-select first channel if none selected
      // if (!this.currentChannel && this.channels.length > 0) {
      //   const firstChannelName = this.channels[0].metadata.name;
      //   console.log('🔍 About to set currentChannel to:', firstChannelName, 'type:', typeof firstChannelName);
      //   this.currentChannel = firstChannelName;
      //   console.log('🔍 After setting, currentChannel is:', this.currentChannel, 'type:', typeof this.currentChannel);
      // } else {
      //   console.log('🔍 NOT auto-selecting. currentChannel=', this.currentChannel, 'channels.length=', this.channels.length);
      // }
      
      // Force update web components
      this.$nextTick(() => {
        console.log('🔍 Forcing component updates...');
        console.log('🔍 this.currentChannel:', this.currentChannel, 'type:', typeof this.currentChannel);
        console.log('🔍 this.agents:', JSON.stringify(this.agents, null, 2));
        
        const channelList = this.$el?.querySelector('channel-list');
        if (channelList) {
          // Convert Alpine.js Proxy to plain array
          const plainChannels = JSON.parse(JSON.stringify(this.channels));
          const plainCurrentChannel = this.currentChannel ? String(this.currentChannel) : null;
          console.log('🔍 Setting channelList.channels to:', plainChannels);
          console.log('🔍 plainCurrentChannel:', plainCurrentChannel);
          
          // Try setting directly
          channelList._channels = plainChannels;
          channelList._currentChannel = plainCurrentChannel;
          
          // Manually trigger render
          if (typeof channelList.render === 'function') {
            console.log('🔍 Calling channelList.render() manually');
            channelList.render();
          }
        }
        
        // Only update agent list if a channel is selected
        const agentList = this.$el?.querySelector('agent-list');
        if (agentList && this.currentChannel) {
          const plainCurrentChannel = String(this.currentChannel);
          const agentsForChannel = this.agents[plainCurrentChannel] || [];
          console.log('🔍 agentsForChannel for "' + plainCurrentChannel + '":', agentsForChannel);
          
          // Convert Alpine.js Proxy to plain array
          const plainAgents = JSON.parse(JSON.stringify(agentsForChannel));
          console.log('🔍 Setting agentList.agents to:', plainAgents);
          agentList._agents = plainAgents;
          agentList._currentChannel = plainCurrentChannel;
          if (typeof agentList.render === 'function') {
            console.log('🔍 Calling agentList.render() manually');
            agentList.render();
          }
        } else if (agentList) {
          // No channel selected - clear agents
          console.log('🔍 No channel selected, clearing agents');
          agentList._agents = [];
          agentList._currentChannel = null;
          if (typeof agentList.render === 'function') {
            agentList.render();
          }
        }
        
        // Also update thread-view
        const threadView = this.$el?.querySelector('thread-view');
        if (threadView) {
          const plainEvents = JSON.parse(JSON.stringify(this.events));
          const plainCurrentChannel = this.currentChannel ? String(this.currentChannel) : null;
          console.log('🔍 Setting threadView.events to:', plainEvents.length, 'events');
          threadView._events = plainEvents;
          threadView._currentChannel = plainCurrentChannel;
          if (typeof threadView.render === 'function') {
            threadView.render();
          }
        }
      });
    },
    
    handleEvent(msg) {
      const event = msg.data || msg.event || msg;
      event.channel = msg.channel || event.channel;
      event.timestamp = event.timestamp || Date.now();
      
      this.events.push(event);
      
      // Notify channel-list component about new event (handles unread count + sound)
      if (event.channel && event.channel !== this.currentChannel) {
        this.$nextTick(() => {
          const channelList = this.$el?.querySelector('channel-list');
          if (channelList) {
            channelList.handleNewEvent(event.channel);
          }
        });
      }
      
      // Keep buffer size limited
      if (this.events.length > 1000) {
        this.events.shift();
      }
    },
    
    addChannel(channel) {
      const existing = this.channels.find(c => c.metadata.name === channel.metadata.name);
      if (!existing) {
        this.channels.push(channel);
      }
    },
    
    removeChannel(channelName) {
      this.channels = this.channels.filter(c => c.metadata.name !== channelName);
      if (this.currentChannel === channelName) {
        this.currentChannel = this.channels[0]?.metadata.name || null;
      }
    },
    
    addAgent(msg) {
      const { channel, session_id, agent } = msg;
      if (!this.agents[channel]) {
        this.agents[channel] = [];
      }
      this.agents[channel].push({
        name: agent,
        session_id,
        status: 'pending'
      });
    },
    
    updateSession(msg) {
      // Update session in sessions array
      const idx = this.sessions.findIndex(s => s.metadata?.session_id === msg.session_id);
      if (idx >= 0) {
        this.sessions[idx] = msg.session;
      } else {
        this.sessions.push(msg.session);
      }
      
      // Rebuild agents and events if this session belongs to current channel
      if (this.currentChannel) {
        const agentsForChannel = this.agents[this.currentChannel] || [];
        const updatedSession = msg.session;
        const isInCurrentChannel = agentsForChannel.some(a => a.session_id === updatedSession.metadata?.session_id);
        
        if (isInCurrentChannel) {
          // Rebuild events for current channel
          const channelEvents = [];
          agentsForChannel.forEach(agent => {
            const session = this.sessions.find(s => s.metadata?.name === agent.name);
            if (session && session.spec?.messages) {
              session.spec.messages.forEach(msg => {
                const event = { ...msg };
                if (!event.session_id) {
                  event.session_id = session.metadata?.session_id;
                }
                if (!event.agent) {
                  event.agent = session.metadata?.name;
                }
                if (!event.timestamp && event.ts) {
                  event.timestamp = event.ts;
                }
                channelEvents.push(event);
              });
            }
          });
          
          // Sort events by timestamp
          channelEvents.sort((a, b) => {
            const timeA = new Date(a.timestamp).getTime();
            const timeB = new Date(b.timestamp).getTime();
            return timeA - timeB;
          });
          
          // Update thread view
          const threadView = this.$refs.threadView || this.$el?.querySelector('thread-view');
          if (threadView) {
            threadView._events = channelEvents;
            if (typeof threadView.render === 'function') {
              threadView.render();
            }
          }
        }
      }
    },
    
    handlePtyAttached(msg) {
      const { session_id, initial_content } = msg;
      
      // Dispatch to pty-viewer component via window event
      window.dispatchEvent(new CustomEvent('pty:output', {
        detail: {
          sessionId: session_id,
          initialContent: initial_content
        }
      }));
      
      console.log('✅ PTY attached:', session_id);
    },
    
    handlePtyOutput(msg) {
      const { session_id, data } = msg;
      
      // Dispatch to pty-viewer component via window event
      window.dispatchEvent(new CustomEvent('pty:output', {
        detail: {
          sessionId: session_id,
          data: data
        }
      }));
    },
    
    handlePtyClosed(msg) {
      const { session_id, exit_code, signal } = msg;
      
      console.log('🔚 PTY closed:', session_id, { exit_code, signal });
      
      // Optionally close the PTY viewer if it's currently viewing this session
      if (this.ptyViewSession === session_id) {
        // Could show a message in the terminal or auto-close
        window.dispatchEvent(new CustomEvent('pty:output', {
          detail: {
            sessionId: session_id,
            data: `\r\n\x1b[1;31m[PTY session closed: exit_code=${exit_code}, signal=${signal}]\x1b[0m\r\n`
          }
        }));
      }
    },
    
    handleTemplateAutocomplete(msg) {
      // Dispatch to message input component
      const messageInput = this.$el.querySelector('message-input');
      if (messageInput) {
        messageInput.dispatchEvent(new CustomEvent('autocomplete-results', {
          detail: { suggestions: msg.suggestions }
        }));
      }
    },
    
    handleTemplateListResponse(msg) {
      const editor = this.$refs.templateEditor;
      if (editor) {
        editor.setTemplates(msg.templates || []);
      }
    },
    
    handleTemplateGetResponse(msg) {
      const editor = this.$refs.templateEditor;
      if (editor) {
        editor.setTemplateContent(msg.content || '');
      }
    },
    
    handleTemplateSaveResponse(msg) {
      // Template saved successfully
      console.log('Template saved:', msg.name);
    },
    
    handleTemplateDeleteResponse(msg) {
      // Template deleted successfully
      console.log('Template deleted:', msg.name);
    },
    
    handleError(msg) {
      console.error('Server error:', msg.error);
      // TODO: Show toast notification
    },
    
    // UI Actions
    toggleChannelsSidebar() {
      this.channelsSidebarOpen = !this.channelsSidebarOpen;
    },
    
    selectChannel(event) {
      // Extract channel name from event detail
      const channelName = event.detail?.channel || event;
      console.log('🔍 selectChannel called with:', event, 'extracted channelName:', channelName);
      console.log('🔍 this.agents at time of selection:', JSON.stringify(this.agents, null, 2));
      
      this.currentChannel = channelName;
      
      // Update components
      this.$nextTick(() => {
        // Update channel-list
        const channelList = this.$refs.channelList;
        if (channelList) {
          channelList.clearUnreadCount(channelName);
          channelList._currentChannel = channelName;
          if (typeof channelList.render === 'function') {
            channelList.render();
          }
        }
        
        // Update agent-list with agents for this channel
        const agentList = this.$refs.agentList;
        console.log('🔍 agentList element:', agentList);
        if (agentList) {
          const agentsForChannel = this.agents[channelName] || [];
          console.log('🔍 this.agents[channelName]:', this.agents[channelName]);
          const plainAgents = JSON.parse(JSON.stringify(agentsForChannel));
          console.log('🔍 Updating agentList for channel:', channelName, 'agents:', plainAgents);
          agentList._agents = plainAgents;
          agentList._currentChannel = channelName;
          console.log('🔍 agentList._agents after set:', agentList._agents);
          if (typeof agentList.render === 'function') {
            console.log('🔍 Calling agentList.render()');
            agentList.render();
          } else {
            console.log('🔍 agentList.render is not a function!');
          }
        } else {
          console.log('🔍 agentList element not found!');
        }
        
        // Update thread-view with events for this channel
        const threadView = this.$refs.threadView;
        console.log('🔍 threadView ref:', threadView);
        if (threadView) {
          // Get all agents for this channel
          const agentsForChannel = this.agents[channelName] || [];
          console.log('🔍 agentsForChannel:', agentsForChannel.length, 'agents');
          
          // Collect all messages from sessions for this channel's agents
          const channelEvents = [];
          agentsForChannel.forEach(agent => {
            console.log('🔍 Looking for session for agent:', agent.name);
            const session = this.sessions.find(s => s.metadata?.name === agent.name);
            console.log('🔍 Found session:', session ? 'YES' : 'NO', session?.metadata?.name);
            if (session && session.spec?.messages) {
              console.log('🔍 Session has', session.spec.messages.length, 'messages');
              // Keep original messages but add metadata for UI rendering
              session.spec.messages.forEach(msg => {
                // Clone the original message to avoid mutating session data
                const event = { ...msg };
                
                // Add metadata that UI needs (but don't overwrite if already present)
                if (!event.session_id) {
                  event.session_id = session.metadata?.session_id;
                }
                if (!event.agent) {
                  event.agent = session.metadata?.name;
                }
                // Normalize timestamp field for sorting (but keep original field)
                if (!event.timestamp && event.ts) {
                  event.timestamp = event.ts;
                }
                
                channelEvents.push(event);
              });
            }
          });
          
          // Sort events by timestamp
          channelEvents.sort((a, b) => {
            const timeA = new Date(a.timestamp).getTime();
            const timeB = new Date(b.timestamp).getTime();
            return timeA - timeB;
          });
          
          console.log('🔍 Channel events for', channelName, ':', channelEvents.length, 'events');
          console.log('🔍 threadView element:', threadView);
          console.log('🔍 Setting threadView._events to:', channelEvents.length, 'events');
          threadView._events = channelEvents;
          threadView._currentChannel = channelName;
          console.log('🔍 threadView._events after set:', threadView._events?.length);
          console.log('🔍 threadView.render is function?', typeof threadView.render === 'function');
          if (typeof threadView.render === 'function') {
            console.log('🔍 Calling threadView.render()');
            threadView.render();
            console.log('🔍 threadView.render() completed');
          } else {
            console.log('🔍 threadView.render is not a function!');
          }
        } else {
          console.log('🔍 threadView element not found!');
        }
        
        // Update the filter display for this channel
        const filterComponent = this.$refs.luceneFilter;
        if (filterComponent) {
          filterComponent._filter = this.luceneFilters[channelName] || '';
          if (typeof filterComponent.render === 'function') {
            filterComponent.render();
          }
        }
      });
      
      this.saveToLocalStorage();
    },
    
    createChannel(event) {
      // Extract channel name from event detail or use directly if it's a string
      const channelName = typeof event === 'string' ? event : (event.detail?.name || event);
      
      if (channelName) {
        this.send({ type: 'channel:create', name: channelName });
      }
    },
    
    muteChannel(channelName) {
      // Let the channel-list component handle its own mute state
      this.saveToLocalStorage();
    },
    
    submitMessage(data) {
      const { agent, content } = data;
      
      // Regular message
      this.send({
        type: 'message:submit',
        channel: this.currentChannel,
        agent: agent,
        content: content
      });
    },
    
    handleSlashCommand(event) {
      const { command, data } = event.detail;
      
      console.log('Slash command:', command, data);
      
      // Send command to backend
      this.send({
        type: command,
        ...data
      });
      
      // Show feedback message based on command type
      this.showFeedback(command, data);
    },
    
    showFeedback(commandType, data) {
      let message = '';
      
      switch (commandType) {
        case 'channel:join':
          message = `Joining channel "${data.name}"...`;
          break;
        case 'agent:invite':
          message = `Inviting agent @${data.template} to ${data.channel}...`;
          break;
        case 'channel:part':
          message = `Leaving channel "${data.name}"...`;
          break;
        default:
          return;
      }
      
      this.showFeedbackMessage(message);
    },
    
    showFeedbackMessage(message) {
      // TODO: Replace with toast notification system
      console.log('✅', message);
      
      // For now, we could use a simple temporary notification
      // Later this should be replaced with a proper toast component
    },
    
    pauseAgent(event) {
      const sessionId = event.detail?.sessionId;
      if (!sessionId) return;
      this.send({ type: 'agent:pause', session_id: sessionId });
    },
    
    resumeAgent(event) {
      const sessionId = event.detail?.sessionId;
      if (!sessionId) return;
      this.send({ type: 'agent:resume', session_id: sessionId });
    },
    
    stopAgent(event) {
      const sessionId = event.detail?.sessionId;
      if (!sessionId) return;
      this.send({ type: 'agent:stop', session_id: sessionId });
    },
    
    muteAgent(event) {
      // Get sessionId from event detail
      const sessionId = event.detail?.sessionId;
      if (!sessionId) return;
      
      // According to PRD: append "AND NOT session:X" to the current channel's filter
      if (!this.currentChannel) return;
      
      const currentFilter = this.luceneFilters[this.currentChannel] || '';
      const muteFilter = `NOT session:${sessionId}`;
      
      // Check if already muted
      if (currentFilter.includes(`NOT session:${sessionId}`)) {
        // Already muted, do nothing or could remove it
        console.log(`Agent session ${sessionId} is already filtered`);
        return;
      }
      
      // Append to filter
      const newFilter = currentFilter 
        ? `${currentFilter} AND ${muteFilter}`
        : muteFilter;
      
      this.luceneFilters[this.currentChannel] = newFilter;
      this.saveToLocalStorage();
      
      // Update the lucene-filter component display
      this.$nextTick(() => {
        const filterComponent = this.$el?.querySelector('lucene-filter');
        if (filterComponent) {
          filterComponent.setAttribute('filter', newFilter);
        }
      });
    },
    
    handleAgentMention(event) {
      const { name, sessionId } = event.detail;
      // Dispatch event to message-input component
      const messageInput = this.$el.querySelector('message-input');
      if (messageInput) {
        messageInput.dispatchEvent(new CustomEvent('populate-mention', {
          detail: { name, sessionId }
        }));
      }
    },
    
    viewPty(sessionId) {
      this.ptyViewSession = sessionId;
    },
    
    closePty() {
      // Detach from PTY before closing view
      if (this.ptyViewSession) {
        this.send({
          type: 'pty:detach',
          session_id: this.ptyViewSession
        });
      }
      this.ptyViewSession = null;
    },
    
    closePtyForAgent(data) {
      const { agentSessionId, ptySessionId } = data.detail || data;
      const sessionKey = `${agentSessionId}:${ptySessionId}`;
      
      // Send close command to backend
      this.send({
        type: 'pty:close',
        session_id: sessionKey
      });
      
      console.log('Close PTY:', sessionKey);
    },
    
    editEvent(eventData) {
      // DEPRECATED: Old method - kept for backwards compatibility
      // Edit UI is now handled inline by thread-view component
      console.log('Edit event (deprecated handler):', eventData);
    },
    
    handleEventSave(event) {
      const { originalEvent, updatedEvent, isDelete, yaml } = event.detail;
      
      console.log('Event save:', { originalEvent, updatedEvent, isDelete });
      
      if (isDelete) {
        // Send delete request to backend
        this.send({
          type: 'session:delete-event',
          session_id: originalEvent.session_id,
          event_id: originalEvent.id || originalEvent.timestamp,
          channel: this.currentChannel
        });
        
        // Remove event from local array immediately
        const idx = this.events.findIndex(ev => 
          ev.session_id === originalEvent.session_id && 
          (ev.id === originalEvent.id || ev.timestamp === originalEvent.timestamp)
        );
        if (idx >= 0) {
          this.events.splice(idx, 1);
        }
      } else {
        // Send update request to backend
        this.send({
          type: 'session:update',
          session_id: originalEvent.session_id,
          event: updatedEvent,
          yaml: yaml,
          channel: this.currentChannel
        });
        
        // Update event in local array immediately
        const idx = this.events.findIndex(ev => 
          ev.session_id === originalEvent.session_id && 
          (ev.id === originalEvent.id || ev.timestamp === originalEvent.timestamp)
        );
        if (idx >= 0) {
          this.events[idx] = { ...this.events[idx], ...updatedEvent };
        }
      }
      
      // Force re-render of thread view
      this.$nextTick(() => {
        const threadView = this.$refs.threadView || this.$el?.querySelector('thread-view');
        if (threadView && typeof threadView.render === 'function') {
          threadView.render();
        }
      });
    },
    
    updateFilter(event) {
      // Extract filter from event detail or use directly if it's a string
      const filter = typeof event === 'string' ? event : (event.detail?.filter || '');
      
      if (this.currentChannel) {
        this.luceneFilters[this.currentChannel] = filter;
        this.saveToLocalStorage();
        
        // Update thread-view component
        this.$nextTick(() => {
          const threadView = this.$refs.threadView || this.$el?.querySelector('thread-view');
          if (threadView) {
            threadView._filter = filter;
            if (typeof threadView.render === 'function') {
              threadView.render();
            }
          }
        });
      }
    },
    
    clearFilter() {
      if (this.currentChannel) {
        this.luceneFilters[this.currentChannel] = '';
        this.saveToLocalStorage();
        
        // Update thread-view component
        this.$nextTick(() => {
          const threadView = this.$refs.threadView || this.$el?.querySelector('thread-view');
          if (threadView) {
            threadView._filter = '';
            if (typeof threadView.render === 'function') {
              threadView.render();
            }
          }
        });
      }
    },
    
    addFilterExclusion(event) {
      if (!this.currentChannel) return;
      
      const { field, value, exclude } = event.detail;
      const currentFilter = this.luceneFilters[this.currentChannel] || '';
      
      // Build the exclusion term
      const exclusion = `NOT ${field}:${value}`;
      
      // Check if already in filter
      if (currentFilter.includes(exclusion)) {
        console.log('Filter already contains this exclusion');
        return;
      }
      
      // Append to filter
      const newFilter = currentFilter 
        ? `${currentFilter} AND ${exclusion}`
        : exclusion;
      
      this.luceneFilters[this.currentChannel] = newFilter;
      this.saveToLocalStorage();
      
      // Update the lucene-filter component display
      this.$nextTick(() => {
        const filterComponent = this.$refs.luceneFilter || this.$el?.querySelector('lucene-filter');
        if (filterComponent) {
          filterComponent._filter = newFilter;
          if (typeof filterComponent.updateDisplay === 'function') {
            filterComponent.updateDisplay();
          }
        }
        
        // Also update thread-view
        const threadView = this.$refs.threadView || this.$el?.querySelector('thread-view');
        if (threadView) {
          threadView._filter = newFilter;
          if (typeof threadView.render === 'function') {
            threadView.render();
          }
        }
      });
    },
    
    searchTemplates(event) {
      const query = event.detail?.query || event;
      this.send({
        type: 'template:autocomplete',
        query
      });
    },
    
    goHome() {
      this.currentPage = 'chat';
    },
    
    goToSettings() {
      this.currentPage = 'settings';
      
      // Request template list after switching to settings page
      this.$nextTick(() => {
        const editor = this.$refs.templateEditor;
        if (editor) {
          this.send({ type: 'template:list' });
        }
      });
    },
    
    handleTemplateListRequest() {
      this.send({ type: 'template:list' });
    },
    
    handleTemplateGetRequest(event) {
      const { name } = event.detail;
      this.send({ 
        type: 'template:get', 
        name 
      });
    },
    
    handleTemplateSaveRequest(event) {
      const { name, yaml } = event.detail;
      this.send({ 
        type: 'template:save', 
        name, 
        yaml 
      });
    },
    
    handleTemplateDeleteRequest(event) {
      const { name } = event.detail;
      this.send({ 
        type: 'template:delete', 
        name 
      });
    },
    
    // Helpers
    send(msg) {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify(msg));
      } else {
        // Queue message if not connected
        this.messageQueue.push(msg);
        console.warn('WebSocket not connected, message queued:', msg);
      }
    },
    
    applyLuceneFilter(events, filterStr) {
      if (!filterStr || !filterStr.trim()) {
        return events;
      }
      
      try {
        // Parse the Lucene query into a simple query tree
        const query = this.parseLuceneQuery(filterStr);
        
        // Filter events based on the parsed query
        return events.filter(event => this.matchesQuery(event, query));
      } catch (err) {
        console.error('Lucene filter error:', err);
        
        // Show error in the filter component
        const filterComponent = this.$el?.querySelector('lucene-filter');
        if (filterComponent) {
          filterComponent.setError(`Invalid filter syntax: ${err.message}`);
        }
        
        // Return all events on error
        return events;
      }
    },
    
    parseLuceneQuery(queryStr) {
      // Simple Lucene-like parser
      // Supports: field:value, AND, OR, NOT, parentheses, wildcards
      const tokens = this.tokenizeLuceneQuery(queryStr);
      return this.parseTokens(tokens);
    },
    
    tokenizeLuceneQuery(queryStr) {
      const tokens = [];
      let current = '';
      let inQuotes = false;
      
      for (let i = 0; i < queryStr.length; i++) {
        const char = queryStr[i];
        
        if (char === '"') {
          inQuotes = !inQuotes;
          current += char;
        } else if (!inQuotes && /\s/.test(char)) {
          if (current) {
            tokens.push(current);
            current = '';
          }
        } else if (!inQuotes && (char === '(' || char === ')')) {
          if (current) {
            tokens.push(current);
            current = '';
          }
          tokens.push(char);
        } else {
          current += char;
        }
      }
      
      if (current) {
        tokens.push(current);
      }
      
      return tokens;
    },
    
    parseTokens(tokens) {
      // Simple recursive descent parser
      const output = [];
      const operators = [];
      
      for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i];
        
        if (token === '(') {
          operators.push(token);
        } else if (token === ')') {
          while (operators.length && operators[operators.length - 1] !== '(') {
            output.push(operators.pop());
          }
          operators.pop(); // Remove '('
        } else if (token === 'AND' || token === 'OR') {
          while (operators.length && this.getPrecedence(operators[operators.length - 1]) >= this.getPrecedence(token)) {
            output.push(operators.pop());
          }
          operators.push(token);
        } else if (token === 'NOT') {
          operators.push(token);
        } else {
          // It's a term (field:value or just value)
          output.push(this.parseTerm(token));
        }
      }
      
      while (operators.length) {
        output.push(operators.pop());
      }
      
      // Convert postfix to tree
      return this.buildQueryTree(output);
    },
    
    getPrecedence(op) {
      if (op === 'NOT') return 3;
      if (op === 'AND') return 2;
      if (op === 'OR') return 1;
      return 0;
    },
    
    parseTerm(token) {
      // Parse field:value or just value
      const colonIndex = token.indexOf(':');
      
      if (colonIndex > 0 && colonIndex < token.length - 1) {
        const field = token.substring(0, colonIndex);
        let value = token.substring(colonIndex + 1);
        
        // Remove quotes if present
        if (value.startsWith('"') && value.endsWith('"')) {
          value = value.slice(1, -1);
        }
        
        return { type: 'term', field, value };
      } else {
        // No field specified - search all fields
        let value = token;
        if (value.startsWith('"') && value.endsWith('"')) {
          value = value.slice(1, -1);
        }
        return { type: 'term', field: '*', value };
      }
    },
    
    buildQueryTree(postfix) {
      const stack = [];
      
      for (const item of postfix) {
        if (typeof item === 'object' && item.type === 'term') {
          stack.push(item);
        } else if (item === 'NOT') {
          const operand = stack.pop();
          stack.push({ type: 'NOT', operand });
        } else if (item === 'AND' || item === 'OR') {
          const right = stack.pop();
          const left = stack.pop();
          stack.push({ type: item, left, right });
        }
      }
      
      return stack.length > 0 ? stack[0] : { type: 'term', field: '*', value: '' };
    },
    
    matchesQuery(event, query) {
      if (!query) return true;
      
      switch (query.type) {
        case 'term':
          return this.matchesTerm(event, query.field, query.value);
          
        case 'NOT':
          return !this.matchesQuery(event, query.operand);
          
        case 'AND':
          return this.matchesQuery(event, query.left) && this.matchesQuery(event, query.right);
          
        case 'OR':
          return this.matchesQuery(event, query.left) || this.matchesQuery(event, query.right);
          
        default:
          return true;
      }
    },
    
    matchesTerm(event, field, value) {
      // Convert value pattern to regex for wildcard support
      const pattern = value.replace(/\*/g, '.*').replace(/\?/g, '.');
      const regex = new RegExp(`^${pattern}$`, 'i');
      
      if (field === '*') {
        // Search all fields
        const searchStr = JSON.stringify(event).toLowerCase();
        return searchStr.includes(value.toLowerCase());
      }
      
      // Map field names to event properties
      let fieldValue = '';
      
      switch (field.toLowerCase()) {
        case 'session':
        case 'session_id':
          fieldValue = String(event.session_id || event.metadata?.session_id || '');
          break;
          
        case 'agent':
        case 'agent_name':
          fieldValue = String(event.agent || event.metadata?.agent || '');
          break;
          
        case 'tool':
        case 'tool_name':
          // For tool_call events
          fieldValue = String(event.tool_call?.function?.name || event.function?.name || '');
          break;
          
        case 'type':
        case 'event_type':
          fieldValue = String(event.type || '');
          break;
          
        case 'content':
        case 'message':
          // For user requests and responses
          fieldValue = String(event.content || event.message || event.user_request || '');
          break;
          
        case 'status':
          fieldValue = String(event.status || event.success || '');
          break;
          
        case 'pty':
        case 'ptty':
        case 'pty_session':
          // For PTY-related events
          fieldValue = String(event.pty_session_id || event.sessionId || '');
          break;
          
        default:
          // Try direct property access
          fieldValue = String(event[field] || '');
          break;
      }
      
      return regex.test(fieldValue);
    },
    
    loadFromLocalStorage() {
      try {
        const saved = localStorage.getItem('daemon_state');
        if (saved) {
          const state = JSON.parse(saved);
          this.currentChannel = state.currentChannel || null;
          this.luceneFilters = state.luceneFilters || {};
          this.mutedChannels = new Set(state.mutedChannels || []);
          this.mutedAgents = new Set(state.mutedAgents || []);
        }
      } catch (err) {
        console.error('Failed to load state:', err);
      }
    },
    
    saveToLocalStorage() {
      try {
        const state = {
          currentChannel: this.currentChannel,
          luceneFilters: this.luceneFilters,
          mutedChannels: Array.from(this.mutedChannels),
          mutedAgents: Array.from(this.mutedAgents)
        };
        localStorage.setItem('daemon_state', JSON.stringify(state));
      } catch (err) {
        console.error('Failed to save state:', err);
      }
    }
  };
}
