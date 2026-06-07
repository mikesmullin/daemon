// auto-follow-toggle.mjs - Toggle for auto-scroll feature
export class AutoFollowToggle extends HTMLElement {
  static observedAttributes = ['active'];

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  connectedCallback() {
    this.render();
  }

  attributeChangedCallback() {
    this.render();
  }

  toggle = () => {
    const active = this.getAttribute('active') === 'true';
    this.setAttribute('active', (!active).toString());
    
    this.dispatchEvent(new CustomEvent('toggle', {
      bubbles: true,
      composed: true,
      detail: { active: !active }
    }));
  }

  render() {
    const active = this.getAttribute('active') === 'true';

    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: inline-block;
        }
        
        .toggle {
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.5rem 0.75rem;
          background: ${active ? '#00d4ff22' : '#2a2a2a'};
          border: 1px solid ${active ? '#00d4ff' : '#444'};
          border-radius: 6px;
          cursor: pointer;
          transition: all 0.2s;
          font-family: 'Inter', -apple-system, sans-serif;
          user-select: none;
        }
        
        .toggle:hover {
          background: ${active ? '#00d4ff33' : '#333'};
          border-color: #00d4ff;
        }
        
        .switch {
          position: relative;
          width: 36px;
          height: 20px;
          background: ${active ? '#00d4ff' : '#444'};
          border-radius: 10px;
          transition: all 0.3s;
        }
        
        .switch::after {
          content: '';
          position: absolute;
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: white;
          top: 2px;
          left: ${active ? '18px' : '2px'};
          transition: all 0.3s;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
        }
        
        .label {
          font-size: 0.75rem;
          font-weight: 600;
          color: ${active ? '#00d4ff' : '#a0a0a0'};
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
      </style>
      
      <div class="toggle">
        <div class="switch"></div>
        <div class="label">AUTO-FOLLOW</div>
      </div>
    `;

    const toggle = this.shadowRoot.querySelector('.toggle');
    toggle?.addEventListener('click', this.toggle);
  }
}

customElements.define('auto-follow-toggle', AutoFollowToggle);
