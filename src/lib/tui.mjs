/**
 * Terminal User Interface (TUI) Components
 * 
 * Custom TUI implementation using Node.js raw mode for interactive prompts.
 * Inspired by Claude Code's prompt interface.
 */

import process from 'process';
import { log } from './utils.mjs';

// ANSI color codes
const colors = {
  border: '\x1b[38;2;64;64;64m',        // #404040
  inputText: '\x1b[38;2;211;215;207m',  // #d3d7cf
  menuText: '\x1b[38;2;105;107;103m',   // #696b67
  error: '\x1b[38;2;255;135;175m',      // #ff87af
  greyHighlight: '\x1b[38;2;248;248;248;48;2;58;58;58m', // fg #f8f8f8 bg #3a3a3a
  selectedCommand: '\x1b[38;2;175;215;255m', // #afd7ff - light blue for selected items
  reset: '\x1b[0m',
};

// Registry for shortcuts and commands
const shortcuts = new Map();
const commands = new Map();

/**
 * Register a shortcut that appears in help text when user types '?'
 * @param {string} key - The shortcut key (e.g., '@', '#', '!')
 * @param {string} description - Description of what the shortcut does
 */
export function registerShortcut(key, description) {
  shortcuts.set(key, description);
}

/**
 * Register a command that appears in help text when user types '/'
 * @param {string} command - The command name (e.g., 'help', 'exit')
 * @param {string} description - Description of what the command does
 * @param {string[]} aliases - Alternative names for the command
 */
export function registerCommand(command, description, aliases = []) {
  commands.set(command, { description, aliases });
}

// Initialize default shortcuts and commands
function initializeDefaults() {
  // Default shortcut
  registerShortcut('@', 'for agent names');

  // Default commands
  registerCommand('help', 'Show help information', []);
  registerCommand('exit', 'Exit the REPL', ['quit']);
  registerCommand('clear', 'Clear conversation history and free up context', ['reset', 'new']);
}

initializeDefaults();

/**
 * Multi-line textarea input component
 * Supports pasting, editing, shortcuts, and commands
 */
export class TextAreaInput {
  constructor(options = {}) {
    this.promptText = options.prompt || '> ';
    this.placeholder = options.placeholder || '';
    this.buffer = '';
    this.cursorPos = 0;
    this.helpMode = null; // null, 'shortcuts', 'commands'
    this.ctrlCPressCount = 0;
    this.ctrlCTimeout = null;
    this.pasteTimeout = null;
    this.isPasting = false;
    this.lines = [''];
    this.cursorLine = 0;
    this.cursorCol = 0;
    this.terminalWidth = process.stdout.columns || 80;
    this.terminalHeight = process.stdout.rows || 24;
    this.closed = false;
    this.hasRendered = false;
    this.selectedCommandIndex = 0;
    this.commandScrollOffset = 0;
    this.maxVisibleCommands = 10;
    this.lastRenderedLines = 0; // Track how many lines were rendered last time
  }

  /**
   * Get the terminal width for drawing borders
   */
  getTerminalWidth() {
    return process.stdout.columns || 80;
  }

  /**
   * Get the terminal height
   */
  getTerminalHeight() {
    return process.stdout.rows || 24;
  }

  /**
   * Draw a horizontal line across the terminal
   */
  drawLine() {
    return colors.border + '─'.repeat(this.getTerminalWidth()) + colors.reset;
  }

