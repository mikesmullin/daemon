// search-bar.mjs - Search and filter component
export class SearchBar extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.debounceTimer = null;
  }

  connectedCallback() {
    this.render();
  }

  setupEventListeners() {
    const input = this.shadowRoot.querySelector('input');
    if (input) {
      input.addEventListener('input', (e) => {
        const value = e.target.value;
        
        // Debounce search
        clearTimeout(this.debounceTimer);
        this.debounceTimer = setTimeout(() => {
          this.dispatchSearch(value);
        }, 300);
      });
    }
  }

  dispatchSearch(query) {
    this.dispatchEvent(new CustomEvent('search', {
      bubbles: true,
      composed: true,
      detail: {
        query: query,
        filters: {}
      }
    }));
  }

  render() {
    const placeholder = this.getAttribute('placeholder') || 'Search agents, events, tasks, files...';

    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
          width: 500px;
          flex-shrink: 0;
        }
        
        .search-container {
          position: relative;
        }
        
        input {
          width: 100%;
          padding: 0.5rem 1rem 0.5rem 2.25rem;
          background: #0f0f0f;
          border: 1px solid #333;
          border-radius: 6px;
          color: #e0e0e0;
          font-size: 0.875rem;
          font-family: 'Inter', -apple-system, sans-serif;
          transition: all 0.2s;
          box-sizing: border-box;
        }
        
        input:focus {
          outline: none;
          border-color: #00d4ff;
          box-shadow: 0 0 0 2px #00d4ff22;
        }
        
        input::placeholder {
          color: #666;
        }
        
        .icon {
          position: absolute;
          left: 0.625rem;
          top: 50%;
          transform: translateY(-50%);
          color: #666;
          font-size: 0.875rem;
          pointer-events: none;
        }
      </style>
      
      <div class="search-container">
        <span class="icon">🔍</span>
        <input type="text" placeholder="${placeholder}" />
      </div>
    `;
    
    // Setup event listeners after render
    this.setupEventListeners();
  }
}

customElements.define('search-bar', SearchBar);
