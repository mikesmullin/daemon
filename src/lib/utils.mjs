import path from 'path';
import { mkdir, readFile, writeFile } from 'fs/promises';
import color from './colors.mjs';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { _G } from './globals.mjs';
import yaml from 'js-yaml';

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
  log('error', `Fatal Error: ${message}`);
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

// read configuration from YAML file
export async function readYaml(file) {
  try {
    log('debug', `📄 Reading ${file}`);
    return yaml.load(await readFile(file, 'utf8'));
  } catch (error) {
    abort(`Failed to read ${file}: ${error.message}`);
  }
}

export async function writeYaml(file, data) {
  try {
    log('debug', `📝 Writing ${file}`);
    const yamlStr = yaml.dump(data);
    await writeFile(file, yamlStr, 'utf8');
  } catch (error) {
    abort(`Failed to write ${file}: ${error.message}`);
  }
}

// initialize directory skeleton on first run
export function initializeDirectories() {
  _G.PROC_DIR = relWS('agents', 'proc');
  _G.TEMPLATES_DIR = relWS('agents', 'templates');
  _G.SESSIONS_DIR = relWS('agents', 'sessions');
  _G.WORKSPACES_DIR = relWS('agents', 'workspaces');

  _G.CONFIG_PATH = relWS('config.yaml');
  _G.TOKENS_PATH = relWS('.tokens.yaml');
  _G.NEXT_PATH = path.join(_G.PROC_DIR, '_next');
}

export async function makeDirectories() {
  await mkdirp(_G.PROC_DIR);
  await mkdirp(_G.TEMPLATES_DIR);
  await mkdirp(_G.SESSIONS_DIR);
  await mkdirp(_G.WORKSPACES_DIR);
}