  /**
   * Render the help text based on current mode
   */
  renderHelpText() {
    if (this.ctrlCPressCount === 1) {
      return colors.error + '  Press Ctrl+C again to exit' + colors.reset;
    }

    if (this.helpMode === 'shortcuts') {
      const shortcutLines = [];
      for (const [key, desc] of shortcuts) {
        shortcutLines.push(`${key} ${desc}`);
      }

      // Format in columns (similar to Claude Code)
      const col1 = [];
      const col2 = [];
      let i = 0;
      for (const line of shortcutLines) {
        if (i % 2 === 0) {
          col1.push(line);
        } else {
          col2.push(line);
        }
        i++;
      }

      // Add placeholder shortcuts
      col1.push('! for bash mode');
      col1.push('/ for commands');
      col2.push('double tap esc to clear input');
      col2.push('shift + tab to auto-accept edits');
      col2.push('ctrl + _ to undo');

      const lines = [];
      for (let j = 0; j < Math.max(col1.length, col2.length); j++) {
        const left = (col1[j] || '').padEnd(30);
        const right = col2[j] || '';
        lines.push(colors.menuText + '  ' + left + right + colors.reset);
      }

      lines.push(colors.menuText + '                        shift + ⏎ for newline' + colors.reset);
      return lines.join('\n');
    }

    if (this.helpMode === 'commands') {
      // Build command list with placeholders
      const allCommands = [];

      for (const [cmd, info] of commands) {
        const aliases = info.aliases.length > 0 ? ` (${info.aliases.join(', ')})` : '';
        allCommands.push({
          text: `/${cmd}${aliases}`,
          description: info.description,
        });
      }

      // Add placeholder commands
      allCommands.push({ text: '/add-dir', description: 'Add a new working directory' });
      allCommands.push({ text: '/agents', description: 'Manage agent configurations' });
      allCommands.push({ text: '/config (theme)', description: 'Open config panel' });
      allCommands.push({ text: '/context', description: 'Visualize current context usage' });

      // Sort alphabetically
      allCommands.sort((a, b) => a.text.localeCompare(b.text));

      // Calculate visible window
      const maxVisible = Math.min(this.maxVisibleCommands, allCommands.length);
      const availableHeight = this.getTerminalHeight() - 6; // Reserve space for prompt and borders
      const actualMaxVisible = Math.min(maxVisible, availableHeight);

      // Adjust scroll offset if needed
      if (this.selectedCommandIndex < this.commandScrollOffset) {
        this.commandScrollOffset = this.selectedCommandIndex;
      }
      if (this.selectedCommandIndex >= this.commandScrollOffset + actualMaxVisible) {
        this.commandScrollOffset = this.selectedCommandIndex - actualMaxVisible + 1;
      }

      const visibleCommands = allCommands.slice(
        this.commandScrollOffset,
        this.commandScrollOffset + actualMaxVisible
      );

      const commandLines = [];
      for (let i = 0; i < visibleCommands.length; i++) {
        const actualIndex = this.commandScrollOffset + i;
        const cmd = visibleCommands[i];
        const cmdText = cmd.text.padEnd(40);
        const isSelected = actualIndex === this.selectedCommandIndex;

        if (isSelected) {
          commandLines.push(colors.selectedCommand + '  ' + cmdText + cmd.description + colors.reset);
        } else {
          commandLines.push(colors.menuText + '  ' + cmdText + cmd.description + colors.reset);
        }
      }

      return commandLines.join('\n');
    }

    // Only show "? for shortcuts" hint when input is completely empty
    if (this.getCurrentText() === '') {
      return colors.menuText + '  ? for shortcuts' + colors.reset;
    }
    
    return '';
  }

