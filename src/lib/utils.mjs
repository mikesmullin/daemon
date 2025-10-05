import path from 'path';
import { mkdir } from 'fs/promises';
import color from './colors.mjs';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { _G } from './globals.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Create directory and parent directories if they don't exist
export const mkdirp = (path) => mkdir(path, { recursive: true });

// Convert path components to a path relative to workspace root, then make it relative to cwd
export function relWS(...pathComponents) {
  const absolutePath = path.join(__dirname, '..', '..', ...pathComponents);
  return path.relative(process.cwd(), absolutePath);
}

// Abort with error message
export function abort(message) {
  console.error(`Fatal Error: ${message}`);
  process.exit(1);
}

// Logging function with timestamp and color support
export function log(type, message) {
  const elapsed = Date.now() - _G.startedAt;
  const seconds = Math.floor(elapsed / 1000);
  const ms = String(elapsed % 1000).padStart(3, '0');
  const timestamp = `${seconds}.${ms}`;

  let colorFn;
  let output = process.stdout;

  switch (type) {
    case 'debug':
      colorFn = color.blue;
      break;
    case 'info':
      colorFn = color.reset;
      break;
    case 'warn':
      colorFn = color.yellow;
      break;
    case 'error':
      colorFn = color.red;
      output = process.stderr;
      break;
    default:
      colorFn = (msg) => msg;
  }

  output.write(colorFn(`${timestamp} ${message}\n`));
}