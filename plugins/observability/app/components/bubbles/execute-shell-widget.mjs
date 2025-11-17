/**
 * Execute Shell Widget Component
 * Displays shell command with output (stdout/stderr combined)
 * Supports ANSI color codes and scrollable output
 */

import { ToolCallBase } from './tool-call-base.mjs';

export class ExecuteShellWidget extends ToolCallBase {
  constructor() {
    super();
  }

  /**
   * Extended styles for execute_shell widget
   */
  getStyles() {
    return `
      ${super.getStyles()}

      .command-display {
        display: flex;
        align-items: flex-start;
        gap: 8px;
        margin-bottom: 12px;
        padding: 10px 12px;
        background: rgba(20, 20, 20, 0.8);
        border: 1px solid rgba(60, 60, 60, 0.6);
        border-left: 3px solid rgba(100, 200, 100, 0.6);
        border-radius: 4px;
        font-family: 'Monaco', 'Menlo', 'Consolas', monospace;
        font-size: 13px;
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

      .output-container {
        margin-top: 12px;
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

      /* ANSI color support */
      .ansi-black { color: #000000; }
      .ansi-red { color: #ff5555; }
      .ansi-green { color: #50fa7b; }
      .ansi-yellow { color: #f1fa8c; }
      .ansi-blue { color: #8be9fd; }
      .ansi-magenta { color: #ff79c6; }
      .ansi-cyan { color: #8be9fd; }
      .ansi-white { color: #f8f8f2; }
      .ansi-bright-black { color: #6272a4; }
      .ansi-bright-red { color: #ff6e6e; }
      .ansi-bright-green { color: #69ff94; }
      .ansi-bright-yellow { color: #ffffa5; }
      .ansi-bright-blue { color: #d6acff; }
      .ansi-bright-magenta { color: #ff92df; }
      .ansi-bright-cyan { color: #a4ffff; }
      .ansi-bright-white { color: #ffffff; }

      .ansi-bold { font-weight: bold; }
      .ansi-dim { opacity: 0.6; }
      .ansi-italic { font-style: italic; }
      .ansi-underline { text-decoration: underline; }

      .exit-code {
        margin-top: 8px;
        font-size: 11px;
        font-family: 'Monaco', 'Menlo', 'Consolas', monospace;
      }

      .exit-code.success {
        color: rgba(100, 200, 100, 0.9);
      }

      .exit-code.failure {
        color: rgba(255, 100, 100, 0.9);
      }
    `;
  }

  /**
   * Render content
   */
  renderContent() {
    const command = this.event.command || this.event.params?.command || '';
    const output = this.event.output || this.event.result?.output || '';
    const exitCode = this.event.exit_code ?? this.event.result?.exit_code;
    const hasOutput = output && output.trim().length > 0;
    const shouldCollapse = hasOutput && output.length > 500;

    return `
      <div class="content">
        ${this.renderCommand(command)}
        ${hasOutput ? this.renderOutput(output, shouldCollapse) : ''}
        ${exitCode !== undefined ? this.renderExitCode(exitCode) : ''}
      </div>
      ${this.renderActions()}
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
   * Render output display
   */
  renderOutput(output, shouldCollapse) {
    const id = `output-${Math.random().toString(36).substr(2, 9)}`;
    const collapsedClass = shouldCollapse ? 'collapsed' : '';
    const processedOutput = this.processAnsiCodes(output);

    return `
      <div class="output-container">
        <div class="output-label">Output:</div>
        <div class="output-display scrollable ${collapsedClass}" id="${id}">
${processedOutput}</div>
        ${shouldCollapse ? `<button class="show-more-btn" data-target="${id}">show more</button>` : ''}
      </div>
    `;
  }

  /**
   * Render exit code
   */
  renderExitCode(exitCode) {
    const statusClass = exitCode === 0 ? 'success' : 'failure';
    const statusSymbol = exitCode === 0 ? '✓' : '✗';
    
    return `
      <div class="exit-code ${statusClass}">
        ${statusSymbol} Exit code: ${exitCode}
      </div>
    `;
  }

  /**
   * Process ANSI escape codes and convert to HTML
   * Basic implementation - supports common color codes
   */
  processAnsiCodes(text) {
    // Escape HTML first
    let html = this.escapeHtml(text);
    
    // ANSI color regex
    const ansiRegex = /\x1b\[([0-9;]+)m/g;
    
    let result = '';
    let lastIndex = 0;
    let currentClasses = [];
    
    // Simple implementation - just strip ANSI codes for now
    // A full implementation would parse and convert to styled spans
    result = html.replace(ansiRegex, '');
    
    // TODO: Properly parse ANSI codes and convert to HTML spans with classes
    // For now, just remove them to prevent display issues
    
    return result;
  }

  /**
   * Attach event listeners
   */
  attachEventListeners() {
    super.attachEventListeners();

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
}

customElements.define('execute-shell-widget', ExecuteShellWidget);