  /**
   * Render the entire prompt interface
   */
  render() {
    // Calculate how many lines we need for current content
    const inputLines = this.lines.length;
    const borderLines = 3; // top border, bottom border, padding line
    const helpLines = this.helpMode ? this.renderHelpText().split('\n').length : 1;
    const totalLines = borderLines + inputLines + helpLines;

    // Clear screen only on first render
    if (!this.hasRendered) {
      process.stdout.write('\x1b[2J\x1b[H');
      this.hasRendered = true;
    } else {
      // Move to home position
      process.stdout.write('\x1b[H');

      // Clear all previously rendered lines to handle terminal resize and content changes
      // We need to clear at least as many lines as we rendered last time
      const linesToClear = Math.max(this.lastRenderedLines, totalLines, this.terminalHeight);
      for (let i = 0; i < linesToClear; i++) {
        process.stdout.write('\x1b[K\n'); // Clear line and move down
      }

      // Move back to home position
      process.stdout.write('\x1b[H');
    }

    // Store how many lines we're rendering
    this.lastRenderedLines = totalLines;

    // Add padding line above prompt
    process.stdout.write('\n');

    // Draw top border
    process.stdout.write(this.drawLine() + '\n');

    // Draw input area with lines
    if (this.lines.length === 1 && this.lines[0] === '') {
      // Empty input with colored cursor
      process.stdout.write(this.promptText + colors.inputText + '\x1b[7m \x1b[0m' + '\x1b[K\n');
    } else {
      for (let i = 0; i < this.lines.length; i++) {
        const prefix = i === 0 ? this.promptText : '  ';
        const line = this.lines[i];

        // Show cursor on current line
        if (i === this.cursorLine) {
          const before = line.substring(0, this.cursorCol);
          const after = line.substring(this.cursorCol);
          const cursor = after.length > 0 ? after[0] : ' ';
          const rest = after.substring(1);

          process.stdout.write(
            prefix +
            colors.inputText + before +
            '\x1b[7m' + cursor + '\x1b[0m' +
            colors.inputText + rest + colors.reset +
            '\x1b[K\n'
          );
        } else {
          process.stdout.write(prefix + colors.inputText + line + colors.reset + '\x1b[K\n');
        }
      }
    }

    // Draw bottom border
    process.stdout.write(this.drawLine() + '\n');

    // Draw help text
    process.stdout.write(this.renderHelpText() + '\n');
  }

  /**
   * Handle keyboard input
   */
  handleKey(data) {
    const key = data.toString();

    // Reset Ctrl+C timeout if any key other than Ctrl+C is pressed
    if (key !== '\x03') {
      if (this.ctrlCTimeout) {
        clearTimeout(this.ctrlCTimeout);
        this.ctrlCTimeout = null;
      }
      this.ctrlCPressCount = 0;
    }

    // Ctrl+C handling
    if (key === '\x03') {
      this.ctrlCPressCount++;

      if (this.ctrlCPressCount === 1) {
        // First press: clear input if there is any, otherwise show warning
        if (this.getCurrentText().trim()) {
          this.lines = [''];
          this.cursorLine = 0;
          this.cursorCol = 0;
          this.helpMode = null;
          this.ctrlCPressCount = 0;
          this.render();
          return;
        } else {
          // Show warning
          this.render();

          // Set timeout for second press
          this.ctrlCTimeout = setTimeout(() => {
            this.ctrlCPressCount = 0;
            this.render();
          }, 2000);
          return;
        }
      } else if (this.ctrlCPressCount >= 2) {
        // Second press: exit
        this.close();
        process.exit(0);
      }
      return;
    }

    // Enter key - submit or newline
    if (key === '\r' || key === '\n') {
      // Check if we're in a paste operation
      if (this.isPasting) {
        // Part of paste, insert newline
        this.insertNewline();
        this.render();
        return;
      }

      // Close shortcuts help mode on Enter
      if (this.helpMode === 'shortcuts') {
        this.helpMode = null;
        this.render();
        return;
      }

      // If in command menu and a command is selected, insert it
      if (this.helpMode === 'commands' && this.selectedCommandIndex >= 0) {
        const allCommands = [
          ...Array.from(commands.entries()).map(([name, data]) => ({
            text: name,
            description: data.description
          })),
          { text: 'placeholder1', description: 'Coming soon...' },
          { text: 'placeholder2', description: 'Coming soon...' },
          { text: 'placeholder3', description: 'Coming soon...' },
          { text: 'placeholder4', description: 'Coming soon...' }
        ];

        if (this.selectedCommandIndex < allCommands.length) {
          const selectedCmd = allCommands[this.selectedCommandIndex];
          // Don't insert placeholder commands
          if (!selectedCmd.text.startsWith('placeholder')) {
            this.lines[0] = '/' + selectedCmd.text + ' ';
            this.cursorCol = this.lines[0].length;
            this.helpMode = null;
            this.selectedCommandIndex = 0;
            this.render();
            return;
          }
        }
      }

      // Normal enter - submit
      this.submit();
      return;
    }

    // Backspace
    if (key === '\x7f' || key === '\b') {
      // Close shortcuts help mode on backspace
      if (this.helpMode === 'shortcuts') {
        this.helpMode = null;
        this.render();
        return;
      }
      
      this.deleteChar();
      this.render();
      return;
    }

    // Arrow keys
    if (key === '\x1b[A') { // Up
      if (this.helpMode === 'commands') {
        // Navigate command menu
        if (this.selectedCommandIndex > 0) {
          this.selectedCommandIndex--;
        }
        this.render();
        return;
      }
      this.moveCursorUp();
      this.render();
      return;
    }
    if (key === '\x1b[B') { // Down
      if (this.helpMode === 'commands') {
        // Navigate command menu
        // Count total commands
        let totalCommands = commands.size + 4; // +4 for placeholder commands
        if (this.selectedCommandIndex < totalCommands - 1) {
          this.selectedCommandIndex++;
        }
        this.render();
        return;
      }
      this.moveCursorDown();
      this.render();
      return;
    }
    if (key === '\x1b[C') { // Right
      this.moveCursorRight();
      this.render();
      return;
    }
    if (key === '\x1b[D') { // Left
      this.moveCursorLeft();
      this.render();
      return;
    }

    // Tab key
    if (key === '\t') {
      // Could be used for autocomplete in the future
      return;
    }

    // Ctrl+D - submit
    if (key === '\x04') {
      this.submit();
      return;
    }

    // Regular character input
    if (key.length === 1 || key.length > 3) {
      // Detect paste: multiple characters at once
      if (key.length > 1) {
        this.handlePaste(key);
      } else {
        // Handle '?' as first character to show shortcuts
        if (key === '?' && this.getCurrentText() === '' && this.cursorLine === 0 && this.cursorCol === 0) {
          this.helpMode = 'shortcuts';
          this.render();
          return;
        }

        // Close shortcuts help on any other character
        if (this.helpMode === 'shortcuts') {
          this.helpMode = null;
        }

        this.insertChar(key);

        // Update help mode based on input
        this.updateHelpMode();
      }
      this.render();
      return;
    }
  }

