import { _G } from './globals.mjs';
import path from 'path';
import { mkdir, readFile, writeFile } from 'fs/promises';
import color from './colors.mjs';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { spawn } from 'child_process';
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
  const stack = new Error().stack.split('\n').slice(2).join('\n');
  log('error', `Fatal Error: ${message}\n${stack}`);
  process.exit(1);
}

// Assert with error message
export function assert(cond, message = null) {
  if (!cond) {
    if (!message) {
      const stack = new Error().stack;
      const callerLine = stack.split('\n')[2];
      const match = callerLine.match(/\((.+):(\d+):\d+\)/) || callerLine.match(/at (.+):(\d+):\d+/);
      if (match) {
        const file = path.basename(match[1]);
        const line = match[2];
        message = `${file}:${line}`;
      } else {
        message = 'unknown location';
      }
    }
    log('error', `Assertion Failed: ${message}`);
    process.exit(1);
  }
}

// Indent text with a prefix on every line
export function indent(lpad, text) {
  return text.split('\n').map(line => lpad + line).join('\n');
}

// Indent text with an icon on the first line and spaces on subsequent lines
export function indentIcon(icon, text) {
  const lines = text.split('\n');
  if (lines.length === 0) return '';

  const iconStr = String(icon);
  const visualLength = color.stripAnsi(iconStr).length;
  const padding = ' '.repeat(visualLength);

  return lines.map((line, index) => {
    return (index === 0 ? iconStr : padding) + line;
  }).join('\n');
}

// Format text as a colored blockquote with left border
export function blockquote(colorName, text) {
  const colorFn = color['open_' + colorName] || color.reset;
  const prefix = colorFn(' ┃ ');
  return indent(prefix, text);
}

// blockquote w/ icon and label
export function bqIconLabel(colorName, icon, label, text) {
  let t1 =
    indentIcon(`${icon} `,
      color[colorName](color.bold(label)) + '\n' +
      text);
  let t2 = blockquote(colorName, t1);
  return t2;
}

// Logging function with timestamp and color support
export function log(type, message) {
  if ('' == process.env.LOG || ('*' != process.env.LOG && process.env.LOG != type)) return;

  const elapsed = Date.now() - _G.startedAt;
  const seconds = Math.floor(elapsed / 1000);
  const ms = String(elapsed % 1000).padStart(3, '0');
  const timestamp = `${seconds}.${ms}`;

  let colorFn;
  let output = process.stdout;

  switch (type) {
    case 'debug':
      colorFn = color.open_blue;
      break;
    case 'info':
      colorFn = color.reset;
      break;
    case 'warn':
      colorFn = color.open_yellow;
      break;
    case 'error':
      colorFn = color.open_red;
      output = process.stderr;
      break;
    default:
      colorFn = (msg) => msg;
  }

  let indented = indentIcon(colorFn(timestamp) + ' ', message)
  output.write(indented + color.reset() + '\n');
}

// read configuration from YAML file
export async function readYaml(file, okToFail = false) {
  log('debug', `📄 Reading ${file}`);
  if (okToFail) {
    return yaml.load(await readFile(file, 'utf8'));
  } else {
    try {
      return yaml.load(await readFile(file, 'utf8'));
    } catch (error) {
      abort(`Failed to read ${file}: ${error.message}`);
    }
  }
}

