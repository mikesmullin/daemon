/**
 * PTY Response Widget Component
 * Displays PTY session output/response
 * Shows success/fail status and VIEW PTY button to open full terminal
 */

import { ToolCallBase } from './tool-call-base.mjs';

export class PttyResponseWidget extends ToolCallBase {
  constructor() {
    super();
  }

  /**
   * Extended styles for PTY response widget
   */
  getStyles() {
    return `
      ${super.getStyles()}

      .pty-session-ref {
        margin-bottom: 12px;
        padding: 8px 12px;
        background: rgba(30, 30, 80, 0.3);
        border: 1px solid rgba(50, 50, 150, 0.5);
        border-left: 3px solid rgba(100, 100, 200, 0.7);
        border-radius: 4px;
      }

      .session-ref-row {
        display: flex;
        align-items: center;
        gap: 8px;
        font-family: 'Monaco', 'Menlo', 'Consolas', monospace;
        font-size: 12px;
      }

      .session-ref-label {
        color: rgba(150, 150, 255, 0.7);
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }

      .session-ref-value {
        color: rgba(150, 150, 255, 1);
        font-weight: bold;
      }

      .status-display {
        margin-bottom: 12px;
        padding: 10px 12px;
        border-radius: 4px;
        font-size: 13px;
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .status-display.success {
        background: rgba(30, 80, 30, 0.3);
        border: 1px solid rgba(50, 150, 50, 0.5);
        border-left: 3px solid rgba(100, 200, 100, 0.7);
        color: rgba(100, 200, 100, 1);
      }

      .status-display.fail {
        background: rgba(80, 30, 30, 0.3);
        border: 1px solid rgba(150, 50, 50, 0.5);
        border-left: 3px solid rgba(200, 100, 100, 0.7);
        color: rgba(200, 100, 100, 1);
      }

      .status-icon {
        font-size: 18px;
      }

      .output-container {
        margin-bottom: 12px;
      }

      .output-label {
        font-size: 11px;
        color: rgba(255, 255, 255, 0.5);
        text-transform: uppercase;
        letter-spacing: 0.5px;
        margin-bottom: 6px;
      }

      .output-display {
        background: rgba(20, 20, 20, 0.9);
        border: 1px solid rgba(60, 60, 60, 0.5);
        border-radius: 4px;
        padding: 12px;
        font-family: 'Monaco', 'Menlo', 'Consolas', monospace;
        font-size: 12px;
        line-height: 1.4;
        color: rgba(255, 255, 255, 0.9);
        white-space: pre-wrap;
        word-break: break-all;
        overflow-y: auto;
        max-height: 400px;
      }

      .output-display.collapsed {
        max-height: 200px;
        overflow: hidden;
      }

      .output-display:empty::before {
        content: '(no output)';
        color: rgba(255, 255, 255, 0.3);
        font-style: italic;
      }

      .view-pty-btn {
        margin-top: 12px;
        padding: 10px 20px;
        background: rgba(50, 120, 220, 0.8);
        border: 1px solid rgba(70, 140, 240, 0.6);
        border-radius: 6px;
        color: #fff;
        font-weight: 600;
        cursor: pointer;
        font-size: 13px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        transition: all 0.2s ease;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
      }

      .view-pty-btn:hover {
        background: rgba(60, 130, 230, 0.9);
        border-color: rgba(80, 150, 250, 0.7);
        transform: translateY(-1px);
        box-shadow: 0 4px 8px rgba(0, 0, 0, 0.3);
      }

      .view-pty-btn:active {
        transform: translateY(0);
      }

      .view-pty-btn::before {
        content: '💻';
        font-size: 16px;
      }

      .metadata-info {
        margin-top: 8px;
        font-size: 11px;
        color: rgba(255, 255, 255, 0.5);
        font-family: 'Monaco', 'Menlo', 'Consolas', monospace;
      }
    `;
  }

  /**
   * Render content
   */
  renderContent() {
    const metadata = this.event.metadata || this.event.result?.metadata || {};
    const content = this.event.content || this.event.result?.content || '';
    
    const sessionId = metadata.sessionId || this.event.sessionId || '(unknown)';
    const success = this.event.success ?? this.event.result?.success;
    const output = metadata.output || content || '';
    const executionTime = metadata.executionTime;
    const command = metadata.command;
    
    const hasOutput = output && output.trim().length > 0;
    const shouldCollapse = hasOutput && output.length > 500;

    return `
      <div class="content">
        ${this.renderSessionRef(sessionId)}
        ${typeof success === 'boolean' ? this.renderStatus(success) : ''}
        ${command ? this.renderCommandRef(command) : ''}
        ${hasOutput ? this.renderOutput(output, shouldCollapse) : ''}
        ${executionTime ? this.renderExecutionTime(executionTime) : ''}
        ${this.renderViewPtyButton(sessionId)}
      </div>
      ${this.renderActions()}
    `;
  }

  /**
   * Render PTY session reference
   */
  renderSessionRef(sessionId) {
    return `
      <div class="pty-session-ref">
        <div class="session-ref-row">
          <span class="session-ref-label">PTY Session:</span>
          <span class="session-ref-value">${this.escapeHtml(sessionId)}</span>
          ${this.renderParamFilter('pty.sessionId', sessionId)}
        </div>
      </div>
    `;
  }

  /**
   * Render status display
   */
  renderStatus(success) {
    const statusClass = success ? 'success' : 'fail';
    const statusIcon = success ? '✓' : '✗';
    const statusText = success ? 'Command completed successfully' : 'Command failed';
    
    return `
      <div class="status-display ${statusClass}">
        <span class="status-icon">${statusIcon}</span>
        <span>${statusText}</span>
      </div>
    `;
  }

  /**
   * Render command reference
   */
  renderCommandRef(command) {
    return `
      <div class="metadata-info">
        Command: ${this.escapeHtml(command)}
      </div>
    `;
  }

  /**
   * Render output display
   */
  renderOutput(output, shouldCollapse) {
    const id = `output-${Math.random().toString(36).substr(2, 9)}`;
    const collapsedClass = shouldCollapse ? 'collapsed' : '';

    return `
      <div class="output-container">
        <div class="output-label">Output:</div>
        <div class="output-display scrollable ${collapsedClass}" id="${id}">${this.escapeHtml(output)}</div>
        ${shouldCollapse ? `<button class="show-more-btn" data-target="${id}">show more</button>` : ''}
      </div>
    `;
  }

  /**
   * Render execution time
   */
  renderExecutionTime(executionTime) {
    const timeInSeconds = (executionTime / 1000).toFixed(2);
    return `
      <div class="metadata-info">
        ⏱ Execution time: ${timeInSeconds}s
      </div>
    `;
  }

  /**
   * Render VIEW PTY button
   */
  renderViewPtyButton(sessionId) {
    return `
      <button class="view-pty-btn" data-session-id="${this.escapeHtml(sessionId)}">
        View PTY
      </button>
    `;
  }

  /**
   * Attach event listeners
   */
  attachEventListeners() {
    super.attachEventListeners();

    // Handle VIEW PTY button
    const viewPtyBtn = this.shadowRoot.querySelector('.view-pty-btn');
    if (viewPtyBtn) {
      viewPtyBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const sessionId = viewPtyBtn.getAttribute('data-session-id');
        this.handleViewPty(sessionId);
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
   * Handle VIEW PTY button click
   */
  handleViewPty(sessionId) {
    this.dispatchEvent(new CustomEvent('view-pty', {
      bubbles: true,
      composed: true,
      detail: { sessionId }
    }));
  }
}

customElements.define('ptty-response-widget', PttyResponseWidget);
