/**
 * Edit File Widget Component
 * Displays file path with old/new string diff preview
 * Color-coded additions and deletions
 */

import { ToolCallBase } from './tool-call-base.mjs';

export class EditFileWidget extends ToolCallBase {
  constructor() {
    super();
  }

  /**
   * Extended styles for edit_file widget
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
        border-left: 3px solid rgba(255, 180, 100, 0.6);
        border-radius: 4px;
      }

      .file-icon {
        font-size: 18px;
        flex-shrink: 0;
      }

      .file-path {
        font-family: 'Monaco', 'Menlo', 'Consolas', monospace;
        font-size: 13px;
        color: rgba(255, 180, 100, 0.95);
        flex: 1;
        word-break: break-all;
      }

      .diff-container {
        margin-top: 12px;
        background: rgba(20, 20, 20, 0.8);
        border: 1px solid rgba(60, 60, 60, 0.5);
        border-radius: 4px;
        overflow: hidden;
      }

      .diff-section {
        padding: 12px;
        border-bottom: 1px solid rgba(60, 60, 60, 0.3);
      }

      .diff-section:last-child {
        border-bottom: none;
      }

      .diff-label {
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        margin-bottom: 8px;
        font-weight: 600;
      }

      .diff-label.old {
        color: rgba(255, 100, 100, 0.9);
      }

      .diff-label.new {
        color: rgba(100, 255, 150, 0.9);
      }

      .diff-content {
        font-family: 'Monaco', 'Menlo', 'Consolas', monospace;
        font-size: 12px;
        line-height: 1.5;
        white-space: pre-wrap;
        word-break: break-word;
        padding: 10px;
        border-radius: 4px;
        max-height: 300px;
        overflow-y: auto;
      }

      .diff-content.collapsed {
        max-height: 150px;
        overflow: hidden;
      }

      .diff-content.old {
        background: rgba(100, 20, 20, 0.15);
        border: 1px solid rgba(150, 50, 50, 0.3);
        color: rgba(255, 150, 150, 0.95);
      }

      .diff-content.new {
        background: rgba(20, 100, 60, 0.15);
        border: 1px solid rgba(50, 150, 100, 0.3);
        color: rgba(150, 255, 200, 0.95);
      }

      .diff-line {
        display: flex;
        align-items: flex-start;
      }

      .diff-marker {
        display: inline-block;
        width: 20px;
        flex-shrink: 0;
        font-weight: bold;
        user-select: none;
      }

      .diff-marker.removed {
        color: rgba(255, 100, 100, 0.9);
      }

      .diff-marker.added {
        color: rgba(100, 255, 150, 0.9);
      }

      .diff-text {
        flex: 1;
      }

      .unified-diff {
        font-family: 'Monaco', 'Menlo', 'Consolas', monospace;
        font-size: 12px;
        line-height: 1.5;
        padding: 12px;
        background: rgba(20, 20, 20, 0.9);
        color: rgba(255, 255, 255, 0.9);
        overflow-x: auto;
        max-height: 400px;
      }

      .unified-diff.collapsed {
        max-height: 200px;
        overflow: hidden;
      }

      .diff-stats {
        padding: 8px 12px;
        background: rgba(40, 40, 40, 0.5);
        border-bottom: 1px solid rgba(60, 60, 60, 0.3);
        font-size: 11px;
        display: flex;
        gap: 16px;
      }

      .stat-item {
        display: flex;
        align-items: center;
        gap: 6px;
      }

      .stat-additions {
        color: rgba(100, 255, 150, 0.9);
      }

      .stat-deletions {
        color: rgba(255, 100, 100, 0.9);
      }

      .stat-label {
        color: rgba(255, 255, 255, 0.5);
      }
    `;
  }

  /**
   * Render content
   */
  renderContent() {
    const filePath = this.event.file_path || this.event.params?.file_path || this.event.params?.path || '';
    const oldString = this.event.old_string || this.event.params?.old_string || '';
    const newString = this.event.new_string || this.event.params?.new_string || '';
    const success = this.event.success;

    return `
      <div class="content">
        ${this.renderFilePath(filePath)}
        ${this.renderDiff(oldString, newString)}
        ${success !== undefined ? this.renderSuccessStatus(success) : ''}
      </div>
      ${this.renderActions()}
    `;
  }

