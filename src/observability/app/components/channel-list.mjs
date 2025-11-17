// Channel List Component
class ChannelList extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    
    // Track unread counts and mute state per channel
    this.unreadCounts = new Map();
    this.muteStates = new Map();
    
    // Load mute states from localStorage
    this.loadMuteStates();
    
    // Audio notification
    this.notificationSound = new Audio('/audio/notification.ogg');
    this.notificationSound.volume = 0.3; // 30% volume
  }

  connectedCallback() {
    this.render();
  }

  static get observedAttributes() {
    return ['channels', 'current-channel'];
  }

  attributeChangedCallback() {
    this.render();
  }

  // Support both property and attribute setting (for Alpine.js)
  set channels(value) {
    if (Array.isArray(value)) {
      this._channels = value;
      this.render();
    }
  }

  get channels() {
    // First try internal property (set by Alpine.js)
    if (this._channels && this._channels.length > 0) {
      return this._channels;
    }
    // Fall back to attribute
    try {
      const attr = this.getAttribute('channels');
      return attr ? JSON.parse(attr) : [];
    } catch {
      return [];
    }
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

  loadMuteStates() {
    try {
      const saved = localStorage.getItem('channel-mute-states');
      if (saved) {
        const states = JSON.parse(saved);
        this.muteStates = new Map(Object.entries(states));
      }
    } catch (e) {
      console.error('Failed to load mute states:', e);
    }
  }

  saveMuteStates() {
    try {
      const states = Object.fromEntries(this.muteStates);
      localStorage.setItem('channel-mute-states', JSON.stringify(states));
    } catch (e) {
      console.error('Failed to save mute states:', e);
    }
  }

  isMuted(channelName) {
    return this.muteStates.get(channelName) === true;
  }

  toggleMute(channelName) {
    const currentState = this.isMuted(channelName);
    this.muteStates.set(channelName, !currentState);
    this.saveMuteStates();
    
    // Clear badge when muting
    if (!currentState) {
      this.setUnreadCount(channelName, 0);
    }
    
    this.render();
  }

  getUnreadCount(channelName) {
    return this.unreadCounts.get(channelName) || 0;
  }

  setUnreadCount(channelName, count) {
    this.unreadCounts.set(channelName, count);
    this.render();
  }

  incrementUnreadCount(channelName) {
    // Don't increment if channel is muted or is the current channel
    if (this.isMuted(channelName) || channelName === this.currentChannel) {
      return;
    }
    
    const currentCount = this.getUnreadCount(channelName);
    const newCount = currentCount + 1;
    this.unreadCounts.set(channelName, newCount);
    
    // Play notification sound
    this.playNotificationSound();
    
    this.render();
  }

  clearUnreadCount(channelName) {
    this.setUnreadCount(channelName, 0);
  }

  playNotificationSound() {
    // Play sound, but catch and ignore errors gracefully
    try {
      this.notificationSound.currentTime = 0;
      this.notificationSound.play().catch(err => {
        console.warn('Failed to play notification sound:', err);
      });
    } catch (e) {
      console.warn('Failed to play notification sound:', e);
    }
  }

  // Called externally when a new event arrives for a channel
  handleNewEvent(channelName) {
    this.incrementUnreadCount(channelName);
  }

  render() {
    const channels = this.channels;
    const current = this.currentChannel;
    
    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: flex;
          flex-direction: column;
          height: 100%;
        }
        
        .header {
          padding: 1rem 1.5rem;
          background: #1a1a1a;
          border-bottom: 1px solid #333;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        
        .title {
          font-size: 0.875rem;
          font-weight: 700;
          color: #e0e0e0;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        
        .add-btn {
          width: 24px;
          height: 24px;
          border-radius: 4px;
          background: #2a2a2a;
          border: 1px solid #444;
          color: #00d4ff;
          font-size: 1.2rem;
          line-height: 1;
          cursor: pointer;
          transition: all 0.2s;
        }
        
        .add-btn:hover {
          background: #333;
          border-color: #00d4ff;
        }
        
        .channels {
          flex: 1;
          overflow-y: auto;
          padding: 0.5rem;
        }
        
        .channel {
          padding: 0.75rem 1rem;
          margin-bottom: 0.25rem;
          border-radius: 6px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: space-between;
          transition: all 0.2s;
          font-size: 0.875rem;
        }
        
        .channel:hover {
          background: #1a1a1a;
        }
        
        .channel.active {
          background: #00d4ff22;
          color: #00d4ff;
        }
        
        .channel-name {
          flex: 1;
        }
        
        .badges {
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }
        
        .unread-badge {
          min-width: 20px;
          height: 20px;
          padding: 0 6px;
          background: #ff4444;
          color: #fff;
          font-size: 0.75rem;
          font-weight: 600;
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        
        .mute-btn {
          width: 20px;
          height: 20px;
          border-radius: 4px;
          background: transparent;
          border: none;
          color: #666;
          cursor: pointer;
          font-size: 0.875rem;
          transition: color 0.2s;
        }
        
        .mute-btn:hover {
          color: #e0e0e0;
        }
        
        .mute-btn.muted {
          color: #ff4444;
        }
        
        .settings {
          padding: 1rem 1.5rem;
          border-top: 1px solid #333;
        }
        
        .settings-link {
          color: #888;
          text-decoration: none;
          font-size: 0.875rem;
          display: block;
          padding: 0.5rem;
          border-radius: 4px;
          transition: all 0.2s;
        }
        
        .settings-link:hover {
          color: #00d4ff;
          background: #1a1a1a;
        }
        
        .empty {
          padding: 2rem 1rem;
          text-align: center;
          color: #666;
          font-size: 0.875rem;
        }
      </style>
      
      <div class="header">
        <div class="title">Channels</div>
        <button class="add-btn" title="Create channel">+</button>
      </div>
      
      <div class="channels">
        ${channels.length === 0 ? `
          <div class="empty">
            No channels yet.<br>
            Click + to create one.
          </div>
        ` : channels.map(ch => {
          const name = ch.metadata?.name || ch.name || 'unknown';
          const isActive = name === current;
          const unreadCount = this.getUnreadCount(name);
          const isMuted = this.isMuted(name);
          const showBadge = unreadCount > 0 && !isMuted;
          
          return `
            <div class="channel ${isActive ? 'active' : ''}" data-channel="${name}">
              <div class="channel-name">${name}</div>
              <div class="badges">
                ${showBadge ? `<span class="unread-badge">${unreadCount}</span>` : ''}
                <button class="mute-btn ${isMuted ? 'muted' : ''}" data-action="mute" title="${isMuted ? 'Unmute' : 'Mute'} notifications">
                  ${isMuted ? '🔕' : '🔔'}
                </button>
              </div>
            </div>
          `;
        }).join('')}
      </div>
      
      <div class="settings">
        <a href="#" class="settings-link" data-action="settings">⚙️ Agent Templates</a>
      </div>
    `;

    // Event listeners
    this.shadowRoot.querySelector('.add-btn')?.addEventListener('click', () => {
      const name = prompt('Enter channel name:');
      if (name) {
        this.dispatchEvent(new CustomEvent('channel-create', { detail: { name } }));
      }
    });

    this.shadowRoot.querySelectorAll('.channel').forEach(el => {
      el.addEventListener('click', (e) => {
        if (e.target.closest('[data-action]')) return;
        const channel = el.dataset.channel;
        
        // Clear unread count when channel is selected
        this.clearUnreadCount(channel);
        
        this.dispatchEvent(new CustomEvent('channel-select', { detail: { channel } }));
      });
    });

    this.shadowRoot.querySelectorAll('[data-action="mute"]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const channel = btn.closest('.channel').dataset.channel;
        
        // Toggle mute state
        this.toggleMute(channel);
        
        this.dispatchEvent(new CustomEvent('channel-mute', { 
          detail: { 
            channel,
            muted: this.isMuted(channel)
          } 
        }));
      });
    });

    this.shadowRoot.querySelector('[data-action="settings"]')?.addEventListener('click', (e) => {
      e.preventDefault();
      this.dispatchEvent(new CustomEvent('settings-open'));
    });
  }
}

customElements.define('channel-list', ChannelList);
