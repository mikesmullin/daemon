// Presence Indicator - Shows which agents are currently working
class PresenceIndicator extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  connectedCallback() {
    this.render();
  }

  static get observedAttributes() {
    return ['working-agents'];
  }

  attributeChangedCallback() {
    this.render();
  }

  get workingAgents() {
    try {
      return JSON.parse(this.getAttribute('working-agents') || '[]');
    } catch {
      return [];
    }
  }

  render() {
    const agents = this.workingAgents;
    if (agents.length === 0) {
      this.style.display = 'none';
      return;
    }

    this.style.display = 'block';

    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
          padding: 0.75rem 1.5rem;
          background: #1a1a1a;
          border-bottom: 1px solid #333;
          font-size: 0.875rem;
          color: #888;
        }
        
        .indicator {
          display: flex;
          align-items: center;
          gap: 0.75rem;
        }
        
        .asterisk {
          font-size: 1rem;
        }
        
        .avatars {
          display: flex;
          gap: 0.5rem;
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
        }
        
        .text {
          display: flex;
          align-items: center;
          gap: 0.25rem;
        }
        
        .ellipsis {
          display: inline-block;
          animation: ellipsis 1.5s infinite;
        }
        
        @keyframes ellipsis {
          0% { content: '.'; }
          33% { content: '..'; }
          66% { content: '...'; }
        }
        
        .ellipsis::after {
          content: '...';
          animation: ellipsis-content 1.5s infinite;
        }
        
        @keyframes ellipsis-content {
          0%, 25% { content: '.'; }
          26%, 50% { content: '..'; }
          51%, 100% { content: '...'; }
        }
      </style>
      
      <div class="indicator">
        <span class="asterisk">*</span>
        <div class="avatars">
          ${agents.slice(0, 6).map(a => `
            <div class="avatar" title="${a.name} #${a.session_id || ''}">${(a.name || '?')[0].toUpperCase()}</div>
          `).join('')}
          ${agents.length > 6 ? `<div class="avatar" title="+${agents.length - 6} more">+${agents.length - 6}</div>` : ''}
        </div>
        <div class="text">
          <span>${agents.length === 1 ? 'is' : 'are'} working</span>
          <span class="ellipsis"></span>
        </div>
      </div>
    `;
  }
}

customElements.define('presence-indicator', PresenceIndicator);