  /**
   * Render file path
   */
  renderFilePath(filePath) {
    return `
      <div class="file-path-container">
        <span class="file-icon">✏️</span>
        <span class="file-path">${this.escapeHtml(filePath)}</span>
        ${this.renderParamFilter('file', filePath)}
      </div>
    `;
  }

  /**
   * Render diff preview
   */
  renderDiff(oldString, newString) {
    // Calculate basic stats
    const oldLines = oldString.split('\n');
    const newLines = newString.split('\n');
    const stats = this.calculateStats(oldString, newString);
    
    const shouldCollapseOld = oldString.length > 500;
    const shouldCollapseNew = newString.length > 500;
    const oldId = `old-${Math.random().toString(36).substr(2, 9)}`;
    const newId = `new-${Math.random().toString(36).substr(2, 9)}`;

    return `
      <div class="diff-container">
        ${this.renderStats(stats)}
        
        <div class="diff-section">
          <div class="diff-label old">− Removed (${oldLines.length} line${oldLines.length !== 1 ? 's' : ''})</div>
          <div class="diff-content old scrollable ${shouldCollapseOld ? 'collapsed' : ''}" id="${oldId}">
${this.renderDiffLines(oldString, 'removed')}</div>
          ${shouldCollapseOld ? `<button class="show-more-btn" data-target="${oldId}">show more</button>` : ''}
        </div>
        
        <div class="diff-section">
          <div class="diff-label new">+ Added (${newLines.length} line${newLines.length !== 1 ? 's' : ''})</div>
          <div class="diff-content new scrollable ${shouldCollapseNew ? 'collapsed' : ''}" id="${newId}">
${this.renderDiffLines(newString, 'added')}</div>
          ${shouldCollapseNew ? `<button class="show-more-btn" data-target="${newId}">show more</button>` : ''}
        </div>
      </div>
    `;
  }

  /**
   * Render diff lines with markers
   */
  renderDiffLines(content, type) {
    const marker = type === 'removed' ? '−' : '+';
    const markerClass = type === 'removed' ? 'removed' : 'added';
    
    const lines = content.split('\n');
    return lines.map(line => {
      return `<div class="diff-line"><span class="diff-marker ${markerClass}">${marker}</span><span class="diff-text">${this.escapeHtml(line)}</span></div>`;
    }).join('\n');
  }

  /**
   * Calculate diff statistics
   */
  calculateStats(oldString, newString) {
    const oldLines = oldString.split('\n').length;
    const newLines = newString.split('\n').length;
    
    // Simple character-based diff
    const oldChars = oldString.length;
    const newChars = newString.length;
    
    return {
      linesAdded: Math.max(0, newLines - oldLines),
      linesRemoved: Math.max(0, oldLines - newLines),
      charsAdded: Math.max(0, newChars - oldChars),
      charsRemoved: Math.max(0, oldChars - newChars)
    };
  }

  /**
   * Render statistics
   */
  renderStats(stats) {
    return `
      <div class="diff-stats">
        <div class="stat-item">
          <span class="stat-label">Changes:</span>
          <span class="stat-additions">+${stats.linesAdded}</span>
          <span class="stat-deletions">−${stats.linesRemoved}</span>
          <span class="stat-label">lines</span>
        </div>
        <div class="stat-item">
          <span class="stat-additions">+${stats.charsAdded}</span>
          <span class="stat-deletions">−${stats.charsRemoved}</span>
          <span class="stat-label">chars</span>
        </div>
      </div>
    `;
  }

  /**
   * Render success status
   */
  renderSuccessStatus(success) {
    const icon = success ? '✓' : '✗';
    const statusClass = success ? 'success-icon' : 'fail-icon';
    const text = success ? 'Edit applied successfully' : 'Edit failed';
    
    return `
      <div class="param-row" style="margin-top: 12px;">
        <span class="${statusClass}">${icon}</span>
        <span class="param-value">${text}</span>
      </div>
    `;
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

customElements.define('edit-file-widget', EditFileWidget);
