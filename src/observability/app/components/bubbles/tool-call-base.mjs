/**
 * Tool Call Base Component
 * Base class for all tool call bubble widgets
 * Provides common functionality for tool status, icons, and layout
 */

import { BaseBubble } from './base-bubble.mjs';

export class ToolCallBase extends BaseBubble {
  constructor() {
    super();
  }

  /**
   * Always left-aligned for tool calls
   */
  get alignment() {
    return 'left';
  }

  /**
   * Get tool name from event
   */
  getToolName() {
    return this.event.tool || this.event.function_name || 'unknown';
  }

  /**
   * Get humanized tool name
   */
  getHumanizedToolName() {
    const toolName = this.getToolName();
    // Convert snake_case to Title Case
    return toolName
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  /**
   * Get tool icon emoji based on tool type
   */
  getToolIcon() {
    const toolName = this.getToolName();
    const iconMap = {
      'ask_human': '❓',
      'execute_shell': '⚙️',
      'create_agent': '🤖',
      'create_ptty': '💻',
      'send_command_to_ptty': '⌨️',
      'view_file': '📄',
      'edit_file': '✏️',
      'apply_patch': '🔧',
      'speak_to_human': '🔊',
      'thinking': '💭',
    };
    return iconMap[toolName] || '🔧';
  }

  /**
   * Get tool call status
   */
  getToolStatus() {
    if (this.event.type === 'TOOL_RESPONSE') {
      return this.event.success === true ? 'success' : 
             this.event.success === false ? 'fail' : 'working';
    }
    if (this.event.type === 'TOOL_CALL') {
      return this.event.status || 'working';
    }
    return null;
  }

  /**
   * Override status to use tool-specific logic
   */
  getStatus() {
    return this.getToolStatus();
  }

  /**
   * Extended styles for tool call bubbles
   */
  getStyles() {
    return `
      ${super.getStyles()}

      .bubble.left {
        background: rgba(40, 40, 40, 0.95);
        border: 1px solid rgba(80, 80, 80, 0.5);
      }

      .tool-header {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 12px;
        padding-bottom: 8px;
        border-bottom: 1px solid rgba(80, 80, 80, 0.3);
      }

      .tool-type {
        color: rgba(255, 255, 255, 0.6);
        font-size: 12px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }

      .tool-name {
        color: rgba(255, 255, 255, 0.9);
        font-weight: 500;
        font-size: 13px;
      }

      .tool-params {
        margin-top: 12px;
      }

      .param-row {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 6px;
        font-size: 13px;
      }

      .param-label {
        color: rgba(255, 255, 255, 0.5);
        min-width: 80px;
        font-family: 'Monaco', 'Menlo', 'Consolas', monospace;
        font-size: 12px;
      }

      .param-value {
        color: rgba(255, 255, 255, 0.9);
        flex: 1;
        word-break: break-all;
      }

      .param-value.code {
        font-family: 'Monaco', 'Menlo', 'Consolas', monospace;
        background: rgba(20, 20, 20, 0.6);
        padding: 4px 8px;
        border-radius: 4px;
        font-size: 12px;
      }

      .code-block {
        background: rgba(20, 20, 20, 0.8);
        border: 1px solid rgba(60, 60, 60, 0.6);
        border-radius: 6px;
        padding: 12px;
        margin: 8px 0;
        overflow: auto;
        max-height: 300px;
        font-family: 'Monaco', 'Menlo', 'Consolas', monospace;
        font-size: 13px;
        line-height: 1.4;
        color: rgba(255, 255, 255, 0.9);
      }

      .code-block.collapsed {
        max-height: 150px;
        overflow: hidden;
      }

      .scrollable {
        overflow-y: auto;
        scrollbar-width: thin;
        scrollbar-color: rgba(100, 100, 100, 0.5) transparent;
      }

      .scrollable::-webkit-scrollbar {
        width: 6px;
      }

      .scrollable::-webkit-scrollbar-track {
        background: transparent;
      }

      .scrollable::-webkit-scrollbar-thumb {
        background: rgba(100, 100, 100, 0.5);
        border-radius: 3px;
      }

      .scrollable::-webkit-scrollbar-thumb:hover {
        background: rgba(120, 120, 120, 0.7);
      }

      .show-more-btn {
        margin-top: 8px;
        padding: 6px 12px;
        background: rgba(60, 60, 60, 0.6);
        border: 1px solid rgba(80, 80, 80, 0.5);
        border-radius: 4px;
        color: rgba(255, 255, 255, 0.8);
        cursor: pointer;
        font-size: 12px;
        transition: all 0.2s ease;
      }

      .show-more-btn:hover {
        background: rgba(70, 70, 70, 0.8);
        color: rgba(255, 255, 255, 1);
      }

      .action-button {
        margin-top: 12px;
        padding: 8px 16px;
        background: rgba(50, 120, 220, 0.8);
        border: 1px solid rgba(70, 140, 240, 0.6);
        border-radius: 4px;
        color: #fff;
        font-weight: 500;
        cursor: pointer;
        font-size: 13px;
        transition: all 0.2s ease;
      }

      .action-button:hover {
        background: rgba(60, 130, 230, 0.9);
        border-color: rgba(80, 150, 250, 0.7);
      }

      .action-button:active {
        transform: scale(0.98);
      }

      .action-button:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }

      .inline-filter {
        margin-left: 4px;
        font-size: 10px;
        padding: 2px 6px;
      }

      .success-icon {
        color: #10b981;
        font-size: 16px;
      }

      .fail-icon {
        color: #ef4444;
        font-size: 16px;
      }
    `;
  }

  /**
   * Render tool header
   */
  renderHeader() {
    const eventType = this.event.type === 'TOOL_RESPONSE' ? 'tool response' : 'tool call';
    const toolName = this.getHumanizedToolName();
    const icon = this.getToolIcon();

    return `
      <div class="header">
        ${this.renderStatusIndicator()}
        <span class="event-icon">${icon}</span>
        <div class="tool-header">
          <span class="tool-type">${eventType}</span>
          <span class="tool-name">: ${this.escapeHtml(toolName)}</span>
          ${this.renderToolFilter()}
        </div>
      </div>
    `;
  }

  /**
   * Render filter button for tool name
   */
  renderToolFilter() {
    const toolName = this.getToolName();
    return `<button class="action-btn filter inline-filter" 
                    data-field="tool" 
                    data-value="${this.escapeHtml(toolName)}" 
                    title="Filter out tool:${this.escapeHtml(toolName)}">−</button>`;
  }

  /**
   * Render a parameter row
   */
  renderParam(label, value, isCode = false) {
    const valueClass = isCode ? 'param-value code' : 'param-value';
    const filterBtn = this.renderParamFilter(label, value);
    
    return `
      <div class="param-row">
        <span class="param-label">${this.escapeHtml(label)}:</span>
        <span class="${valueClass}">${this.escapeHtml(String(value))}</span>
        ${filterBtn}
      </div>
    `;
  }

  /**
   * Render filter button for parameter
   */
  renderParamFilter(field, value) {
    return `<button class="action-btn filter inline-filter" 
                    data-field="${this.escapeHtml(field)}" 
                    data-value="${this.escapeHtml(String(value))}" 
                    title="Filter out ${this.escapeHtml(field)}:${this.escapeHtml(String(value))}">−</button>`;
  }

  /**
   * Render a code block with optional collapse
   */
  renderCodeBlock(content, collapsed = false, maxHeight = 300) {
    const id = `code-${Math.random().toString(36).substr(2, 9)}`;
    const collapsedClass = collapsed ? 'collapsed' : '';
    
    return `
      <div class="code-block scrollable ${collapsedClass}" 
           id="${id}" 
           style="max-height: ${maxHeight}px">
        ${this.escapeHtml(content)}
      </div>
      ${collapsed ? `<button class="show-more-btn" data-target="${id}">show more</button>` : ''}
    `;
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

    // Handle show more buttons
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

customElements.define('tool-call-base', ToolCallBase);
