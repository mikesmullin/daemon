/**
 * Send Command to PTY Widget Component
 * Displays PTY session ID and command being sent
 * Shows waiting indicator if response is pending
 */

import { ToolCallBase } from './tool-call-base.mjs';

export class SendCommandWidget extends ToolCallBase {
  constructor() {
    super();
  }

  /**
   * Extended styles for send_command_to_ptty widget
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

      .command-display {
        display: flex;
        align-items: flex-start;
        gap: 8px;
        padding: 10px 12px;
        background: rgba(20, 20, 20, 0.8);
        border: 1px solid rgba(60, 60, 60, 0.6);
        border-left: 3px solid rgba(100, 200, 100, 0.6);
        border-radius: 4px;
        font-family: 'Monaco', 'Menlo', 'Consolas', monospace;
        font-size: 13px;
        margin-bottom: 12px;
      }

      .command-prompt {
        color: rgba(100, 200, 100, 0.8);
        font-weight: bold;
        user-select: none;
      }

      .command-text {
        color: rgba(255, 255, 255, 0.95);
        flex: 1;
        word-break: break-all;
      }

      .waiting-indicator {
        margin-top: 8px;
        padding: 8px 12px;
        background: rgba(80, 80, 30, 0.3);
        border: 1px solid rgba(150, 150, 50, 0.5);
        border-radius: 4px;
        font-size: 12px;
        color: rgba(255, 255, 100, 0.9);
        font-style: italic;
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .waiting-spinner {
        display: inline-block;
        width: 12px;
        height: 12px;
        border: 2px solid rgba(255, 255, 100, 0.3);
        border-top-color: rgba(255, 255, 100, 0.9);
        border-radius: 50%;
        animation: spin 1s linear infinite;
      }

      @keyframes spin {
        to { transform: rotate(360deg); }
      }

      .sleep-info {
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
    const isToolCall = this.event.type === 'TOOL_CALL';
    const params = this.event.params || this.event.arguments || {};
    
    const sessionId = params.sessionId || this.event.sessionId || '(unknown)';
    const command = params.command || '';
    const sleep = params.sleep || 1;
    
    // Determine if waiting for response
    const isWaiting = isToolCall && this.getToolStatus() === 'working';

    return `
      <div class="content">
        ${this.renderSessionRef(sessionId)}
        ${this.renderCommand(command)}
        ${sleep && sleep > 1 ? this.renderSleepInfo(sleep) : ''}
        ${isWaiting ? this.renderWaiting() : ''}
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
   * Render command display
   */
  renderCommand(command) {
    return `
      <div class="command-display">
        <span class="command-prompt">$</span>
        <span class="command-text">${this.escapeHtml(command)}</span>
      </div>
    `;
  }

  /**
   * Render sleep time info
   */
  renderSleepInfo(sleep) {
    return `
      <div class="sleep-info">
        ⏱ Waiting ${sleep} second${sleep !== 1 ? 's' : ''} for output
      </div>
    `;
  }

  /**
   * Render waiting indicator
   */
  renderWaiting() {
    return `
      <div class="waiting-indicator">
        <span class="waiting-spinner"></span>
        <span>Waiting for response...</span>
      </div>
    `;
  }
}

customElements.define('send-command-widget', SendCommandWidget);
