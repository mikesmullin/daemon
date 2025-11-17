/**
 * Create Agent Widget Component
 * Displays agent template and prompt with truncation
 */

import { ToolCallBase } from './tool-call-base.mjs';

export class CreateAgentWidget extends ToolCallBase {
  constructor() {
    super();
  }

  /**
   * Extended styles for create_agent widget
   */
  getStyles() {
    return `
      ${super.getStyles()}

      .template-display {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 12px;
        padding: 8px 12px;
        background: rgba(60, 60, 120, 0.2);
        border: 1px solid rgba(80, 80, 140, 0.4);
        border-radius: 4px;
      }

      .template-icon {
        font-size: 18px;
      }

      .template-name {
        font-family: 'Monaco', 'Menlo', 'Consolas', monospace;
        font-size: 14px;
        color: rgba(100, 150, 255, 0.9);
        font-weight: 500;
      }

      .at-symbol {
        color: rgba(100, 150, 255, 0.6);
      }

      .prompt-container {
        margin-top: 12px;
      }

      .prompt-label {
        font-size: 11px;
        color: rgba(255, 255, 255, 0.5);
        text-transform: uppercase;
        letter-spacing: 0.5px;
        margin-bottom: 6px;
      }

      .prompt-display {
        background: rgba(30, 30, 30, 0.8);
        border: 1px solid rgba(60, 60, 60, 0.5);
        border-radius: 4px;
        padding: 12px;
        color: rgba(255, 255, 255, 0.9);
        font-size: 13px;
        line-height: 1.5;
        white-space: pre-wrap;
        word-break: break-word;
        overflow: hidden;
        max-height: 200px;
      }

      .prompt-display.collapsed {
        max-height: 100px;
        position: relative;
      }

      .prompt-display.collapsed::after {
        content: '';
        position: absolute;
        bottom: 0;
        left: 0;
        right: 0;
        height: 40px;
        background: linear-gradient(to bottom, transparent, rgba(30, 30, 30, 0.95));
        pointer-events: none;
      }

      .session-link {
        margin-top: 12px;
        padding: 8px 12px;
        background: rgba(50, 120, 80, 0.2);
        border: 1px solid rgba(70, 140, 100, 0.4);
        border-left: 3px solid rgba(100, 200, 150, 0.6);
        border-radius: 4px;
        font-size: 12px;
      }

      .session-link-label {
        color: rgba(255, 255, 255, 0.5);
        margin-right: 8px;
      }

      .session-link-value {
        color: rgba(100, 200, 150, 0.9);
        font-family: 'Monaco', 'Menlo', 'Consolas', monospace;
        cursor: pointer;
        text-decoration: underline;
      }

      .session-link-value:hover {
        color: rgba(120, 220, 170, 1);
      }

      .agent-labels {
        margin-top: 8px;
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
      }

      .agent-label {
        padding: 3px 8px;
        background: rgba(60, 60, 80, 0.4);
        border: 1px solid rgba(80, 80, 100, 0.5);
        border-radius: 3px;
        font-size: 11px;
        color: rgba(200, 200, 220, 0.9);
        font-family: 'Monaco', 'Menlo', 'Consolas', monospace;
      }
    `;
  }

  /**
   * Render content
   */
  renderContent() {
    const template = this.event.template || this.event.params?.template || this.event.params?.agent || '';
    const prompt = this.event.prompt || this.event.params?.prompt || '';
    const sessionId = this.event.created_session_id || this.event.result?.session_id;
    const labels = this.event.labels || this.event.params?.labels || [];
    const shouldCollapse = prompt.length > 200;

    return `
      <div class="content">
        ${this.renderTemplate(template)}
        ${prompt ? this.renderPrompt(prompt, shouldCollapse) : ''}
        ${labels && labels.length > 0 ? this.renderLabels(labels) : ''}
        ${sessionId ? this.renderSessionLink(sessionId) : ''}
      </div>
      ${this.renderActions()}
    `;
  }

  /**
   * Render template display
   */
  renderTemplate(template) {
    // Remove @ prefix if present
    const cleanTemplate = template.startsWith('@') ? template.substring(1) : template;
    
    return `
      <div class="template-display">
        <span class="template-icon">🤖</span>
        <span class="template-name">
          <span class="at-symbol">@</span>${this.escapeHtml(cleanTemplate)}
        </span>
        ${this.renderParamFilter('template', cleanTemplate)}
      </div>
    `;
  }

  /**
   * Render prompt display
   */
  renderPrompt(prompt, shouldCollapse) {
    const id = `prompt-${Math.random().toString(36).substr(2, 9)}`;
    const collapsedClass = shouldCollapse ? 'collapsed' : '';

    return `
      <div class="prompt-container">
        <div class="prompt-label">Prompt:</div>
        <div class="prompt-display ${collapsedClass}" id="${id}">
${this.escapeHtml(prompt)}</div>
        ${shouldCollapse ? `<button class="show-more-btn" data-target="${id}">show more</button>` : ''}
      </div>
    `;
  }

  /**
   * Render labels
   */
  renderLabels(labels) {
    const labelArray = Array.isArray(labels) ? labels : [labels];
    
    return `
      <div class="agent-labels">
        ${labelArray.map(label => `
          <span class="agent-label">
            ${this.escapeHtml(label)}
            ${this.renderParamFilter('label', label)}
          </span>
        `).join('')}
      </div>
    `;
  }

  /**
   * Render session link (when agent is created)
   */
  renderSessionLink(sessionId) {
    return `
      <div class="session-link">
        <span class="session-link-label">Created session:</span>
        <span class="session-link-value" data-session-id="${this.escapeHtml(sessionId)}">
          #${this.escapeHtml(sessionId)}
        </span>
        ${this.renderParamFilter('session', sessionId)}
      </div>
    `;
  }

  /**
   * Attach event listeners
   */
  attachEventListeners() {
    super.attachEventListeners();

    // Handle session link clicks
    const sessionLink = this.shadowRoot.querySelector('.session-link-value');
    if (sessionLink) {
      sessionLink.addEventListener('click', (e) => {
        e.stopPropagation();
        const sessionId = sessionLink.getAttribute('data-session-id');
        this.handleSessionClick(sessionId);
      });
    }

    // Handle show more/less toggle
    const showMoreBtns = this.shadowRoot.querySelectorAll('.show-more-btn');
    showMoreBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const targetId = btn.getAttribute('data-target');
        const target = this.shadowRoot.getElementById(targetId);
        if (target) {
          target.classList.toggle('collapsed');
          btn.textContent = target.classList.contains('collapsed') ? 'show more' : 'show less';
        }
      });
    });
  }

  /**
   * Handle session link click
   */
  handleSessionClick(sessionId) {
    this.dispatchEvent(new CustomEvent('navigate-session', {
      bubbles: true,
      composed: true,
      detail: { session_id: sessionId }
    }));
  }
}

customElements.define('create-agent-widget', CreateAgentWidget);
