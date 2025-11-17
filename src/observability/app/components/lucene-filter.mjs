// Lucene Filter Component
class LuceneFilter extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.errorMessage = '';
    
    // Internal data storage (for properties set by Alpine.js)
    this._filter = '';
  }

  connectedCallback() {
    this.render();
    
    // Listen for exclude events from bubbles
    window.addEventListener('filter-exclude', (e) => {
      this.appendExclusion(e.detail);
    });
  }

  static get observedAttributes() {
    return ['filter'];
  }

  attributeChangedCallback() {
    this.render();
  }

  // Support both property and attribute setting (for Alpine.js)
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

  appendExclusion(detail) {
    const { field, value } = detail;
    const input = this.shadowRoot.querySelector('.filter-input');
    const currentFilter = input.value.trim();
    
    const exclusion = `NOT ${field}:${value}`;
    const newFilter = currentFilter 
      ? `${currentFilter} AND ${exclusion}`
      : exclusion;
    
    input.value = newFilter;
    this.shadowRoot.querySelector('.clear-btn').style.display = '';
    this.dispatchEvent(new CustomEvent('filter-change', { 
      detail: { filter: newFilter } 
    }));
  }

  render() {
    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
          padding: 1rem 1.5rem;
          background: #1a1a1a;
          border-bottom: 1px solid #333;
        }
        
        .filter-container {
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }
        
        .filter-label {
          font-size: 0.75rem;
          font-weight: 600;
          color: #888;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        
        .filter-input-wrapper {
          flex: 1;
          position: relative;
        }
        
        .filter-input {
          width: 100%;
          padding: 0.5rem 2rem 0.5rem 0.75rem;
          background: #0f0f0f;
          border: 1px solid #333;
          border-radius: 6px;
          color: #e0e0e0;
          font-family: 'JetBrains Mono', monospace;
          font-size: 0.875rem;
          transition: all 0.2s;
        }
        
        .filter-input.error {
          border-color: #ff4444;
        }
        
        .filter-input:focus {
          outline: none;
          border-color: #00d4ff;
          box-shadow: 0 0 0 2px rgba(0, 212, 255, 0.2);
        }
        
        .filter-input.error:focus {
          border-color: #ff4444;
          box-shadow: 0 0 0 2px rgba(255, 68, 68, 0.2);
        }
        
        .filter-input::placeholder {
          color: #555;
        }
        
        .clear-btn {
          position: absolute;
          right: 0.5rem;
          top: 50%;
          transform: translateY(-50%);
          width: 24px;
          height: 24px;
          border: none;
          background: transparent;
          color: #666;
          cursor: pointer;
          border-radius: 4px;
          font-size: 1rem;
          transition: all 0.2s;
        }
        
        .clear-btn:hover {
          background: #2a2a2a;
          color: #e0e0e0;
        }
        
        .error-text {
          margin-top: 0.5rem;
          font-size: 0.75rem;
          color: #ff4444;
          display: ${this.errorMessage ? 'block' : 'none'};
        }
        
        .help-text {
          margin-top: 0.5rem;
          font-size: 0.75rem;
          color: #666;
          display: ${this.errorMessage ? 'none' : 'block'};
        }
        
        .help-text code {
          font-family: 'JetBrains Mono', monospace;
          color: #00d4ff;
          background: #1a1a1a;
          padding: 0.125rem 0.25rem;
          border-radius: 2px;
        }
      </style>
      
      <div class="filter-container">
        <div class="filter-label">Filter</div>
        <div class="filter-input-wrapper">
          <input
            type="text"
            class="filter-input ${this.errorMessage ? 'error' : ''}"
            placeholder="session:12 AND tool:execute_shell OR NOT agent:alice"
            value="${this.filter}"
          />
          <button class="clear-btn" title="Clear filter" ${!this.filter ? 'style="display:none;"' : ''}>✕</button>
        </div>
      </div>
      
      <div class="error-text">${this.errorMessage}</div>
      
      <div class="help-text">
        Examples: <code>session:12</code>, <code>tool:ask_human</code>, <code>NOT agent:bob</code>
      </div>
    `;

    const input = this.shadowRoot.querySelector('.filter-input');
    const clearBtn = this.shadowRoot.querySelector('.clear-btn');

    let debounceTimer;
    input.addEventListener('input', (e) => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        const value = e.target.value;
        clearBtn.style.display = value ? '' : 'none';
        
        // Clear error when user types
        this.errorMessage = '';
        input.classList.remove('error');
        this.shadowRoot.querySelector('.error-text').style.display = 'none';
        this.shadowRoot.querySelector('.help-text').style.display = 'block';
        
        this.dispatchEvent(new CustomEvent('filter-change', { 
          detail: { filter: value } 
        }));
      }, 300);
    });

    clearBtn.addEventListener('click', () => {
      input.value = '';
      clearBtn.style.display = 'none';
      this.errorMessage = '';
      this.dispatchEvent(new CustomEvent('filter-clear'));
      this.render();
    });
  }
  
  setError(message) {
    this.errorMessage = message;
    this.render();
  }
  
  clearError() {
    this.errorMessage = '';
    this.render();
  }
}

customElements.define('lucene-filter', LuceneFilter);
