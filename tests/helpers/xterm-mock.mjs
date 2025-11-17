// Mock for xterm.js library
export class Terminal {
  constructor(options = {}) {
    this.options = options;
    this.element = document.createElement('div');
    this.element.className = 'xterm-mock';
    this._data = '';
  }

  open(container) {
    container.appendChild(this.element);
  }

  write(data) {
    this._data += data;
  }

  writeln(data) {
    this._data += data + '\n';
  }

  clear() {
    this._data = '';
  }

  dispose() {
    if (this.element.parentNode) {
      this.element.parentNode.removeChild(this.element);
    }
  }

  onData(callback) {
    this._onDataCallback = callback;
  }

  focus() {
    // Mock focus
  }

  fit() {
    // Mock fit addon
  }

  resize(cols, rows) {
    // Mock resize
  }
}

export class FitAddon {
  constructor() {
    // Mock fit addon
  }

  fit() {
    // Mock fit
  }

  activate(terminal) {
    terminal.fit = () => this.fit();
  }
}

// Mock the global xterm if needed
if (typeof window !== 'undefined') {
  window.Terminal = Terminal;
  window.FitAddon = FitAddon;
}

export default { Terminal, FitAddon };
