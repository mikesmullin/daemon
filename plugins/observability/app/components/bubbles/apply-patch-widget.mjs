/**
 * Apply Patch Widget Component
 * Displays patch file preview with affected files
 * Color-coded diff view
 */

import { ToolCallBase } from './tool-call-base.mjs';

export class ApplyPatchWidget extends ToolCallBase {
  constructor() {
    super();
  }

  /**
   * Extended styles for apply_patch widget
   */
  getStyles() {
    return `
      ${super.getStyles()}

      .patch-header {
        margin-bottom: 12px;
        padding: 10px 12px;
        background: rgba(80, 60, 120, 0.2);
        border: 1px solid rgba(100, 80, 140, 0.4);
        border-left: 3px solid rgba(150, 100, 255, 0.6);
        border-radius: 4px;
      }

      .patch-file {
        font-family: 'Monaco', 'Menlo', 'Consolas', monospace;
        font-size: 13px;
        color: rgba(150, 100, 255, 0.95);
      }

      .affected-files {
        margin-bottom: 12px;
      }

      .affected-files-label {
        font-size: 11px;
        color: rgba(255, 255, 255, 0.5);
        text-transform: uppercase;
        letter-spacing: 0.5px;
        margin-bottom: 6px;
      }

      .file-list {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }

      .file-item {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 6px 10px;
        background: rgba(40, 40, 40, 0.5);
        border-radius: 3px;
        font-family: 'Monaco', 'Menlo', 'Consolas', monospace;
        font-size: 12px;
      }

      .file-item-icon {
        font-size: 14px;
      }

      .file-item-path {
        flex: 1;
        color: rgba(255, 255, 255, 0.85);
      }

      .file-item-stats {
        display: flex;
        gap: 8px;
        font-size: 11px;
      }

      .stat-add {
        color: rgba(100, 255, 150, 0.9);
      }

      .stat-remove {
        color: rgba(255, 100, 100, 0.9);
      }

      .patch-preview {
        margin-top: 12px;
        background: rgba(20, 20, 20, 0.9);
        border: 1px solid rgba(60, 60, 60, 0.5);
        border-radius: 4px;
        overflow: hidden;
      }

      .patch-content {
        font-family: 'Monaco', 'Menlo', 'Consolas', monospace;
        font-size: 12px;
        line-height: 1.5;
        padding: 12px;
        overflow-x: auto;
        max-height: 500px;
      }

      .patch-content.collapsed {
        max-height: 250px;
        overflow: hidden;
      }

      .patch-line {
        white-space: pre;
      }

      .patch-line.header {
        color: rgba(150, 150, 200, 0.9);
        font-weight: 600;
      }

      .patch-line.file-header {
        color: rgba(200, 200, 255, 0.95);
        font-weight: bold;
        margin-top: 8px;
      }

      .patch-line.hunk-header {
        color: rgba(100, 200, 255, 0.9);
        background: rgba(50, 100, 150, 0.15);
        padding: 2px 4px;
        margin: 4px 0;
      }

      .patch-line.added {
        color: rgba(150, 255, 200, 0.95);
        background: rgba(20, 100, 60, 0.15);
      }

      .patch-line.removed {
        color: rgba(255, 150, 150, 0.95);
        background: rgba(100, 20, 20, 0.15);
      }

      .patch-line.context {
        color: rgba(255, 255, 255, 0.7);
      }

      .patch-stats {
        padding: 8px 12px;
        background: rgba(40, 40, 40, 0.6);
        border-bottom: 1px solid rgba(60, 60, 60, 0.3);
        display: flex;
        gap: 16px;
        font-size: 11px;
      }

      .total-stat {
        display: flex;
        align-items: center;
        gap: 6px;
      }

      .total-stat-label {
        color: rgba(255, 255, 255, 0.5);
      }

      .total-stat-value {
        font-weight: 600;
      }

      .apply-status {
        margin-top: 12px;
        padding: 10px 12px;
        border-radius: 4px;
        font-size: 13px;
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .apply-status.success {
        background: rgba(20, 100, 60, 0.2);
        border: 1px solid rgba(50, 150, 100, 0.4);
        color: rgba(100, 255, 150, 0.95);
      }

      .apply-status.failure {
        background: rgba(100, 20, 20, 0.2);
        border: 1px solid rgba(150, 50, 50, 0.4);
        color: rgba(255, 150, 150, 0.95);
      }
    `;
  }

  /**
   * Render content
   */
  renderContent() {
    const patchPath = this.event.patch_path || this.event.params?.patch_path || this.event.params?.patch_file || '';
    const patchContent = this.event.patch_content || this.event.params?.patch || this.event.result?.patch || '';
    const success = this.event.success;
    const affectedFiles = this.extractAffectedFiles(patchContent);

    return `
      <div class="content">
        ${patchPath ? this.renderPatchHeader(patchPath) : ''}
        ${affectedFiles.length > 0 ? this.renderAffectedFiles(affectedFiles) : ''}
        ${patchContent ? this.renderPatchPreview(patchContent) : ''}
        ${success !== undefined ? this.renderApplyStatus(success) : ''}
      </div>
      ${this.renderActions()}
    `;
  }

