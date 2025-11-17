/**
 * Create PTY Widget Component
 * Displays PTY creation parameters (name, cwd, shell)
 * Shows session ID once created
 */

import { ToolCallBase } from './tool-call-base.mjs';

export class CreatePttyWidget extends ToolCallBase {
  constructor() {
    super();
  }

  /**
   * Extended styles for create_ptty widget
   */
  getStyles() {
    return `
      ${super.getStyles()}

      .pty-info {
        margin-top: 12px;
      }

      .session-id-display {
        margin-top: 12px;
        padding: 10px 12px;
        background: rgba(30, 80, 30, 0.3);
        border: 1px solid rgba(50, 150, 50, 0.5);
        border-left: 3px solid rgba(100, 200, 100, 0.7);
        border-radius: 4px;
        font-family: 'Monaco', 'Menlo', 'Consolas', monospace;
        font-size: 13px;
      }

      .session-id-label {
        color: rgba(100, 200, 100, 0.8);
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        margin-bottom: 4px;
      }

      .session-id-value {
        color: rgba(100, 200, 100, 1);
        font-weight: bold;
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .creating-indicator {
        margin-top: 12px;
        padding: 8px 12px;
        background: rgba(80, 80, 30, 0.3);
        border: 1px solid rgba(150, 150, 50, 0.5);
        border-radius: 4px;
        font-size: 12px;
        color: rgba(255, 255, 100, 0.9);
        font-style: italic;
      }

      .creating-spinner {
        display: inline-block;
        width: 12px;
        height: 12px;
        border: 2px solid rgba(255, 255, 100, 0.3);
        border-top-color: rgba(255, 255, 100, 0.9);
        border-radius: 50%;
        animation: spin 1s linear infinite;
        margin-right: 8px;
        vertical-align: middle;
      }

      @keyframes spin {
        to { transform: rotate(360deg); }
      }
    `;
  }

  /**
   * Render content
   */
  renderContent() {
    const isToolCall = this.event.type === 'TOOL_CALL';
    const isToolResponse = this.event.type === 'TOOL_RESPONSE';
    
    // Get parameters from either tool_call or tool_response
    const params = this.event.params || this.event.arguments || {};
    const metadata = this.event.metadata || this.event.result?.metadata || {};
    
    const name = params.name || metadata.name || '(unnamed)';
    const cwd = params.cwd || metadata.cwd || process.cwd();
    const shell = params.shell || metadata.shell || 'bash';
    const sessionId = metadata.sessionId || this.event.sessionId;

    return `
      <div class="content">
        <div class="pty-info tool-params">
          ${this.renderParam('name', name)}
          ${this.renderParam('cwd', cwd, true)}
          ${this.renderParam('shell', shell)}
        </div>
        
        ${isToolResponse && sessionId ? this.renderSessionId(sessionId) : ''}
        ${isToolCall && !sessionId ? this.renderCreating() : ''}
      </div>
      ${this.renderActions()}
    `;
  }

  /**
   * Render session ID display (for successful creation)
   */
  renderSessionId(sessionId) {
    return `
      <div class="session-id-display">
        <div class="session-id-label">PTY Session Created</div>
        <div class="session-id-value">
          <span>sessionId: ${this.escapeHtml(sessionId)}</span>
          ${this.renderParamFilter('pty.sessionId', sessionId)}
        </div>
      </div>
    `;
  }

  /**
   * Render creating indicator (for pending creation)
   */
  renderCreating() {
    return `
      <div class="creating-indicator">
        <span class="creating-spinner"></span>
        Creating PTY session...
      </div>
    `;
  }
}

customElements.define('create-ptty-widget', CreatePttyWidget);
