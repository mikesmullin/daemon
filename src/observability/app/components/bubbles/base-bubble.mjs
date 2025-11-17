/**
 * Base Bubble Component
 * Shared functionality for all event bubble types
 */

export class BaseBubble extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._editMode = false;
  }

  connectedCallback() {
    this.render();
  }

  /**
   * Get event data from attributes or properties
   */
  get event() {
    return this._event || {};
  }

  set event(value) {
    this._event = value;
    this.render();
  }

  /**
   * Get alignment (left or right)
   */
  get alignment() {
    return this.getAttribute('alignment') || 'left';
  }

  /**
   * Render the bubble (to be overridden by subclasses)
   */
  render() {
    // Check if in edit mode
    if (this._editMode) {
      this.renderEditMode();
      return;
    }

    // Default implementation - subclasses should override
    this.shadowRoot.innerHTML = `
      <style>
        ${this.getStyles()}
      </style>
      <div class="bubble ${this.alignment}">
        ${this.renderHeader()}
        ${this.renderContent()}
        ${this.renderTimestamp()}
      </div>
    `;

    this.attachEventListeners();
  }

  /**
   * Get base styles (can be extended by subclasses)
   */
  getStyles() {
    return `
      :host {
        display: block;
        margin-bottom: 12px;
      }

      .bubble {
        position: relative;
        padding: 12px 16px;
        border-radius: 8px;
        max-width: 80%;
        word-wrap: break-word;
        transition: all 0.2s ease;
      }

      .bubble.left {
        margin-right: auto;
        background: rgba(40, 40, 40, 0.95);
        border: 1px solid rgba(80, 80, 80, 0.5);
      }

      .bubble.right {
        margin-left: auto;
        background: linear-gradient(135deg, rgba(30, 80, 180, 0.9), rgba(50, 120, 220, 0.85));
        border: 1px solid rgba(70, 130, 230, 0.6);
      }

      .bubble:hover {
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
      }

      .header {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 8px;
        font-size: 13px;
        color: rgba(255, 255, 255, 0.7);
      }

      .avatar {
        width: 24px;
        height: 24px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 12px;
        font-weight: bold;
        background: rgba(100, 100, 100, 0.5);
        color: #fff;
      }

      .status-indicator {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        display: inline-block;
      }

      .status-indicator.working {
        background: #f59e0b;
        animation: pulse 1.5s ease-in-out infinite;
      }

      .status-indicator.success {
        background: #10b981;
      }

      .status-indicator.fail {
        background: #ef4444;
      }

      .status-indicator.online {
        background: #10b981;
      }

      @keyframes pulse {
        0%, 100% {
          opacity: 1;
        }
        50% {
          opacity: 0.5;
        }
      }

      .event-icon {
        font-size: 16px;
      }

      .content {
        color: rgba(255, 255, 255, 0.95);
        font-size: 14px;
        line-height: 1.5;
      }

      .timestamp {
        position: absolute;
        bottom: -20px;
        right: 8px;
        font-size: 11px;
        color: rgba(255, 255, 255, 0.4);
        opacity: 0;
        transition: opacity 0.2s ease;
        pointer-events: none;
      }

      .bubble:hover .timestamp {
        opacity: 1;
      }

      .actions {
        position: absolute;
        top: 8px;
        right: 8px;
        display: flex;
        gap: 6px;
        opacity: 0;
        transition: opacity 0.2s ease;
      }

      .bubble:hover .actions {
        opacity: 1;
      }

      .action-btn {
        width: 20px;
        height: 20px;
        border: none;
        background: rgba(60, 60, 60, 0.8);
        color: rgba(255, 255, 255, 0.7);
        border-radius: 4px;
        cursor: pointer;
        font-size: 11px;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s ease;
      }

      .action-btn:hover {
        background: rgba(80, 80, 80, 0.9);
        color: #fff;
      }

      .action-btn.edit {
        font-family: monospace;
      }

      .action-btn.filter {
        font-weight: bold;
      }

      .user-label,
      .agent-label {
        font-weight: 500;
        color: rgba(255, 255, 255, 0.9);
      }

      .session-id {
        color: rgba(255, 255, 255, 0.5);
        font-size: 12px;
      }
    `;
  }

  /**
   * Render header section
   */
  renderHeader() {
    return `
      <div class="header">
        ${this.renderStatusIndicator()}
        ${this.renderAvatar()}
        ${this.renderLabel()}
      </div>
    `;
  }

  /**
   * Render status indicator
   */
  renderStatusIndicator() {
    const status = this.getStatus();
    if (!status) return '';
    return `<span class="status-indicator ${status}"></span>`;
  }

  /**
   * Render avatar
   */
  renderAvatar() {
    const name = this.getName();
    const initial = name ? name.charAt(0).toUpperCase() : '?';
    return `<div class="avatar">${initial}</div>`;
  }

  /**
   * Render label (name, session ID, etc.)
   */
  renderLabel() {
    return `<span class="user-label">Unknown</span>`;
  }

  /**
   * Render content section (to be overridden)
   */
  renderContent() {
    return `<div class="content">No content</div>`;
  }

  /**
   * Render timestamp
   */
  renderTimestamp() {
    const timestamp = this.event.timestamp || new Date().toISOString();
    const formatted = this.formatTimestamp(timestamp);
    return `<div class="timestamp">${formatted}</div>`;
  }

  /**
   * Format timestamp as HH:MM:SS.mmm
   */
  formatTimestamp(timestamp) {
    const date = new Date(timestamp);
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    const ms = String(date.getMilliseconds()).padStart(3, '0');
    return `${hours}:${minutes}:${seconds}.${ms}`;
  }

  /**
   * Get status from event
   */
  getStatus() {
    if (this.event.status) return this.event.status;
    if (this.event.success === true) return 'success';
    if (this.event.success === false) return 'fail';
    return null;
  }

  /**
   * Get name from event
   */
  getName() {
    return this.event.agent || this.event.user || 'Unknown';
  }

  /**
   * Render action buttons
   */
  renderActions() {
    return `
      <div class="actions">
        <button class="action-btn filter" data-action="filter" title="Add to filter">−</button>
        <button class="action-btn edit" data-action="edit" title="Edit YAML">✎</button>
      </div>
    `;
  }

  /**
   * Attach event listeners
   */
  attachEventListeners() {
    const filterBtn = this.shadowRoot.querySelector('[data-action="filter"]');
    const editBtn = this.shadowRoot.querySelector('[data-action="edit"]');

    if (filterBtn) {
      filterBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.handleFilter();
      });
    }

    if (editBtn) {
      editBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.handleEdit();
      });
    }
  }

  /**
   * Handle filter button click
   */
  handleFilter() {
    this.dispatchEvent(new CustomEvent('filter-event', {
      bubbles: true,
      composed: true,
      detail: { event: this.event }
    }));
  }

  /**
   * Render edit mode with editable-bubble component
   */
  renderEditMode() {
    // Import editable-bubble dynamically if not already loaded
    if (!customElements.get('editable-bubble')) {
      import('./editable-bubble.mjs').then(() => {
        this.renderEditMode(); // Re-render once loaded
      });
      return;
    }

    this.shadowRoot.innerHTML = `
      <style>
        ${this.getStyles()}
        :host {
          display: block;
          width: 100%;
        }
      </style>
      <editable-bubble></editable-bubble>
    `;

    const editableBubble = this.shadowRoot.querySelector('editable-bubble');
    if (editableBubble) {
      editableBubble.event = this.event;

      // Listen for save event
      editableBubble.addEventListener('save-event', (e) => {
        // Forward the event up
        this.dispatchEvent(new CustomEvent('save-event', {
          bubbles: true,
          composed: true,
          detail: e.detail
        }));
        
        // Exit edit mode
        this._editMode = false;
        this.render();
      });

      // Listen for cancel event
      editableBubble.addEventListener('cancel-edit', (e) => {
        // Exit edit mode
        this._editMode = false;
        this.render();
      });
    }
  }

  /**
   * Handle edit button click
   */
  handleEdit() {
    this._editMode = true;
    this.render();
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

customElements.define('base-bubble', BaseBubble);
