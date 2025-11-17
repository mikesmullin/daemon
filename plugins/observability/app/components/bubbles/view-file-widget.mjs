/**
 * View File Widget Component
 * Displays file path with copy button and line range
 */

import { ToolCallBase } from './tool-call-base.mjs';

export class ViewFileWidget extends ToolCallBase {
  constructor() {
    super();
  }

  /**
   * Extended styles for view_file widget
   */
  getStyles() {
    return `
      ${super.getStyles()}

      .file-path-container {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 12px;
        padding: 10px 12px;
        background: rgba(60, 60, 60, 0.3);
        border: 1px solid rgba(80, 80, 80, 0.5);
        border-left: 3px solid rgba(100, 150, 255, 0.6);
        border-radius: 4px;
      }

      .file-icon {
        font-size: 18px;
        flex-shrink: 0;
      }

      .file-path {
        font-family: 'Monaco', 'Menlo', 'Consolas', monospace;
        font-size: 13px;
        color: rgba(100, 150, 255, 0.95);
        flex: 1;
        word-break: break-all;
      }

      .copy-button {
        padding: 4px 10px;
        background: rgba(60, 60, 60, 0.6);
        border: 1px solid rgba(80, 80, 80, 0.5);
        border-radius: 3px;
        color: rgba(255, 255, 255, 0.7);
        font-size: 11px;
        cursor: pointer;
        transition: all 0.2s ease;
        flex-shrink: 0;
      }

      .copy-button:hover {
        background: rgba(70, 70, 70, 0.8);
        color: rgba(255, 255, 255, 0.9);
      }

      .copy-button.copied {
        background: rgba(50, 120, 80, 0.6);
        color: rgba(100, 255, 150, 0.9);
      }

      .line-range-container {
        display: flex;
        align-items: center;
        gap: 12px;
        margin-bottom: 12px;
        padding: 8px 12px;
        background: rgba(40, 40, 40, 0.5);
        border-radius: 4px;
        font-size: 12px;
      }

      .line-range-label {
        color: rgba(255, 255, 255, 0.5);
      }

      .line-range-value {
        font-family: 'Monaco', 'Menlo', 'Consolas', monospace;
        color: rgba(255, 255, 255, 0.9);
      }

      .line-count {
        color: rgba(255, 255, 255, 0.4);
        font-size: 11px;
      }

      .file-content-preview {
        margin-top: 12px;
        background: rgba(20, 20, 20, 0.8);
        border: 1px solid rgba(60, 60, 60, 0.5);
        border-radius: 4px;
        padding: 12px;
        font-family: 'Monaco', 'Menlo', 'Consolas', monospace;
        font-size: 12px;
        line-height: 1.5;
        color: rgba(255, 255, 255, 0.9);
        overflow-x: auto;
        max-height: 400px;
      }

      .file-content-preview.collapsed {
        max-height: 200px;
        overflow: hidden;
      }

      .line-number {
        display: inline-block;
        min-width: 40px;
        color: rgba(255, 255, 255, 0.3);
        user-select: none;
        text-align: right;
        padding-right: 12px;
        border-right: 1px solid rgba(80, 80, 80, 0.3);
        margin-right: 12px;
      }

      .line-content {
        white-space: pre;
      }

      .view-full-button {
        margin-top: 8px;
        padding: 6px 12px;
        background: rgba(60, 100, 160, 0.6);
        border: 1px solid rgba(80, 120, 180, 0.5);
        border-radius: 4px;
        color: rgba(255, 255, 255, 0.9);
        font-size: 12px;
        cursor: pointer;
        transition: all 0.2s ease;
      }

      .view-full-button:hover {
        background: rgba(70, 110, 170, 0.8);
      }
    `;
  }

  /**
   * Render content
   */
  renderContent() {
    const filePath = this.event.file_path || this.event.params?.file_path || this.event.params?.path || '';
    const lineStart = this.event.line_start || this.event.params?.line_start;
    const lineEnd = this.event.line_end || this.event.params?.line_end;
    const content = this.event.content || this.event.result?.content || '';
    const hasLineRange = lineStart !== undefined || lineEnd !== undefined;

    return `
      <div class="content">
        ${this.renderFilePath(filePath)}
        ${hasLineRange ? this.renderLineRange(lineStart, lineEnd) : ''}
        ${content ? this.renderContentPreview(content, lineStart) : ''}
      </div>
      ${this.renderActions()}
    `;
  }

  /**
   * Render file path with copy button
   */
  renderFilePath(filePath) {
    const copyId = `copy-${Math.random().toString(36).substr(2, 9)}`;
    
    return `
      <div class="file-path-container">
        <span class="file-icon">📄</span>
        <span class="file-path">${this.escapeHtml(filePath)}</span>
        <button class="copy-button" data-copy-id="${copyId}" data-path="${this.escapeHtml(filePath)}">
          Copy
        </button>
        ${this.renderParamFilter('file', filePath)}
      </div>
    `;
  }

  /**
   * Render line range information
   */
  renderLineRange(lineStart, lineEnd) {
    let rangeText = '';
    let lineCount = 0;

    if (lineStart !== undefined && lineEnd !== undefined) {
      rangeText = `${lineStart} - ${lineEnd}`;
      lineCount = lineEnd - lineStart + 1;
    } else if (lineStart !== undefined) {
      rangeText = `${lineStart}`;
      lineCount = 1;
    } else if (lineEnd !== undefined) {
      rangeText = `1 - ${lineEnd}`;
      lineCount = lineEnd;
    }

    return `
      <div class="line-range-container">
        <span class="line-range-label">Lines:</span>
        <span class="line-range-value">${this.escapeHtml(rangeText)}</span>
        ${lineCount > 0 ? `<span class="line-count">(${lineCount} line${lineCount !== 1 ? 's' : ''})</span>` : ''}
      </div>
    `;
  }

  /**
   * Render content preview with line numbers
   */
  renderContentPreview(content, startLine = 1) {
    const lines = content.split('\n');
    const shouldCollapse = lines.length > 20;
    const id = `content-${Math.random().toString(36).substr(2, 9)}`;
    const collapsedClass = shouldCollapse ? 'collapsed' : '';

    const numberedContent = lines.map((line, index) => {
      const lineNum = startLine + index;
      return `<div><span class="line-number">${lineNum}</span><span class="line-content">${this.escapeHtml(line)}</span></div>`;
    }).join('\n');

    return `
      <div class="file-content-preview scrollable ${collapsedClass}" id="${id}">
${numberedContent}
      </div>
      ${shouldCollapse ? `<button class="show-more-btn" data-target="${id}">show more</button>` : ''}
    `;
  }

  /**
   * Attach event listeners
   */
  attachEventListeners() {
    super.attachEventListeners();

    // Handle copy button
    const copyBtn = this.shadowRoot.querySelector('.copy-button');
    if (copyBtn) {
      copyBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const path = copyBtn.getAttribute('data-path');
        this.handleCopy(path, copyBtn);
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
   * Handle copy to clipboard
   */
  async handleCopy(text, button) {
    try {
      await navigator.clipboard.writeText(text);
      button.textContent = '✓ Copied';
      button.classList.add('copied');
      
      setTimeout(() => {
        button.textContent = 'Copy';
        button.classList.remove('copied');
      }, 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
      button.textContent = '✗ Failed';
      
      setTimeout(() => {
        button.textContent = 'Copy';
      }, 2000);
    }
  }
}

customElements.define('view-file-widget', ViewFileWidget);
