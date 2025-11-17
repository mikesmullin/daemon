/**
 * Editable Bubble Overlay Component
 * Allows editing any event's raw YAML with validation and save/cancel/delete
 */

export class EditableBubble extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._originalEvent = null;
    this._yamlContent = '';
  }

  connectedCallback() {
    this.render();
  }

  /**
   * Get event data from attributes or properties
   */
  get event() {
    return this._originalEvent || {};
  }

  set event(value) {
    this._originalEvent = value;
    // Convert event to YAML format
    this._yamlContent = this.eventToYaml(value);
    this.render();
  }

  /**
   * Convert event object to YAML string
   * Using js-yaml if available, otherwise basic stringification
   */
  eventToYaml(event) {
    try {
      // Check if js-yaml is available globally
      if (typeof jsyaml !== 'undefined') {
        return jsyaml.dump(event, {
          indent: 2,
          lineWidth: 80,
          noRefs: true,
          sortKeys: false
        });
      }
    } catch (e) {
      console.warn('js-yaml not available, using fallback');
    }
    
    // Fallback: simple JSON with some YAML-like formatting
    return this.jsonToYamlLike(event);
  }

  /**
   * Simple JSON to YAML-like conversion (fallback)
   */
  jsonToYamlLike(obj, indent = 0) {
    const spaces = '  '.repeat(indent);
    let yaml = '';
    
    for (const [key, value] of Object.entries(obj)) {
      if (value === null || value === undefined) {
        yaml += `${spaces}${key}: null\n`;
      } else if (typeof value === 'object' && !Array.isArray(value)) {
        yaml += `${spaces}${key}:\n${this.jsonToYamlLike(value, indent + 1)}`;
      } else if (Array.isArray(value)) {
        yaml += `${spaces}${key}:\n`;
        value.forEach(item => {
          if (typeof item === 'object') {
            yaml += `${spaces}  -\n${this.jsonToYamlLike(item, indent + 2)}`;
          } else {
            yaml += `${spaces}  - ${item}\n`;
          }
        });
      } else if (typeof value === 'string') {
        // Escape if contains special chars
        const needsQuotes = value.includes('\n') || value.includes(':') || value.includes('#');
        yaml += `${spaces}${key}: ${needsQuotes ? '"' + value.replace(/"/g, '\\"') + '"' : value}\n`;
      } else {
        yaml += `${spaces}${key}: ${value}\n`;
      }
    }
    
    return yaml;
  }

  /**
   * Parse YAML to object
   */
  parseYaml(yamlStr) {
    try {
      // Check if js-yaml is available globally
      if (typeof jsyaml !== 'undefined') {
        return jsyaml.load(yamlStr);
      }
    } catch (e) {
      throw new Error(`YAML parsing error: ${e.message}`);
    }
    
    // If js-yaml not available, try JSON parsing as fallback
    throw new Error('js-yaml library not loaded. Cannot parse YAML.');
  }

  /**
   * Validate YAML syntax
   */
  validateYaml(yamlStr) {
    if (!yamlStr.trim()) {
      return { valid: true, isEmpty: true };
    }
    
    try {
      this.parseYaml(yamlStr);
      return { valid: true, isEmpty: false };
    } catch (e) {
      return { valid: false, error: e.message };
    }
  }

  /**
   * Render the editable overlay
   */
  render() {
    this.shadowRoot.innerHTML = `
      <style>
        ${this.getStyles()}
      </style>
      <div class="editable-overlay">
        <div class="editor-header">
          <span class="editor-title">Edit Event YAML</span>
          <button class="close-btn" data-action="cancel" title="Cancel (Esc)">×</button>
        </div>
        <div class="editor-body">
          <textarea 
            class="yaml-editor" 
            spellcheck="false"
            placeholder="Enter YAML content..."
          >${this.escapeHtml(this._yamlContent)}</textarea>
          <div class="validation-message"></div>
        </div>
        <div class="editor-footer">
          <div class="help-text">
            <span class="hint">💡 Leave blank to delete this event</span>
          </div>
          <div class="button-group">
            <button class="action-btn cancel-btn" data-action="cancel">Cancel</button>
            <button class="action-btn save-btn" data-action="save">Save</button>
          </div>
        </div>
      </div>
    `;

    this.attachEventListeners();
    
    // Auto-focus textarea
    requestAnimationFrame(() => {
      const textarea = this.shadowRoot.querySelector('.yaml-editor');
      if (textarea) {
        textarea.focus();
        // Move cursor to end
        textarea.selectionStart = textarea.value.length;
        textarea.selectionEnd = textarea.value.length;
      }
    });
  }

  /**
   * Get component styles
   */
  getStyles() {
    return `
      :host {
        display: block;
        width: 100%;
        max-width: 800px;
        margin: 12px 0;
      }

      .editable-overlay {
        background: rgba(30, 30, 30, 0.98);
        border: 2px solid rgba(70, 130, 230, 0.6);
        border-radius: 8px;
        overflow: hidden;
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
        animation: slideIn 0.2s ease-out;
      }

      @keyframes slideIn {
        from {
          opacity: 0;
          transform: translateY(-10px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }

      .editor-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 12px 16px;
        background: rgba(40, 40, 40, 0.95);
        border-bottom: 1px solid rgba(80, 80, 80, 0.5);
      }

      .editor-title {
        font-size: 14px;
        font-weight: 600;
        color: rgba(255, 255, 255, 0.9);
      }

      .close-btn {
        width: 28px;
        height: 28px;
        border: none;
        background: transparent;
        color: rgba(255, 255, 255, 0.6);
        font-size: 24px;
        line-height: 1;
        cursor: pointer;
        border-radius: 4px;
        transition: all 0.2s ease;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .close-btn:hover {
        background: rgba(255, 80, 80, 0.2);
        color: rgba(255, 100, 100, 0.9);
      }

      .editor-body {
        padding: 16px;
      }

      .yaml-editor {
        width: 100%;
        min-height: 200px;
        max-height: 400px;
        padding: 12px;
        background: rgba(20, 20, 20, 0.9);
        border: 1px solid rgba(60, 60, 60, 0.6);
        border-radius: 6px;
        color: rgba(255, 255, 255, 0.95);
        font-family: 'Monaco', 'Menlo', 'Consolas', 'Courier New', monospace;
        font-size: 13px;
        line-height: 1.5;
        resize: vertical;
        outline: none;
        transition: border-color 0.2s ease;
      }

      .yaml-editor:focus {
        border-color: rgba(70, 130, 230, 0.6);
      }

      .yaml-editor.invalid {
        border-color: rgba(239, 68, 68, 0.6);
      }

      /* Custom scrollbar for textarea */
      .yaml-editor::-webkit-scrollbar {
        width: 8px;
      }

      .yaml-editor::-webkit-scrollbar-track {
        background: rgba(40, 40, 40, 0.5);
        border-radius: 4px;
      }

      .yaml-editor::-webkit-scrollbar-thumb {
        background: rgba(80, 80, 80, 0.6);
        border-radius: 4px;
      }

      .yaml-editor::-webkit-scrollbar-thumb:hover {
        background: rgba(100, 100, 100, 0.7);
      }

      .validation-message {
        min-height: 20px;
        margin-top: 8px;
        font-size: 12px;
        line-height: 1.4;
      }

      .validation-message.error {
        color: rgba(239, 68, 68, 0.9);
      }

      .validation-message.success {
        color: rgba(16, 185, 129, 0.9);
      }

      .validation-message.warning {
        color: rgba(245, 158, 11, 0.9);
      }

      .editor-footer {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 12px 16px;
        background: rgba(40, 40, 40, 0.95);
        border-top: 1px solid rgba(80, 80, 80, 0.5);
      }

      .help-text {
        font-size: 12px;
        color: rgba(255, 255, 255, 0.5);
      }

      .hint {
        font-style: italic;
      }

      .button-group {
        display: flex;
        gap: 8px;
      }

      .action-btn {
        padding: 8px 16px;
        border: none;
        border-radius: 6px;
        font-size: 13px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.2s ease;
        outline: none;
      }

      .cancel-btn {
        background: rgba(60, 60, 60, 0.8);
        color: rgba(255, 255, 255, 0.8);
      }

      .cancel-btn:hover {
        background: rgba(80, 80, 80, 0.9);
        color: rgba(255, 255, 255, 0.95);
      }

      .save-btn {
        background: linear-gradient(135deg, rgba(30, 80, 180, 0.9), rgba(50, 120, 220, 0.85));
        color: rgba(255, 255, 255, 0.95);
      }

      .save-btn:hover {
        background: linear-gradient(135deg, rgba(40, 90, 190, 0.95), rgba(60, 130, 230, 0.9));
        box-shadow: 0 2px 8px rgba(50, 120, 220, 0.4);
      }

      .save-btn:disabled {
        background: rgba(60, 60, 60, 0.5);
        color: rgba(255, 255, 255, 0.4);
        cursor: not-allowed;
      }
    `;
  }

  /**
   * Attach event listeners
   */
  attachEventListeners() {
    const textarea = this.shadowRoot.querySelector('.yaml-editor');
    const saveBtn = this.shadowRoot.querySelector('[data-action="save"]');
    const cancelBtn = this.shadowRoot.querySelectorAll('[data-action="cancel"]');
    const validationMsg = this.shadowRoot.querySelector('.validation-message');

    // Real-time validation as user types
    if (textarea) {
      textarea.addEventListener('input', (e) => {
        const yamlStr = e.target.value;
        const validation = this.validateYaml(yamlStr);
        
        if (!validation.valid) {
          textarea.classList.add('invalid');
          validationMsg.className = 'validation-message error';
          validationMsg.textContent = `⚠ ${validation.error}`;
          saveBtn.disabled = true;
        } else if (validation.isEmpty) {
          textarea.classList.remove('invalid');
          validationMsg.className = 'validation-message warning';
          validationMsg.textContent = '⚠ Saving blank YAML will delete this event';
          saveBtn.disabled = false;
        } else {
          textarea.classList.remove('invalid');
          validationMsg.className = 'validation-message success';
          validationMsg.textContent = '✓ Valid YAML';
          saveBtn.disabled = false;
        }
      });

      // Handle Esc key to cancel
      textarea.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          this.handleCancel();
        }
        // Ctrl+Enter or Cmd+Enter to save
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
          e.preventDefault();
          this.handleSave();
        }
      });
    }

    // Save button
    if (saveBtn) {
      saveBtn.addEventListener('click', () => this.handleSave());
    }

    // Cancel buttons
    cancelBtn.forEach(btn => {
      btn.addEventListener('click', () => this.handleCancel());
    });
  }

  /**
   * Handle save action
   */
  handleSave() {
    const textarea = this.shadowRoot.querySelector('.yaml-editor');
    const yamlStr = textarea.value.trim();
    
    // Validate before saving
    const validation = this.validateYaml(yamlStr);
    
    if (!validation.valid) {
      // Show error and don't save
      return;
    }
    
    let updatedEvent = null;
    let isDelete = false;
    
    if (validation.isEmpty) {
      // Blank YAML = delete request
      isDelete = true;
    } else {
      // Parse YAML to object
      try {
        updatedEvent = this.parseYaml(yamlStr);
        
        // Preserve critical fields if missing
        if (!updatedEvent.session_id && this._originalEvent.session_id) {
          updatedEvent.session_id = this._originalEvent.session_id;
        }
        if (!updatedEvent.timestamp && this._originalEvent.timestamp) {
          updatedEvent.timestamp = this._originalEvent.timestamp;
        }
      } catch (e) {
        console.error('Failed to parse YAML:', e);
        return;
      }
    }
    
    // Emit save event
    this.dispatchEvent(new CustomEvent('save-event', {
      bubbles: true,
      composed: true,
      detail: {
        originalEvent: this._originalEvent,
        updatedEvent: updatedEvent,
        isDelete: isDelete,
        yaml: yamlStr
      }
    }));
  }

  /**
   * Handle cancel action
   */
  handleCancel() {
    this.dispatchEvent(new CustomEvent('cancel-edit', {
      bubbles: true,
      composed: true,
      detail: {
        event: this._originalEvent
      }
    }));
  }

  /**
   * Escape HTML to prevent XSS
   */
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

customElements.define('editable-bubble', EditableBubble);
