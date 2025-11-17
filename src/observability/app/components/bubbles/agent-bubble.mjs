/**
 * Agent Response Bubble Component
 * Left-aligned bubble with dark background for agent responses
 */

import { BaseBubble } from './base-bubble.mjs';

export class AgentBubble extends BaseBubble {
  constructor() {
    super();
  }

  /**
   * Override to set left alignment (default)
   */
  get alignment() {
    return 'left';
  }

  /**
   * Override styles for agent-specific appearance
   */
  getStyles() {
    return `
      ${super.getStyles()}

      .bubble.left {
        background: rgba(40, 40, 40, 0.95);
        border: 1px solid rgba(80, 80, 80, 0.5);
      }

      .bubble.left:hover {
        background: rgba(45, 45, 45, 0.98);
        border: 1px solid rgba(100, 100, 100, 0.6);
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
      }

      .avatar.agent-avatar {
        background: linear-gradient(135deg, rgba(80, 80, 120, 0.8), rgba(100, 100, 140, 0.7));
        color: #fff;
      }

      .agent-info {
        display: flex;
        align-items: center;
        gap: 4px;
      }
    `;
  }

  /**
   * Render agent avatar (circle with first letter)
   */
  renderAvatar() {
    const name = this.event.agent || this.event.session_id || 'A';
    const initial = name.charAt(0).toUpperCase();
    return `<div class="avatar agent-avatar">${initial}</div>`;
  }

  /**
   * Render agent label with session ID
   */
  renderLabel() {
    const agentName = this.event.agent || 'agent';
    const sessionId = this.event.session_id || '';
    
    return `
      <div class="agent-info">
        <span class="agent-label">${this.escapeHtml(agentName)}</span>
        ${sessionId ? `<span class="session-id">#${this.escapeHtml(sessionId)}</span>` : ''}
        ${sessionId ? this.renderFilterButton('session', sessionId) : ''}
      </div>
    `;
  }

  /**
   * Render content section
   */
  renderContent() {
    const content = this.event.content || this.event.response || '';
    const isMarkdown = this.event.format === 'markdown' || content.includes('```');
    
    return `
      <div class="content ${isMarkdown ? 'markdown' : ''}">
        ${isMarkdown ? this.renderMarkdown(content) : this.escapeHtml(content)}
      </div>
      ${this.renderActions()}
    `;
  }

  /**
   * Render markdown content (basic implementation)
   */
  renderMarkdown(content) {
    // Basic markdown rendering - could use marked.js if available
    let html = this.escapeHtml(content);
    
    // Code blocks
    html = html.replace(/```(\w+)?\n([\s\S]*?)```/g, (match, lang, code) => {
      return `<pre><code class="language-${lang || 'text'}">${code.trim()}</code></pre>`;
    });
    
    // Inline code
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
    
    // Bold
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    
    // Italic
    html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    
    // Line breaks
    html = html.replace(/\n/g, '<br>');
    
    return html;
  }

  /**
   * Override styles to include markdown styling
   */
  getStyles() {
    return `
      ${super.getStyles()}

      .content.markdown code {
        background: rgba(60, 60, 60, 0.6);
        padding: 2px 6px;
        border-radius: 3px;
        font-family: 'Monaco', 'Menlo', 'Consolas', monospace;
        font-size: 13px;
      }

      .content.markdown pre {
        background: rgba(20, 20, 20, 0.8);
        border: 1px solid rgba(60, 60, 60, 0.6);
        border-radius: 6px;
        padding: 12px;
        margin: 8px 0;
        overflow-x: auto;
      }

      .content.markdown pre code {
        background: transparent;
        padding: 0;
        font-size: 13px;
        line-height: 1.4;
      }

      .content.markdown strong {
        font-weight: 600;
        color: rgba(255, 255, 255, 0.95);
      }

      .content.markdown em {
        font-style: italic;
        color: rgba(255, 255, 255, 0.85);
      }
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

customElements.define('agent-bubble', AgentBubble);
