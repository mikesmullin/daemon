/**
 * User Message Bubble Component
 * Right-aligned bubble with blue gradient background for user messages
 */

import { BaseBubble } from './base-bubble.mjs';

export class UserBubble extends BaseBubble {
  constructor() {
    super();
  }

  /**
   * Override to set right alignment
   */
  get alignment() {
    return 'right';
  }

  /**
   * Override styles for user-specific appearance
   */
  getStyles() {
    return `
      ${super.getStyles()}

      .bubble.right {
        background: linear-gradient(135deg, rgba(30, 80, 180, 0.9), rgba(50, 120, 220, 0.85));
        border: 1px solid rgba(70, 130, 230, 0.6);
      }

      .bubble.right:hover {
        background: linear-gradient(135deg, rgba(40, 90, 190, 0.95), rgba(60, 130, 230, 0.9));
        box-shadow: 0 4px 16px rgba(50, 120, 220, 0.4);
      }

      .avatar.user-avatar {
        background: linear-gradient(135deg, rgba(50, 100, 200, 0.8), rgba(70, 140, 240, 0.7));
      }
    `;
  }

  /**
   * Render user avatar (person icon)
   */
  renderAvatar() {
    return `<div class="avatar user-avatar">👤</div>`;
  }

  /**
   * Render user label
   */
  renderLabel() {
    const name = this.event.user || 'user';
    return `
      <span class="user-label">${this.escapeHtml(name)}</span>
      ${this.renderFilterButton('user', name)}
    `;
  }

  /**
   * Render content section
   */
  renderContent() {
    const content = this.event.content || this.event.prompt || '';
    return `
      <div class="content">
        ${this.escapeHtml(content)}
      </div>
      ${this.renderActions()}
    `;
  }

  /**
   * Render filter button for specific field
   */
  renderFilterButton(field, value) {
    return `<button class="action-btn filter inline-filter" 
                    data-field="${field}" 
                    data-value="${this.escapeHtml(value)}" 
                    title="Filter out ${field}:${value}">−</button>`;
  }

  /**
   * Attach event listeners
   */
  attachEventListeners() {
    super.attachEventListeners();

    // Handle inline filter buttons
    const inlineFilterBtns = this.shadowRoot.querySelectorAll('.inline-filter');
    inlineFilterBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const field = btn.getAttribute('data-field');
        const value = btn.getAttribute('data-value');
        this.handleFieldFilter(field, value);
      });
    });
  }

  /**
   * Handle field-specific filter
   */
  handleFieldFilter(field, value) {
    this.dispatchEvent(new CustomEvent('add-filter', {
      bubbles: true,
      composed: true,
      detail: { field, value }
    }));
  }

  /**
   * Override filter to use session-based filtering
   */
  handleFilter() {
    const sessionId = this.event.session_id;
    if (sessionId) {
      this.dispatchEvent(new CustomEvent('add-filter', {
        bubbles: true,
        composed: true,
        detail: { field: 'session', value: sessionId }
      }));
    }
  }
}

customElements.define('user-bubble', UserBubble);
