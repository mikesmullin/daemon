// Template Editor Component
class TemplateEditor extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    
    this.templates = [];
    this.selectedTemplate = null;
    this.templateContent = '';
    this.searchQuery = '';
    this.isDirty = false;
  }

  connectedCallback() {
    this.render();
    this.loadTemplates();
  }

  loadTemplates() {
    // Request template list from backend
    this.dispatchEvent(new CustomEvent('template:list-request', { 
      bubbles: true,
      composed: true 
    }));
  }

  setTemplates(templates) {
    this.templates = templates || [];
    this.render();
  }

  selectTemplate(template) {
    if (this.isDirty) {
      if (!confirm('You have unsaved changes. Discard them?')) {
        return;
      }
    }

    this.selectedTemplate = template;
    this.isDirty = false;
    
    // Request template content from backend
    this.dispatchEvent(new CustomEvent('template:get-request', { 
      bubbles: true,
      composed: true,
      detail: { name: template.name }
    }));
  }

  setTemplateContent(content) {
    this.templateContent = content || '';
    this.isDirty = false;
    this.render();
    
    // Focus the editor after loading content
    this.shadowRoot.querySelector('.editor-textarea')?.focus();
  }

  handleEditorChange(newContent) {
    this.templateContent = newContent;
    this.isDirty = true;
    this.clearError();
  }

  async handleSave() {
    if (!this.selectedTemplate) {
      this.showError('No template selected');
      return;
    }

    // Validate YAML
    try {
      window.jsyaml.load(this.templateContent);
    } catch (err) {
      this.showError(`Invalid YAML: ${err.message}`);
      return;
    }

    // Send save request to backend
    this.dispatchEvent(new CustomEvent('template:save-request', { 
      bubbles: true,
      composed: true,
      detail: { 
        name: this.selectedTemplate.name,
        yaml: this.templateContent 
      }
    }));

    this.isDirty = false;
    this.showSuccess('Template saved successfully');
  }

  handleCreate() {
    const name = prompt('Enter new template name:');
    if (!name) return;

    // Validate name
    if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
      alert('Invalid template name. Use only letters, numbers, hyphens, and underscores.');
      return;
    }

    // Check if template already exists
    if (this.templates.find(t => t.name === name)) {
      alert('A template with this name already exists.');
      return;
    }

    // Create blank template
    const blankTemplate = `metadata:
  name: ${name}
  description: New agent template

system: |
  You are a helpful AI assistant.

context: []
`;

    // Send create request to backend
    this.dispatchEvent(new CustomEvent('template:save-request', { 
      bubbles: true,
      composed: true,
      detail: { 
        name: name,
        yaml: blankTemplate 
      }
    }));

    // Add to templates list and select it
    const newTemplate = { name, path: `agents/templates/${name}.yaml` };
    this.templates.push(newTemplate);
    this.selectedTemplate = newTemplate;
    this.templateContent = blankTemplate;
    this.isDirty = false;
    
    this.render();
  }

  handleDelete() {
    if (!this.selectedTemplate) {
      this.showError('No template selected');
      return;
    }

    const confirmMsg = `Are you sure you want to delete template "${this.selectedTemplate.name}"?`;
    if (!confirm(confirmMsg)) {
      return;
    }

    // Send delete request to backend
    this.dispatchEvent(new CustomEvent('template:delete-request', { 
      bubbles: true,
      composed: true,
      detail: { name: this.selectedTemplate.name }
    }));

    // Remove from templates list
    this.templates = this.templates.filter(t => t.name !== this.selectedTemplate.name);
    this.selectedTemplate = null;
    this.templateContent = '';
    this.isDirty = false;
    
    this.render();
  }

  handleSearch(query) {
    this.searchQuery = query.toLowerCase();
    this.render();
  }

  showError(message) {
    const errorEl = this.shadowRoot.querySelector('.error-message');
    if (errorEl) {
      errorEl.textContent = message;
      errorEl.style.display = 'block';
    }
  }

  showSuccess(message) {
    const successEl = this.shadowRoot.querySelector('.success-message');
    if (successEl) {
      successEl.textContent = message;
      successEl.style.display = 'block';
      
      // Auto-hide after 3 seconds
      setTimeout(() => {
        successEl.style.display = 'none';
      }, 3000);
    }
  }

  clearError() {
    const errorEl = this.shadowRoot.querySelector('.error-message');
    if (errorEl) {
      errorEl.style.display = 'none';
    }
  }

  get filteredTemplates() {
    if (!this.searchQuery) {
      return this.templates;
    }
    
    return this.templates.filter(t => 
      t.name.toLowerCase().includes(this.searchQuery)
    );
  }

  render() {
    const filtered = this.filteredTemplates;

    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: flex;
          height: 100%;
          background: #0a0a0a;
        }
        
        .sidebar {
          width: 280px;
          border-right: 1px solid #333;
          display: flex;
          flex-direction: column;
          background: #0f0f0f;
        }
        
        .sidebar-header {
          padding: 1rem;
          border-bottom: 1px solid #333;
          background: #1a1a1a;
        }
        
        .search-box {
          width: 100%;
          padding: 0.5rem;
          background: #0a0a0a;
          border: 1px solid #333;
          border-radius: 4px;
          color: #e0e0e0;
          font-size: 0.875rem;
          font-family: 'Inter', sans-serif;
        }
        
        .search-box:focus {
          outline: none;
          border-color: #00d4ff;
        }
        
        .template-list {
          flex: 1;
          overflow-y: auto;
          padding: 0.5rem;
        }
        
        .template-item {
          padding: 0.75rem;
          margin-bottom: 0.25rem;
          border-radius: 4px;
          cursor: pointer;
          font-size: 0.875rem;
          color: #e0e0e0;
          transition: all 0.2s;
        }
        
        .template-item:hover {
          background: #1a1a1a;
        }
        
        .template-item.selected {
          background: #00d4ff22;
          color: #00d4ff;
        }
        
        .template-item .name {
          font-weight: 500;
        }
        
        .template-item .path {
          font-size: 0.75rem;
          color: #666;
          margin-top: 0.25rem;
        }
        
        .sidebar-footer {
          padding: 1rem;
          border-top: 1px solid #333;
        }
        
        .create-btn {
          width: 100%;
          padding: 0.5rem;
          background: #00d4ff;
          color: #000;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          font-weight: 600;
          font-size: 0.875rem;
          transition: all 0.2s;
        }
        
        .create-btn:hover {
          background: #00b8e6;
        }
        
        .editor {
          flex: 1;
          display: flex;
          flex-direction: column;
        }
        
        .editor-header {
          padding: 1rem;
          border-bottom: 1px solid #333;
          display: flex;
          align-items: center;
          justify-content: space-between;
          background: #1a1a1a;
        }
        
        .editor-title {
          font-size: 1rem;
          font-weight: 600;
          color: #e0e0e0;
        }
        
        .editor-actions {
          display: flex;
          gap: 0.5rem;
        }
        
        .btn {
          padding: 0.5rem 1rem;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          font-size: 0.875rem;
          font-weight: 500;
          transition: all 0.2s;
        }
        
        .btn-primary {
          background: #00d4ff;
          color: #000;
        }
        
        .btn-primary:hover {
          background: #00b8e6;
        }
        
        .btn-primary:disabled {
          background: #333;
          color: #666;
          cursor: not-allowed;
        }
        
        .btn-danger {
          background: #ff4444;
          color: #fff;
        }
        
        .btn-danger:hover {
          background: #cc0000;
        }
        
        .editor-content {
          flex: 1;
          padding: 1rem;
          overflow: hidden;
          display: flex;
          flex-direction: column;
        }
        
        .editor-textarea {
          flex: 1;
          width: 100%;
          background: #0a0a0a;
          border: 1px solid #333;
          border-radius: 4px;
          color: #e0e0e0;
          font-family: 'JetBrains Mono', monospace;
          font-size: 0.875rem;
          line-height: 1.6;
          padding: 1rem;
          resize: none;
        }
        
        .editor-textarea:focus {
          outline: none;
          border-color: #00d4ff;
        }
        
        .empty-state {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #666;
          font-size: 0.875rem;
        }
        
        .messages {
          padding: 0.5rem 1rem;
          font-size: 0.875rem;
        }
        
        .error-message {
          display: none;
          padding: 0.75rem;
          background: #ff444422;
          border: 1px solid #ff4444;
          border-radius: 4px;
          color: #ff6666;
          margin-bottom: 0.5rem;
        }
        
        .success-message {
          display: none;
          padding: 0.75rem;
          background: #00ff0022;
          border: 1px solid #00ff00;
          border-radius: 4px;
          color: #00ff00;
          margin-bottom: 0.5rem;
        }
        
        .no-templates {
          padding: 2rem;
          text-align: center;
          color: #666;
          font-size: 0.875rem;
        }
      </style>
      
      <div class="sidebar">
        <div class="sidebar-header">
          <input 
            type="text" 
            class="search-box" 
            placeholder="Search templates..."
            value="${this.searchQuery}"
          />
        </div>
        
        <div class="template-list">
          ${filtered.length === 0 ? `
            <div class="no-templates">
              ${this.templates.length === 0 ? 'No templates found.<br>Click below to create one.' : 'No matching templates.'}
            </div>
          ` : filtered.map(tmpl => `
            <div 
              class="template-item ${this.selectedTemplate?.name === tmpl.name ? 'selected' : ''}"
              data-name="${tmpl.name}"
            >
              <div class="name">${tmpl.name}</div>
              <div class="path">${tmpl.path || ''}</div>
            </div>
          `).join('')}
        </div>
        
        <div class="sidebar-footer">
          <button class="create-btn">+ Create Template</button>
        </div>
      </div>
      
      <div class="editor">
        <div class="editor-header">
          <div class="editor-title">
            ${this.selectedTemplate ? this.selectedTemplate.name : 'No template selected'}
            ${this.isDirty ? ' *' : ''}
          </div>
          
          <div class="editor-actions">
            <button 
              class="btn btn-danger" 
              ${!this.selectedTemplate ? 'disabled' : ''}
              data-action="delete"
            >
              Delete
            </button>
            <button 
              class="btn btn-primary" 
              ${!this.selectedTemplate || !this.isDirty ? 'disabled' : ''}
              data-action="save"
            >
              Save
            </button>
          </div>
        </div>
        
        <div class="editor-content">
          <div class="messages">
            <div class="error-message"></div>
            <div class="success-message"></div>
          </div>
          
          ${this.selectedTemplate ? `
            <textarea class="editor-textarea" spellcheck="false">${this.templateContent}</textarea>
          ` : `
            <div class="empty-state">
              Select a template from the sidebar to edit it
            </div>
          `}
        </div>
      </div>
    `;

    // Event listeners
    const searchBox = this.shadowRoot.querySelector('.search-box');
    searchBox?.addEventListener('input', (e) => {
      this.handleSearch(e.target.value);
    });

    this.shadowRoot.querySelectorAll('.template-item').forEach(item => {
      item.addEventListener('click', () => {
        const name = item.dataset.name;
        const template = this.templates.find(t => t.name === name);
        if (template) {
          this.selectTemplate(template);
        }
      });
    });

    this.shadowRoot.querySelector('.create-btn')?.addEventListener('click', () => {
      this.handleCreate();
    });

    const textarea = this.shadowRoot.querySelector('.editor-textarea');
    textarea?.addEventListener('input', (e) => {
      this.handleEditorChange(e.target.value);
    });

    this.shadowRoot.querySelector('[data-action="save"]')?.addEventListener('click', () => {
      this.handleSave();
    });

    this.shadowRoot.querySelector('[data-action="delete"]')?.addEventListener('click', () => {
      this.handleDelete();
    });
  }
}

customElements.define('template-editor', TemplateEditor);
