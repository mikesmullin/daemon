/**
 * Ask Human Widget Component
 * Displays question with textarea for user response
 * Only "APPROVE" (case-sensitive) counts as approval
 */

import { ToolCallBase } from './tool-call-base.mjs';

export class AskHumanWidget extends ToolCallBase {
  constructor() {
    super();
  }

  /**
   * Extended styles for ask_human widget
   */
  getStyles() {
    return `
      ${super.getStyles()}

      .question {
        margin-bottom: 12px;
        padding: 12px;
        background: rgba(60, 60, 80, 0.3);
        border-left: 3px solid rgba(100, 120, 200, 0.6);
        border-radius: 4px;
        color: rgba(255, 255, 255, 0.95);
        font-size: 14px;
        line-height: 1.5;
      }

      .response-area {
        margin-top: 12px;
      }

      .response-textarea {
        width: 100%;
        min-height: 80px;
        padding: 10px;
        background: rgba(30, 30, 30, 0.8);
        border: 1px solid rgba(80, 80, 80, 0.6);
        border-radius: 4px;
        color: rgba(255, 255, 255, 0.95);
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        font-size: 13px;
        line-height: 1.5;
        resize: vertical;
        box-sizing: border-box;
      }

      .response-textarea:focus {
        outline: none;
        border-color: rgba(100, 140, 220, 0.8);
        background: rgba(35, 35, 35, 0.9);
      }

      .response-textarea::placeholder {
        color: rgba(255, 255, 255, 0.3);
      }

      .reply-button {
        margin-top: 8px;
        padding: 8px 20px;
        background: rgba(50, 120, 220, 0.8);
        border: 1px solid rgba(70, 140, 240, 0.6);
        border-radius: 4px;
        color: #fff;
        font-weight: 600;
        font-size: 13px;
        cursor: pointer;
        transition: all 0.2s ease;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }

      .reply-button:hover {
        background: rgba(60, 130, 230, 0.9);
        border-color: rgba(80, 150, 250, 0.7);
        box-shadow: 0 2px 8px rgba(50, 120, 220, 0.3);
      }

      .reply-button:active {
        transform: scale(0.98);
      }

      .reply-button:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }

      .approval-hint {
        margin-top: 8px;
        font-size: 11px;
        color: rgba(255, 255, 255, 0.4);
        font-style: italic;
      }

      .approval-hint strong {
        color: rgba(100, 200, 100, 0.8);
        font-weight: 600;
      }

      .response-display {
        margin-top: 12px;
        padding: 10px;
        background: rgba(30, 30, 30, 0.6);
        border: 1px solid rgba(80, 80, 80, 0.4);
        border-radius: 4px;
        color: rgba(255, 255, 255, 0.85);
        font-size: 13px;
        white-space: pre-wrap;
        word-break: break-word;
      }

      .response-status {
        margin-top: 6px;
        font-size: 12px;
        color: rgba(255, 255, 255, 0.5);
      }

      .response-status.approved {
        color: rgba(100, 200, 100, 0.9);
      }

      .response-status.rejected {
        color: rgba(255, 180, 100, 0.9);
      }
    `;
  }

  /**
   * Render content
   */
  renderContent() {
    const question = this.event.question || this.event.params?.question || 'No question provided';
    const isAnswered = this.event.response !== undefined || this.event.answer !== undefined;
    
    return `
      <div class="content">
        <div class="question">${this.escapeHtml(question)}</div>
        ${isAnswered ? this.renderResponse() : this.renderInput()}
      </div>
      ${this.renderActions()}
    `;
  }

  /**
   * Render input area for unanswered question
   */
  renderInput() {
    const textareaId = `response-${this.event.tool_call_id || Math.random().toString(36).substr(2, 9)}`;
    
    return `
      <div class="response-area">
        <textarea 
          class="response-textarea" 
          id="${textareaId}"
          placeholder="Type your answer here..."
          autofocus
        ></textarea>
        <div class="approval-hint">
          Tip: Reply with <strong>APPROVE</strong> (case-sensitive) to approve, or any other text to reject with explanation.
        </div>
        <button class="reply-button" data-textarea="${textareaId}">
          REPLY
        </button>
      </div>
    `;
  }

  /**
   * Render response for answered question
   */
  renderResponse() {
    const answer = this.event.response || this.event.answer || '';
    const isApproved = answer === 'APPROVE';
    const statusClass = isApproved ? 'approved' : 'rejected';
    const statusText = isApproved ? '✓ Approved' : '✗ Rejected';
    
    return `
      <div class="response-display">${this.escapeHtml(answer)}</div>
      <div class="response-status ${statusClass}">${statusText}</div>
    `;
  }

  /**
   * Attach event listeners
   */
  attachEventListeners() {
    super.attachEventListeners();

    // Handle REPLY button
    const replyBtn = this.shadowRoot.querySelector('.reply-button');
    if (replyBtn) {
      replyBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const textareaId = replyBtn.getAttribute('data-textarea');
        const textarea = this.shadowRoot.getElementById(textareaId);
        
        if (textarea) {
          const response = textarea.value.trim();
          if (response) {
            this.handleReply(response);
            replyBtn.disabled = true;
            textarea.disabled = true;
          }
        }
      });
    }

    // Auto-focus textarea
    const textarea = this.shadowRoot.querySelector('.response-textarea');
    if (textarea) {
      // Small delay to ensure it's rendered
      setTimeout(() => textarea.focus(), 100);
    }
  }

  /**
   * Handle reply submission
   */
  handleReply(response) {
    this.dispatchEvent(new CustomEvent('tool-reply', {
      bubbles: true,
      composed: true,
      detail: {
        session_id: this.event.session_id,
        tool_call_id: this.event.tool_call_id || this.event.id,
        response: response,
        approved: response === 'APPROVE'
      }
    }));
  }
}

customElements.define('ask-human-widget', AskHumanWidget);
