/**
 * Speak to Human Widget Component
 * Displays spoken text with audio player (if output_file is provided)
 */

import { ToolCallBase } from './tool-call-base.mjs';

export class SpeakHumanWidget extends ToolCallBase {
  constructor() {
    super();
  }

  /**
   * Get tool icon - override to use speaker emoji
   */
  getToolIcon() {
    return '🔊';
  }

  /**
   * Extended styles for speak_to_human widget
   */
  getStyles() {
    return `
      ${super.getStyles()}

      .spoken-text {
        margin-bottom: 12px;
        padding: 12px;
        background: rgba(60, 80, 60, 0.3);
        border-left: 3px solid rgba(100, 200, 100, 0.6);
        border-radius: 4px;
        color: rgba(255, 255, 255, 0.95);
        font-size: 14px;
        line-height: 1.5;
        font-style: italic;
      }

      .voice-preset {
        margin-bottom: 8px;
        font-size: 12px;
        color: rgba(255, 255, 255, 0.5);
      }

      .voice-preset strong {
        color: rgba(255, 255, 255, 0.7);
        font-weight: 500;
      }

      .audio-player {
        margin-top: 12px;
        padding: 12px;
        background: rgba(30, 30, 30, 0.6);
        border: 1px solid rgba(80, 80, 80, 0.4);
        border-radius: 6px;
      }

      .audio-controls {
        display: flex;
        align-items: center;
        gap: 12px;
      }

      .play-button {
        width: 32px;
        height: 32px;
        border: none;
        background: rgba(100, 200, 100, 0.8);
        color: #fff;
        border-radius: 50%;
        cursor: pointer;
        font-size: 14px;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s ease;
        flex-shrink: 0;
      }

      .play-button:hover {
        background: rgba(120, 220, 120, 0.9);
        box-shadow: 0 2px 8px rgba(100, 200, 100, 0.3);
      }

      .play-button:active {
        transform: scale(0.95);
      }

      .play-button.playing {
        background: rgba(220, 120, 60, 0.8);
      }

      .play-button.playing:hover {
        background: rgba(240, 140, 80, 0.9);
      }

      .scrubber-container {
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 4px;
      }

      .scrubber {
        width: 100%;
        height: 6px;
        background: rgba(60, 60, 60, 0.6);
        border-radius: 3px;
        position: relative;
        cursor: pointer;
      }

      .scrubber-progress {
        height: 100%;
        background: rgba(100, 200, 100, 0.8);
        border-radius: 3px;
        transition: width 0.1s linear;
      }

      .time-display {
        display: flex;
        justify-content: space-between;
        font-size: 11px;
        color: rgba(255, 255, 255, 0.5);
        font-family: 'Monaco', 'Menlo', 'Consolas', monospace;
      }

      .audio-placeholder {
        margin-top: 12px;
        padding: 12px;
        background: rgba(60, 60, 60, 0.2);
        border: 1px dashed rgba(80, 80, 80, 0.4);
        border-radius: 6px;
        text-align: center;
        color: rgba(255, 255, 255, 0.4);
        font-size: 12px;
        font-style: italic;
      }

      audio {
        display: none;
      }
    `;
  }

  /**
   * Render content
   */
  renderContent() {
    const text = this.event.text || this.event.params?.text || 'No text provided';
    const preset = this.event.preset || this.event.params?.preset || 'default';
    const outputFile = this.event.output_file || this.event.params?.output_file;
    
    return `
      <div class="content">
        <div class="voice-preset">Voice: <strong>${this.escapeHtml(preset)}</strong></div>
        <div class="spoken-text">"${this.escapeHtml(text)}"</div>
        ${outputFile ? this.renderAudioPlayer(outputFile) : this.renderPlaceholder()}
      </div>
      ${this.renderActions()}
    `;
  }

  /**
   * Render audio player with custom controls
   */
  renderAudioPlayer(audioFile) {
    const audioId = `audio-${Math.random().toString(36).substr(2, 9)}`;
    
    return `
      <div class="audio-player">
        <audio id="${audioId}" src="${this.escapeHtml(audioFile)}"></audio>
        <div class="audio-controls">
          <button class="play-button" data-audio="${audioId}">▶</button>
          <div class="scrubber-container">
            <div class="scrubber" data-audio="${audioId}">
              <div class="scrubber-progress" style="width: 0%"></div>
            </div>
            <div class="time-display">
              <span class="current-time">0:00</span>
              <span class="total-time">0:00</span>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Render placeholder when no audio file is available
   */
  renderPlaceholder() {
    return `
      <div class="audio-placeholder">
        Audio playback not available (no output file provided)
      </div>
    `;
  }

  /**
   * Format time in MM:SS format
   */
  formatTime(seconds) {
    if (isNaN(seconds) || !isFinite(seconds)) {
      return '0:00';
    }
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  /**
   * Attach event listeners
   */
  attachEventListeners() {
    super.attachEventListeners();

    const playBtn = this.shadowRoot.querySelector('.play-button');
    if (!playBtn) return;

    const audioId = playBtn.getAttribute('data-audio');
    const audio = this.shadowRoot.getElementById(audioId);
    if (!audio) return;

    const scrubber = this.shadowRoot.querySelector('.scrubber');
    const progress = this.shadowRoot.querySelector('.scrubber-progress');
    const currentTimeEl = this.shadowRoot.querySelector('.current-time');
    const totalTimeEl = this.shadowRoot.querySelector('.total-time');

    // Play/Pause button
    playBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (audio.paused) {
        audio.play().catch(err => console.warn('Audio play failed:', err));
        playBtn.textContent = '⏸';
        playBtn.classList.add('playing');
      } else {
        audio.pause();
        playBtn.textContent = '▶';
        playBtn.classList.remove('playing');
      }
    });

    // Update time and progress
    audio.addEventListener('timeupdate', () => {
      const percent = (audio.currentTime / audio.duration) * 100;
      progress.style.width = `${percent}%`;
      currentTimeEl.textContent = this.formatTime(audio.currentTime);
    });

    // Set total time when metadata loads
    audio.addEventListener('loadedmetadata', () => {
      totalTimeEl.textContent = this.formatTime(audio.duration);
    });

    // Reset button when audio ends
    audio.addEventListener('ended', () => {
      playBtn.textContent = '▶';
      playBtn.classList.remove('playing');
      progress.style.width = '0%';
      currentTimeEl.textContent = '0:00';
    });

    // Scrubber click to seek
    scrubber.addEventListener('click', (e) => {
      e.stopPropagation();
      const rect = scrubber.getBoundingClientRect();
      const percent = (e.clientX - rect.left) / rect.width;
      audio.currentTime = percent * audio.duration;
    });

    // Auto-play (catch errors gracefully if browser blocks it)
    // Note: Auto-play might be blocked by browser policies
    setTimeout(() => {
      audio.play().catch(err => {
        // Silently fail if auto-play is blocked
        console.debug('Auto-play blocked:', err.message);
      });
    }, 100);
  }
}

customElements.define('speak-human-widget', SpeakHumanWidget);