  /**
   * Handle paste operation
   */
  handlePaste(text) {
    // Mark as pasting
    this.isPasting = true;

    // Clear existing paste timeout
    if (this.pasteTimeout) {
      clearTimeout(this.pasteTimeout);
    }

    // Insert pasted text
    for (const char of text) {
      if (char === '\n' || char === '\r') {
        this.insertNewline();
      } else {
        this.insertChar(char);
      }
    }

    // Set timeout to end paste mode
    this.pasteTimeout = setTimeout(() => {
      this.isPasting = false;
      this.pasteTimeout = null;
    }, 300);
  }

  /**
   * Insert a character at cursor position
   */
  insertChar(char) {
    const currentLine = this.lines[this.cursorLine];
    this.lines[this.cursorLine] =
      currentLine.substring(0, this.cursorCol) +
      char +
      currentLine.substring(this.cursorCol);
    this.cursorCol++;
  }

  /**
   * Insert a newline at cursor position
   */
  insertNewline() {
    const currentLine = this.lines[this.cursorLine];
    const before = currentLine.substring(0, this.cursorCol);
    const after = currentLine.substring(this.cursorCol);

    this.lines[this.cursorLine] = before;
    this.lines.splice(this.cursorLine + 1, 0, after);
    this.cursorLine++;
    this.cursorCol = 0;
  }

  /**
 * Delete character at cursor
 */
  deleteChar() {
    if (this.cursorCol > 0) {
      const line = this.lines[this.cursorLine];
      this.lines[this.cursorLine] = line.substring(0, this.cursorCol - 1) + line.substring(this.cursorCol);
      this.cursorCol--;

      // Close command menu if we backspaced the '/' completely
      if (this.helpMode === 'commands' && !this.lines[0].startsWith('/')) {
        this.helpMode = null;
        this.selectedCommandIndex = 0;
        this.commandScrollOffset = 0;
      }
    } else if (this.cursorLine > 0) {
      // Merge with previous line
      const currentLine = this.lines[this.cursorLine];
      this.cursorLine--;
      this.cursorCol = this.lines[this.cursorLine].length;
      this.lines[this.cursorLine] += currentLine;
      this.lines.splice(this.cursorLine + 1, 1);
    }
  }

