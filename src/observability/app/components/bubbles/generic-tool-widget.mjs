/**
 * Generic Tool Widget Component
 * Fallback widget for unrecognized tool types
 * Displays tool name, parameters as JSON, and response/output if available
 */

import { ToolCallBase } from './tool-call-base.mjs';

export class GenericToolWidget extends ToolCallBase {
  constructor() {
    super();
  }

  /**
   * Extended styles for generic tool widget
   */
  getStyles() {
    return `
      ${super.getStyles()}

      .tool-info {
        margin-bottom: 12px;
        padding: 8px 12px;
        background: rgba(80, 80, 100, 0.3);
        border-left: 3px solid rgba(120, 120, 150, 0.5);
        border-radius: 4px;
      }

      .unknown-tool-notice {
        font-size: 12px;
        color: rgba(255, 200, 100, 0.8);
        margin-bottom: 8px;
        font-style: italic;
      }

      .tool-name-display {
        font-family: 'Monaco', 'Menlo', 'Consolas', monospace;
        color: rgba(255, 255, 255, 0.9);
        font-size: 14px;
        font-weight: 500;
      }

      .section-label {
        color: rgba(255, 255, 255, 0.6);
        font-size: 12px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        margin-top: 12px;
        margin-bottom: 6px;
      }

      .json-display {
        background: rgba(20, 20, 20, 0.8);
        border: 1px solid rgba(60, 60, 60, 0.6);
        border-radius: 6px;
        padding: 12px;
        overflow: auto;
        max-height: 300px;
        font-family: 'Monaco', 'Menlo', 'Consolas', monospace;
        font-size: 12px;
        line-height: 1.5;
        color: rgba(255, 255, 255, 0.9);
      }

      .json-display.collapsed {
        max-height: 150px;
        overflow: hidden;
      }

      .json-key {
        color: rgba(150, 200, 255, 0.9);
      }

      .json-string {
        color: rgba(150, 255, 150, 0.9);
      }

      .json-number {
        color: rgba(255, 200, 150, 0.9);
      }

      .json-boolean {
        color: rgba(255, 150, 200, 0.9);
      }

      .json-null {
        color: rgba(150, 150, 150, 0.9);
      }

      .no-data {
        color: rgba(255, 255, 255, 0.4);
        font-style: italic;
        font-size: 12px;
        padding: 8px;
      }

      .expand-json-btn {
        margin-top: 8px;
        padding: 4px 10px;
        background: rgba(60, 60, 70, 0.6);
        border: 1px solid rgba(80, 80, 90, 0.5);
        border-radius: 4px;
        color: rgba(255, 255, 255, 0.7);
        cursor: pointer;
        font-size: 11px;
        transition: all 0.2s ease;
      }

      .expand-json-btn:hover {
        background: rgba(70, 70, 80, 0.8);
        color: rgba(255, 255, 255, 0.9);
      }
    `;
  }

  /**
   * Render content
   */
  renderContent() {
    const toolName = this.getToolName();
    const params = this.event.params || this.event.parameters || {};
    const response = this.event.response || this.event.output || this.event.result;
    const isToolResponse = this.event.type === 'TOOL_RESPONSE';

    return `
      <div class="content">
        <div class="tool-info">
          <div class="unknown-tool-notice">⚠ Generic tool display</div>
          <div class="tool-name-display">${this.escapeHtml(toolName)}</div>
        </div>
        
        ${!isToolResponse ? this.renderParameters(params) : ''}
        ${response !== undefined ? this.renderResponse(response) : ''}
      </div>
      ${this.renderActions()}
    `;
  }

  /**
   * Render parameters section
   */
  renderParameters(params) {
    const jsonId = `params-${Math.random().toString(36).substr(2, 9)}`;
    const jsonString = this.formatJson(params);
    const hasContent = Object.keys(params).length > 0;
    const needsExpansion = jsonString.length > 500;

    return `
      <div class="section-label">Parameters</div>
      ${hasContent ? `
        <div class="json-display ${needsExpansion ? 'collapsed' : ''}" id="${jsonId}">
          <pre>${jsonString}</pre>
        </div>
        ${needsExpansion ? `<button class="expand-json-btn" data-target="${jsonId}">show more</button>` : ''}
      ` : `
        <div class="no-data">No parameters</div>
      `}
    `;
  }

  /**
   * Render response section
   */
  renderResponse(response) {
    const jsonId = `response-${Math.random().toString(36).substr(2, 9)}`;
    const isObject = typeof response === 'object' && response !== null;
    const jsonString = isObject ? this.formatJson(response) : String(response);
    const needsExpansion = jsonString.length > 500;

    return `
      <div class="section-label">Response</div>
      <div class="json-display ${needsExpansion ? 'collapsed' : ''}" id="${jsonId}">
        ${isObject ? `<pre>${jsonString}</pre>` : this.escapeHtml(jsonString)}
      </div>
      ${needsExpansion ? `<button class="expand-json-btn" data-target="${jsonId}">show more</button>` : ''}
    `;
  }

  /**
   * Format JSON with syntax highlighting
   */
  formatJson(obj) {
    const json = JSON.stringify(obj, null, 2);
    
    // Apply syntax highlighting
    return json
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"([^"]+)":/g, '<span class="json-key">"$1"</span>:')
      .replace(/: "([^"]*)"/g, ': <span class="json-string">"$1"</span>')
      .replace(/: (\d+\.?\d*)/g, ': <span class="json-number">$1</span>')
      .replace(/: (true|false)/g, ': <span class="json-boolean">$1</span>')
      .replace(/: null/g, ': <span class="json-null">null</span>');
  }

  /**
   * Attach event listeners
   */
  attachEventListeners() {
    super.attachEventListeners();

    // Handle expand buttons
    const expandBtns = this.shadowRoot.querySelectorAll('.expand-json-btn');
    expandBtns.forEach(btn => {
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

customElements.define('generic-tool-widget', GenericToolWidget);