  /**
   * Render patch file header
   */
  renderPatchHeader(patchPath) {
    return `
      <div class="patch-header">
        <span class="file-icon">🔧</span>
        <span class="patch-file">${this.escapeHtml(patchPath)}</span>
        ${this.renderParamFilter('patch', patchPath)}
      </div>
    `;
  }

  /**
   * Extract affected files from patch content
   */
  extractAffectedFiles(patchContent) {
    if (!patchContent) return [];
    
    const files = [];
    const lines = patchContent.split('\n');
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // Look for file headers (diff --git, ---, +++, etc.)
      if (line.startsWith('+++') || line.startsWith('---')) {
        const match = line.match(/^[+-]{3}\s+([^\s]+)/);
        if (match && match[1] !== '/dev/null') {
          let path = match[1];
          // Remove a/ or b/ prefix if present
          path = path.replace(/^[ab]\//, '');
          
          if (!files.some(f => f.path === path)) {
            files.push({
              path: path,
              additions: 0,
              deletions: 0
            });
          }
        }
      }
    }
    
    // Count additions/deletions per file
    let currentFile = null;
    for (const line of lines) {
      if (line.startsWith('+++')) {
        const match = line.match(/^[+]{3}\s+([^\s]+)/);
        if (match) {
          let path = match[1].replace(/^[ab]\//, '');
          currentFile = files.find(f => f.path === path);
        }
      } else if (currentFile) {
        if (line.startsWith('+') && !line.startsWith('+++')) {
          currentFile.additions++;
        } else if (line.startsWith('-') && !line.startsWith('---')) {
          currentFile.deletions++;
        }
      }
    }
    
    return files;
  }

  /**
   * Render affected files list
   */
  renderAffectedFiles(files) {
    const totalAdditions = files.reduce((sum, f) => sum + f.additions, 0);
    const totalDeletions = files.reduce((sum, f) => sum + f.deletions, 0);

    return `
      <div class="affected-files">
        <div class="affected-files-label">
          Affected files: ${files.length} 
          <span class="stat-add">+${totalAdditions}</span>
          <span class="stat-remove">−${totalDeletions}</span>
        </div>
        <div class="file-list">
          ${files.map(file => this.renderFileItem(file)).join('')}
        </div>
      </div>
    `;
  }

  /**
   * Render individual file item
   */
  renderFileItem(file) {
    return `
      <div class="file-item">
        <span class="file-item-icon">📄</span>
        <span class="file-item-path">${this.escapeHtml(file.path)}</span>
        <div class="file-item-stats">
          ${file.additions > 0 ? `<span class="stat-add">+${file.additions}</span>` : ''}
          ${file.deletions > 0 ? `<span class="stat-remove">−${file.deletions}</span>` : ''}
        </div>
        ${this.renderParamFilter('file', file.path)}
      </div>
    `;
  }

  /**
   * Render patch preview
   */
  renderPatchPreview(patchContent) {
    const lines = patchContent.split('\n');
    const shouldCollapse = lines.length > 30;
    const id = `patch-${Math.random().toString(36).substr(2, 9)}`;
    const collapsedClass = shouldCollapse ? 'collapsed' : '';

    const formattedContent = this.formatPatchContent(patchContent);

    return `
      <div class="patch-preview">
        <div class="patch-content scrollable ${collapsedClass}" id="${id}">
${formattedContent}</div>
      </div>
      ${shouldCollapse ? `<button class="show-more-btn" data-target="${id}">show more</button>` : ''}
    `;
  }

  /**
   * Format patch content with syntax highlighting
   */
  formatPatchContent(content) {
    const lines = content.split('\n');
    
    return lines.map(line => {
      let className = 'patch-line';
      
      // Determine line type
      if (line.startsWith('diff --git') || line.startsWith('index ')) {
        className += ' header';
      } else if (line.startsWith('---') || line.startsWith('+++')) {
        className += ' file-header';
      } else if (line.startsWith('@@')) {
        className += ' hunk-header';
      } else if (line.startsWith('+')) {
        className += ' added';
      } else if (line.startsWith('-')) {
        className += ' removed';
      } else {
        className += ' context';
      }
      
      return `<div class="${className}">${this.escapeHtml(line)}</div>`;
    }).join('');
  }

  /**
   * Render apply status
   */
  renderApplyStatus(success) {
    const statusClass = success ? 'success' : 'failure';
    const icon = success ? '✓' : '✗';
    const text = success ? 'Patch applied successfully' : 'Patch failed to apply';
    
    return `
      <div class="apply-status ${statusClass}">
        <span>${icon}</span>
        <span>${text}</span>
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

customElements.define('apply-patch-widget', ApplyPatchWidget);
