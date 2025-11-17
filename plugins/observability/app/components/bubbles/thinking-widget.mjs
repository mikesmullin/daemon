/**
 * Thinking Widget Component
 * Displays agent thoughts in a subtle, expandable format
 */

import { BaseBubble } from './base-bubble.mjs';

export class ThinkingWidget extends BaseBubble {
  constructor() {
    super();
  }

  /**
   * Always left-aligned for agent thoughts
   */
  get alignment() {
    return 'left';
  }

  /**
   * Extended styles for thinking widget
   */
  getStyles() {
    return `
      ${super.getStyles()}

      .bubble.left {
        background: rgba(50, 50, 60, 0.4);
        border: 1px solid rgba(90, 90, 110, 0.3);
        opacity: 0.85;
      }

      .bubble.left:hover {
        opacity: 1;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
      }

      .thinking-header {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 10px;
        color: rgba(255, 255, 255, 0.5);
        font-size: 12px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }

      .brain-icon {
        font-size: 16px;
      }

      .thinking-content {
        color: rgba(255, 255, 255, 0.75);
        font-size: 13px;
        line-height: 1.6;
        font-style: italic;
      }

      .thought-text {
        background: rgba(30, 30, 40, 0.4);
        padding: 10px;
        border-radius: 4px;
        border-left: 2px solid rgba(120, 120, 150, 0.4);
        white-space: pre-wrap;
        word-break: break-word;
        max-height: 150px;
        overflow: hidden;
        transition: max-height 0.3s ease;
      }

      .thought-text.expanded {
        max-height: none;
        overflow: visible;
      }

      .expand-btn {
        margin-top: 8px;
        padding: 4px 10px;
        background: rgba(60, 60, 70, 0.5);
        border: 1px solid rgba(80, 80, 90, 0.4);
        border-radius: 4px;
        color: rgba(255, 255, 255, 0.6);
        cursor: pointer;
        font-size: 11px;
        transition: all 0.2s ease;
      }

      .expand-btn:hover {
        background: rgba(70, 70, 80, 0.7);
        color: rgba(255, 255, 255, 0.8);
      }

      .thought-metadata {
        margin-top: 8px;
        font-size: 11px;
        color: rgba(255, 255, 255, 0.4);
      }

      .agent-name {
        color: rgba(255, 255, 255, 0.6);
        font-weight: 500;
      }

      .session-id {
        color: rgba(255, 255, 255, 0.4);
      }
    `;
  }

  /**
   * Render header
   */
  renderHeader() {
    const agentName = this.event.agent || 'Agent';
    const sessionId = this.event.session_id ? `#${this.event.session_id}` : '';

    return `
      <div class="header">
        ${this.renderStatusIndicator()}
        <span class="brain-icon">💭</span>
        <div class="thinking-header">
          <span>thinking</span>
          ${this.renderInlineFilter()}
        </div>
      </div>
    `;
  }

  /**
   * Render inline filter button
   */
  renderInlineFilter() {
    return `<button class="action-btn filter inline-filter" 
                    data-field="type" 
                    data-value="thinking" 
                    title="Filter out thinking events">−</button>`;
  }

  /**
   * Render content
   */
  renderContent() {
    const thought = this.event.thought || this.event.content || this.event.text || 'No thought content';
    const agentName = this.event.agent || 'Agent';
    const sessionId = this.event.session_id;
    
    // Check if content is long enough to need expansion
    const needsExpansion = thought.length > 200;
    const thoughtId = `thought-${Math.random().toString(36).substr(2, 9)}`;

    return `
      <div class="content thinking-content">
        <div class="thought-text ${needsExpansion ? '' : 'expanded'}" id="${thoughtId}">
          ${this.escapeHtml(thought)}
        </div>
        ${needsExpansion ? `<button class="expand-btn" data-target="${thoughtId}">show more</button>` : ''}
        <div class="thought-metadata">
          <span class="agent-name">${this.escapeHtml(agentName)}</span>
          ${sessionId ? `<span class="session-id">#${this.escapeHtml(String(sessionId))}</span>` : ''}
        </div>
      </div>
      ${this.renderActions()}
    `;
  }

  /**
   * Get status - thinking bubbles typically don't have status indicators
   */
  getStatus() {
    // Return null to hide status indicator for thinking events
    return null;
  }

  /**
   * Attach event listeners
   */
  attachEventListeners() {
    super.attachEventListeners();

    // Handle inline filter button
    const filterBtn = this.shadowRoot.querySelector('.inline-filter');
    if (filterBtn) {
      filterBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const field = filterBtn.getAttribute('data-field');
        const value = filterBtn.getAttribute('data-value');
        this.handleFieldFilter(field, value);
      });
    }

    // Handle expand button
    const expandBtn = this.shadowRoot.querySelector('.expand-btn');
    if (expandBtn) {
      expandBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const targetId = expandBtn.getAttribute('data-target');
        const target = this.shadowRoot.getElementById(targetId);
        if (target) {
          target.classList.toggle('expanded');
          expandBtn.textContent = target.classList.contains('expanded') ? 'show less' : 'show more';
        }
      });
    }
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
}

customElements.define('thinking-widget', ThinkingWidget);