export async function writeYaml(file, data) {
  try {
    log('debug', `📝 Writing ${file}`);
    const yamlStr = yaml.dump(data, {
      lineWidth: -1,           // Disable line wrapping
      noRefs: true,            // Disable anchors and aliases
      quotingType: '"',        // Use double quotes for strings
      forceQuotes: false       // Only quote strings when necessary
    });
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
  _G.STORAGE_DIR = relWS('storage');
  _G.TASKS_DIR = relWS('tasks');

  _G.CONFIG_PATH = relWS('config.yaml');
  _G.TOKENS_PATH = relWS('.tokens.yaml');
  _G.NEXT_PATH = path.join(_G.PROC_DIR, '_next');
  _G.ALLOWLIST_PATH = path.join(_G.STORAGE_DIR, 'terminal-cmd-allowlist.yaml');
}

export async function makeDirectories() {
  await mkdirp(_G.PROC_DIR);
  await mkdirp(_G.TEMPLATES_DIR);
  await mkdirp(_G.SESSIONS_DIR);
  await mkdirp(_G.WORKSPACES_DIR);
  await mkdirp(_G.STORAGE_DIR);
  await mkdirp(_G.TASKS_DIR);
}

export function outputAs(type, data, options = {}) {
  const kind = String(type || '').toLowerCase();
  const { truncate = false, truncateLength = 50, flatten = false } = options;

  // Apply truncation to data if requested
  const truncateValue = (value) => {
    if (!truncate || typeof value !== 'string') return value;
    return value.length > truncateLength ? value.substring(0, truncateLength - 3) + '...' : value;
  };

  const truncateData = (obj) => {
    if (Array.isArray(obj)) {
      return obj.map(truncateData);
    } else if (obj && typeof obj === 'object') {
      const truncated = {};
      for (const [key, value] of Object.entries(obj)) {
        truncated[key] = truncateData(value);
      }
      return truncated;
    } else {
      return truncateValue(obj);
    }
  };

  // Apply flattening to data if requested
  const flattenObject = (obj, prefix = '', separator = '.') => {
    const flattened = {};

    for (const [key, value] of Object.entries(obj)) {
      const newKey = prefix ? `${prefix}${separator}${key}` : key;

      if (value && typeof value === 'object' && !Array.isArray(value)) {
        Object.assign(flattened, flattenObject(value, newKey, separator));
      } else if (Array.isArray(value)) {
        // Handle arrays by creating indexed keys
        value.forEach((item, index) => {
          if (item && typeof item === 'object' && !Array.isArray(item)) {
            Object.assign(flattened, flattenObject(item, `${newKey}[${index}]`, separator));
          } else {
            flattened[`${newKey}[${index}]`] = item;
          }
        });
      } else {
        flattened[newKey] = value;
      }
    }

    return flattened;
  };

  const flattenData = (obj) => {
    if (Array.isArray(obj)) {
      return obj.map(item => {
        if (item && typeof item === 'object' && !Array.isArray(item)) {
          return flattenObject(item);
        }
        return item;
      });
    } else if (obj && typeof obj === 'object') {
      return flattenObject(obj);
    } else {
      return obj;
    }
  };

  let processedData = data;
  if (truncate) processedData = truncateData(processedData);
  if (flatten) processedData = flattenData(processedData);

  if (kind === 'json') {
    return JSON.stringify(processedData, null, 2);
  }

  if (kind === 'yaml') {
    return yaml.dump(processedData);
  }

  // Normalize to array of row objects
  let rows;
  if (Array.isArray(processedData)) {
    rows = processedData;
  } else if (processedData && typeof processedData === 'object') {
    rows = [processedData];
  } else {
    rows = [{ value: processedData }];
  }

  // Derive column keys
  const keys = Array.from(
    rows.reduce((set, row) => {
      if (row && typeof row === 'object' && !Array.isArray(row)) {
        Object.keys(row).forEach(k => set.add(k));
      } else {
        set.add('value');
      }
      return set;
    }, new Set())
  );

  const formatCell = (v) => {
    if (v === null || v === undefined) return '';
    if (typeof v === 'object') return JSON.stringify(v);
    return String(v);
  };

  if (kind === 'table') {
    if (rows.length === 0) return '';

    // Calculate column widths
    const colWidths = keys.map((key, i) => {
      const headerWidth = key.length;
      const dataWidths = rows.map(r => {
        const rowObj = (r && typeof r === 'object' && !Array.isArray(r)) ? r : { value: r };
        return formatCell(rowObj[key]).replace(/\|/g, '\\|').replace(/\n/g, '<br>').length;
      });
      return Math.max(headerWidth, ...dataWidths);
    });

    // Format header
    const header = keys.map((k, i) => k.padEnd(colWidths[i])).join(' | ');

    // Format separator
    const separator = colWidths.map(w => '-'.repeat(w)).join('-|-');

    // Format body
    const body = rows
      .map(r => {
        const rowObj = (r && typeof r === 'object' && !Array.isArray(r)) ? r : { value: r };
        return keys.map((k, i) =>
          formatCell(rowObj[k]).replace(/\|/g, '\\|').replace(/\n/g, '<br>').padEnd(colWidths[i])
        ).join(' | ');
      })
      .join('\n');

    return `${header}\n${separator}\n${body}`;
  }

  if (kind === 'csv') {
    if (rows.length === 0) return '';
    const esc = (v) => {
      let s = formatCell(v);
      if (/[",\n]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
      return s;
    };
    const header = keys.join(',');
    const body = rows
      .map(r => {
        const rowObj = (r && typeof r === 'object' && !Array.isArray(r)) ? r : { value: r };
        return keys.map(k => esc(rowObj[k])).join(',');
      })
      .join('\n');
    return `${header}\n${body}`;
  }

  abort(`Unsupported output type: ${type}`);
}

// convert Unix timestamp to ISO string
export function unixToIso(unixTimestamp) {
  return new Date(unixTimestamp * 1000).toISOString();
}

// get current Unix timestamp
export function unixTime() {
  return Math.floor(Date.now() / 1000);
}

// Helper function to run commands with spawn and capture exit code
export function spawnAsync(command, args = []) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args);
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', (exitCode) => {
      resolve({
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        exitCode
      });
    });

    child.on('error', (error) => {
      reject(error);
    });
  });
};

export function logThought(text) {
  console.log('');
  log('info', bqIconLabel('gray', '🧠', color.indigo('Thinking...'), text));
  console.log('');
}

export function logAssistant(text) {
  console.log('');
  log('info', bqIconLabel('cyan', '🤖', color.red('Assistant'), text));
  console.log('');
}

export function logUser(text) {
  console.log('');
  log('info', bqIconLabel('constructionYellow', '🧑', ('User'), text));
  console.log('');
}

export function logShell(text) {
  console.log('');
  // log('info', bqIconLabel('moneyGreen', '🐚', 'Tool: execute_shell', 'podman ps'));
  log('info', blockquote('moneyGreen', `🐚 $ ${text}`));
  console.log('');
}

export default {
  mkdirp,
  relWS,
  abort,
  assert,
  indent,
  indentIcon,
  blockquote,
  bqIconLabel,
  log,
  readYaml,
  writeYaml,
  initializeDirectories,
  makeDirectories,
  outputAs,
  unixToIso,
  unixTime,
  spawnAsync,
  logThought,
  logAssistant,
  logUser,
  logShell,
};