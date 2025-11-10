// orchestrator-panel.mjs - Chat interface with selected agent
export class OrchestratorPanel extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  connectedCallback() {
    this.render();
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
          display: flex;
          flex-direction: column;
          height: 100%;
          background: #0f0f0f;
          font-family: 'Inter', -apple-system, sans-serif;
        }
        
        .header {
          padding: 1rem 1.5rem;
          background: #1a1a1a;
          border-bottom: 1px solid #333;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 1rem;
        }
        
        .header-left {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
        }
        
        .title {
          font-size: 0.875rem;
          font-weight: 700;
          color: #e0e0e0;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        
        .header-stats {
          display: flex;
          gap: 1rem;
          font-size: 0.75rem;
          font-family: 'JetBrains Mono', monospace;
        }
        
        .stat {
          display: flex;
          align-items: center;
          gap: 0.25rem;
          color: #888;
        }
        
        .stat-value {
          color: #00d4ff;
          font-weight: 600;
        }
        
        .content {
          flex: 1;
          overflow-y: auto;
          overflow-x: hidden;
          padding: 1rem;
          scroll-behavior: smooth;
        }
        
        .content::-webkit-scrollbar {
          width: 8px;
        }
        
        .content::-webkit-scrollbar-track {
          background: #1a1a1a;
        }
        
        .content::-webkit-scrollbar-thumb {
          background: #333;
          border-radius: 4px;
        }
        
        .content::-webkit-scrollbar-thumb:hover {
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
          text-align: center;
          font-size: 0.875rem;
        }
        
        .empty-icon {
          font-size: 2rem;
          opacity: 0.5;
        }
        
        .chat-input-container {
          padding: 1rem;
          background: #0a0a0a;
          border-top: 1px solid #333;
        }
        
        .chat-input {
          width: 100%;
          min-height: 80px;
          padding: 0.75rem;
          background: #0f0f0f;
          border: 2px solid #1a1a1a;
          border-radius: 8px;
          color: #e0e0e0;
          font-family: 'Inter', -apple-system, sans-serif;
          font-size: 0.875rem;
          resize: vertical;
          transition: all 0.3s ease;
          box-shadow: 0 0 0 0 rgba(0, 212, 255, 0);
        }
        
        .chat-input:focus {
          outline: none;
          border-color: #00d4ff;
          box-shadow: 0 0 20px rgba(0, 212, 255, 0.3);
        }
        
        .chat-input::placeholder {
          color: #555;
        }
        
        .input-footer {
          display: flex;
          justify-content: flex-end;
          margin-top: 0.75rem;
        }
        
        .send-button {
          background: linear-gradient(135deg, #00d4ff 0%, #0099cc 100%);
          color: #000;
          border: none;
          padding: 0.625rem 1.5rem;
          border-radius: 6px;
          font-weight: 600;
          font-size: 0.875rem;
          cursor: pointer;
          transition: all 0.2s;
          box-shadow: 0 2px 8px rgba(0, 212, 255, 0.3);
        }
        
        .send-button:hover {
          background: linear-gradient(135deg, #00e5ff 0%, #00aadd 100%);
          box-shadow: 0 4px 12px rgba(0, 212, 255, 0.5);
          transform: translateY(-1px);
        }
        
        .send-button:active {
          transform: translateY(0);
        }
        
        .send-button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
      </style>
      
      <slot></slot>
    `;
  }
}

customElements.define('orchestrator-panel', OrchestratorPanel);