  /**
   * Move cursor up
   */
  moveCursorUp() {
    if (this.cursorLine > 0) {
      this.cursorLine--;
      this.cursorCol = Math.min(this.cursorCol, this.lines[this.cursorLine].length);
    }
  }

  /**
   * Move cursor down
   */
  moveCursorDown() {
    if (this.cursorLine < this.lines.length - 1) {
      this.cursorLine++;
      this.cursorCol = Math.min(this.cursorCol, this.lines[this.cursorLine].length);
    }
  }

  /**
   * Move cursor left
   */
  moveCursorLeft() {
    if (this.cursorCol > 0) {
      this.cursorCol--;
    } else if (this.cursorLine > 0) {
      this.cursorLine--;
      this.cursorCol = this.lines[this.cursorLine].length;
    }
  }

  /**
   * Move cursor right
   */
  moveCursorRight() {
    if (this.cursorCol < this.lines[this.cursorLine].length) {
      this.cursorCol++;
    } else if (this.cursorLine < this.lines.length - 1) {
      this.cursorLine++;
      this.cursorCol = 0;
    }
  }

  /**
   * Update help mode based on current input
   */
  updateHelpMode() {
    const text = this.getCurrentText();
    const firstLine = this.lines[0];

    // Only activate shortcuts mode for '?' as the very first character
    if (text === '?' && this.cursorLine === 0 && this.cursorCol === 1) {
      this.helpMode = 'shortcuts';
    }
    // Only activate commands mode for '/' as the first character
    else if (firstLine.startsWith('/') && firstLine.length > 0) {
      this.helpMode = 'commands';
      this.selectedCommandIndex = 0;
      this.commandScrollOffset = 0;
    }
    // Clear help mode when input is empty
    else if (text === '') {
      this.helpMode = null;
      this.selectedCommandIndex = 0;
      this.commandScrollOffset = 0;
    }
    // Close shortcuts mode on any other input
    else if (this.helpMode === 'shortcuts' && text !== '?') {
      this.helpMode = null;
    }
  }

  /**
   * Get current text from all lines
   */
  getCurrentText() {
    return this.lines.join('\n');
  }

  /**
   * Submit the input
   */
  submit() {
    const text = this.getCurrentText().trim();

    // Don't submit if only showing help
    if (text === '?' || text === '/') {
      return;
    }

    this.close();
    this.onSubmit(text);
  }

  /**
   * Close the input and restore terminal
   */
  close() {
    if (this.closed) return;
    this.closed = true;

    // Restore terminal
    if (process.stdin.setRawMode) {
      process.stdin.setRawMode(false);
    }
    process.stdin.pause();

    // Clear screen
    process.stdout.write('\x1b[2J\x1b[H');
  }

  /**
   * Start the input prompt
   * Returns a Promise that resolves with the user's input
   */
  prompt() {
    return new Promise((resolve) => {
      this.onSubmit = (text) => {
        resolve(text);
      };

      // Setup terminal
      if (process.stdin.setRawMode) {
        process.stdin.setRawMode(true);
      }
      process.stdin.setEncoding('utf8');
      process.stdin.resume();

      // Handle resize
      process.stdout.on('resize', () => {
        this.terminalWidth = process.stdout.columns || 80;
        this.terminalHeight = process.stdout.rows || 24;
        if (!this.closed) {
          this.render();
        }
      });

      // Handle input
      const handleData = (data) => {
        if (this.closed) {
          process.stdin.off('data', handleData);
          return;
        }
        this.handleKey(data);
      };

      process.stdin.on('data', handleData);

      // Initial render
      this.render();
    });
  }
}

/**
 * Simple prompt function for quick usage
 * @param {string} promptText - The prompt text to display
 * @returns {Promise<string>} The user's input
 */
export async function prompt(promptText = '> ') {
  const input = new TextAreaInput({ prompt: promptText });
  return await input.prompt();
}
