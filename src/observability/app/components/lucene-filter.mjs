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
    this.setupEventListeners();
    
    // Listen for exclude events from bubbles
    // this.handleFilterExclude = (e) => {
    //   this.appendExclusion(e.detail);
    // };
    // window.addEventListener('filter-exclude', this.handleFilterExclude);
  }

  disconnectedCallback() {
    // Clean up event listener
    if (this.handleFilterExclude) {
      window.removeEventListener('filter-exclude', this.handleFilterExclude);
    }
  }

  static get observedAttributes() {
    return ['filter'];
  }

  attributeChangedCallback() {
    this.updateDisplay();
  }

  // Support both property and attribute setting (for Alpine.js)
  set filter(value) {
    this._filter = value || '';
    this.updateDisplay();
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
    this._filter = newFilter;
    
    // Trigger filter change event
    this.dispatchEvent(new CustomEvent('filter-change', { 
      detail: { filter: newFilter } 
    }));
  }

  updateDisplay() {
    const input = this.shadowRoot?.querySelector('.filter-input');
    const clearBtn = this.shadowRoot?.querySelector('.clear-btn');
    if (input && this._filter !== input.value) {
      input.value = this._filter;
    }
    if (clearBtn) {
      clearBtn.style.display = this._filter ? '' : 'none';
    }
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
        }
        
        .help-text {
          margin-top: 0.5rem;
          font-size: 0.75rem;
          color: #666;
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
            class="filter-input"
            placeholder="session:12 AND tool:execute_shell OR NOT agent:alice"
            value=""
          />
          <button class="clear-btn" title="Clear filter" style="display:none;">✕</button>
        </div>
      </div>
      
      <div class="error-text"></div>
      
      <div class="help-text">
        Examples: <code>session:12</code>, <code>tool:ask_human</code>, <code>NOT agent:bob</code>
      </div>
    `;
  }

  setupEventListeners() {
    const input = this.shadowRoot.querySelector('.filter-input');
    const clearBtn = this.shadowRoot.querySelector('.clear-btn');
    
    if (!input || !clearBtn) {
      console.warn('LuceneFilter: input or clearBtn not found in shadow DOM');
      return;
    }

    let debounceTimer;
    input.addEventListener('input', (e) => {
      clearTimeout(debounceTimer);
      const currentTarget = e.target;
      debounceTimer = setTimeout(() => {
        if (!currentTarget) {
          console.warn('LuceneFilter: input event has no target');
          return;
        }
        const value = currentTarget.value;
        const currentClearBtn = this.shadowRoot?.querySelector('.clear-btn');
        if (currentClearBtn) {
          currentClearBtn.style.display = value ? '' : 'none';
        }
        
        // Clear error when user types
        this.errorMessage = '';
        if (currentTarget) {
          currentTarget.classList.remove('error');
        }
        const errorText = this.shadowRoot?.querySelector('.error-text');
        const helpText = this.shadowRoot?.querySelector('.help-text');
        if (errorText) errorText.style.display = 'none';
        if (helpText) helpText.style.display = 'block';
        
        this.dispatchEvent(new CustomEvent('filter-change', { 
          detail: { filter: value } 
        }));
      }, 300);
    });

    clearBtn.addEventListener('click', () => {
      const currentInput = this.shadowRoot?.querySelector('.filter-input');
      const currentClearBtn = this.shadowRoot?.querySelector('.clear-btn');
      
      if (!currentInput || !currentClearBtn) {
        console.warn('LuceneFilter: elements not found during clear');
        return;
      }
      
      currentInput.value = '';
      currentClearBtn.style.display = 'none';
      this.errorMessage = '';
      this.dispatchEvent(new CustomEvent('filter-clear'));
      // Don't call render() here - just update the DOM directly
    });
  }
  
  setError(message) {
    this.errorMessage = message;
    const input = this.shadowRoot?.querySelector('.filter-input');
    const errorText = this.shadowRoot?.querySelector('.error-text');
    const helpText = this.shadowRoot?.querySelector('.help-text');
    
    if (input) input.classList.add('error');
    if (errorText) {
      errorText.textContent = message;
      errorText.style.display = 'block';
    }
    if (helpText) helpText.style.display = 'none';
  }
  
  clearError() {
    this.errorMessage = '';
    const input = this.shadowRoot?.querySelector('.filter-input');
    const errorText = this.shadowRoot?.querySelector('.error-text');
    const helpText = this.shadowRoot?.querySelector('.help-text');
    
    if (input) input.classList.remove('error');
    if (errorText) errorText.style.display = 'none';
    if (helpText) helpText.style.display = 'block';
  }
}

customElements.define('lucene-filter', LuceneFilter);
