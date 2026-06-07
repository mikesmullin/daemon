/**
 * Terminal command parsing and allowlist checking for AI-generated commands.
 * Implements security controls similar to VSCode's chat.tools.terminal.autoApprove.
 * 
 * Features:
 * - Parse complex command lines into atomic sub-commands
 * - Check commands against allowlist/denylist rules
 * - Support for regex patterns and exact matches
 * - Handle command substitution, process substitution, pipelines, etc.
 * - YAML-based allowlist configuration
 */

import { _G } from '../../src/lib/globals.mjs';
import { existsSync } from 'fs';
import { abort, log, readYaml, writeYaml, spawnAsync } from '../../src/lib/utils.mjs';

/**
 * Default allowlist configuration
 * Matches VSCode's default chat.tools.terminal.autoApprove settings
 */
const DEFAULT_ALLOWLIST = {
  "cd": true,
  "echo": true,
  "ls": true,
  "pwd": true,
  "cat": true,
  "head": true,
  "tail": true,
  "findstr": true,
  "wc": true,
  "tr": true,
  "cut": true,
  "cmp": true,
  "which": true,
  "basename": true,
  "dirname": true,
  "realpath": true,
  "readlink": true,
  "stat": true,
  "file": true,
  "du": true,
  "df": true,
  "sleep": true,
  "git status": true,
  "git log": true,
  "git show": true,
  "git diff": true,
  "Get-ChildItem": true,
  "Get-Content": true,
  "Get-Date": true,
  "Get-Random": true,
  "Get-Location": true,
  "Write-Host": true,
  "Write-Output": true,
  "Split-Path": true,
  "Join-Path": true,
  "Start-Sleep": true,
  "Where-Object": true,
  "/^Select-[a-z0-9]/i": true,
  "/^Measure-[a-z0-9]/i": true,
  "/^Compare-[a-z0-9]/i": true,
  "/^Format-[a-z0-9]/i": true,
  "/^Sort-[a-z0-9]/i": true,
  "column": true,
  "/^column\\b.*-c\\s+[0-9]{4,}/": false,
  "date": true,
  "/^date\\b.*(-s|--set)\\b/": false,
  "find": true,
  "/^find\\b.*-(delete|exec|execdir|fprint|fprintf|fls|ok|okdir)\\b/": false,
  "grep": true,
  "/^grep\\b.*-(f|P)\\b/": false,
  "sort": true,
  "/^sort\\b.*-(o|S)\\b/": false,
  "tree": true,
  "/^tree\\b.*-o\\b/": false,
  "/\\(.+\\)/": {
    "approve": false,
    "matchCommandLine": true
  },
  "/\\{.+\\}/": {
    "approve": false,
    "matchCommandLine": true
  },
  "/`.+`/": {
    "approve": false,
    "matchCommandLine": true
  },
  "rm": false,
  "rmdir": false,
  "del": false,
  "Remove-Item": false,
  "ri": false,
  "rd": false,
  "erase": false,
  "dd": false,
  "kill": false,
  "ps": false,
  "top": false,
  "Stop-Process": false,
  "spps": false,
  "taskkill": false,
  "taskkill.exe": false,
  "curl": false,
  "wget": false,
  "Invoke-RestMethod": false,
  "Invoke-WebRequest": false,
  "irm": false,
  "iwr": false,
  "chmod": false,
  "chown": false,
  "Set-ItemProperty": false,
  "sp": false,
  "Set-Acl": false,
  "jq": false,
  "xargs": false,
  "eval": false,
  "Invoke-Expression": false,
  "iex": false
};

/**
 * Load allowlist from YAML file
 * Creates default allowlist if file doesn't exist
 * @returns {Object} Allowlist configuration
 */
export async function loadAllowlist() {
  if (null != _G.ALLOWLIST) {
    return _G.ALLOWLIST; // utilize cache
  }

  if (!existsSync(_G.ALLOWLIST_PATH)) {
    await writeYaml(_G.ALLOWLIST_PATH, DEFAULT_ALLOWLIST);
    return _G.ALLOWLIST = DEFAULT_ALLOWLIST;
  }

  return _G.ALLOWLIST = await readYaml(_G.ALLOWLIST_PATH);
}

/**
 * Parse a regex pattern from string format
 * Examples: "/pattern/", "/pattern/i", "/pattern/gi"
 * @param {string} str - Pattern string
 * @returns {RegExp|null} Compiled regex or null if not a pattern
 */
function parseRegexPattern(str) {
  const match = str.match(/^\/(.+)\/([a-z]*)$/);
  if (!match) return null;

  try {
    return new RegExp(match[1], match[2]);
  } catch (error) {
    log('warn', `⚠️  Invalid regex pattern: ${str}`);
    return null;
  }
}

/**
 * Parse command line into atomic sub-commands
 * Handles: &&, ||, ;, |, command substitution, etc.
 * 
 * @param {string} commandLine - Full command line to parse
 * @returns {Array<string>} Array of atomic commands
 */
export function parseCommandLine(commandLine) {
  const commands = [];

  // First, extract inline commands (command substitution, process substitution)
  const inlinePatterns = [
    /\$\([^)]+\)/g,      // $(command)
    /`[^`]+`/g,          // `command`
    /<\([^)]+\)/g,       // <(command)
    />\([^)]+\)/g,       // >(command)
  ];

  for (const pattern of inlinePatterns) {
    const matches = commandLine.match(pattern);
    if (matches) {
      for (const match of matches) {
        // Extract the command from the substitution syntax
        const inner = match.replace(/^(\$\(|`|[<>]\()/, '').replace(/(\)|`)$/, '');
        commands.push(inner.trim());
      }
    }
  }

  // Split by command separators: &&, ||, ;, |
  // This is simplified - a full shell parser would be more complex
  const parts = commandLine.split(/(\|\||&&|;|\|)/);

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i].trim();

    // Skip separators
    if (['||', '&&', ';', '|'].includes(part)) {
      continue;
    }

    if (part) {
      commands.push(part);
    }
  }

  return commands;
}

/**
 * Extract the base command from a command string
 * Handles paths, quotes, and arguments
 * 
 * @param {string} command - Command string
 * @returns {string} Base command
 */
function getBaseCommand(command) {
  // Remove leading ./ or bin/ etc.
  let cmd = command.trim();

  // Handle quoted commands
  if (cmd.startsWith('"') || cmd.startsWith("'")) {
    const quote = cmd[0];
    const endQuote = cmd.indexOf(quote, 1);
    if (endQuote > 0) {
      cmd = cmd.substring(1, endQuote);
    }
  }

  // Split on whitespace to get the command part
  const parts = cmd.split(/\s+/);
  const baseCmd = parts[0];

  // Normalize path separators and remove path prefixes
  return baseCmd.replace(/^\.\//, '').replace(/^\.\\/, '').replace(/\\/g, '/');
}

/**
 * Check if a command matches an allowlist rule
 * 
 * @param {string} command - Command to check
 * @param {string} pattern - Pattern from allowlist (can be string or regex)
 * @returns {boolean} True if command matches pattern
 */
function matchesPattern(command, pattern) {
  // Check if pattern is a regex
  const regex = parseRegexPattern(pattern);
  if (regex) {
    return regex.test(command);
  }

  // Exact match or starts-with match
  const baseCmd = getBaseCommand(command);
  const patternBase = getBaseCommand(pattern);

  // Check if command starts with pattern
  return command.startsWith(pattern) ||
    baseCmd === patternBase ||
    baseCmd.endsWith('/' + patternBase) ||
    baseCmd.endsWith('\\' + patternBase);
}

/**
 * Check a single command against allowlist rules
 * 
 * @param {string} command - Command to check
 * @param {Object} allowlist - Allowlist configuration
 * @param {boolean} checkFullCommand - If true, only check full command line patterns
 * @returns {Object} { approved: boolean, reason: string, matchedRule: string }
 */
function checkSingleCommand(command, allowlist, checkFullCommand = false) {
  let approved = null; // null = no match, true = approved, false = denied
  let matchedRule = null;

  // Check each rule in the allowlist
  for (const [pattern, value] of Object.entries(allowlist)) {
    const isObject = typeof value === 'object' && value !== null;

    // If this is a full command line pattern, check matchCommandLine flag
    if (isObject && checkFullCommand && !value.matchCommandLine) {
      continue;
    }

    // If we're checking sub-commands, skip matchCommandLine patterns
    if (isObject && !checkFullCommand && value.matchCommandLine) {
      continue;
    }

    // Check if command matches this pattern
    if (matchesPattern(command, pattern)) {
      matchedRule = pattern;

      if (isObject) {
        approved = value.approve;
      } else if (value === null) {
        // Unset the value (no effect)
        continue;
      } else {
        approved = value;
      }

      // If we found a deny rule, stop immediately
      if (approved === false) {
        break;
      }
    }
  }

  return {
    approved: approved === true,
    denied: approved === false,
    matchedRule,
    reason: approved === true
      ? `Approved by rule: ${matchedRule}`
      : approved === false
        ? `Denied by rule: ${matchedRule}`
        : 'No matching rule found'
  };
}

/**
 * Check a command line against the allowlist
 * Implements the full VSCode logic for sub-commands and full command line matching
 * 
 * @param {string} commandLine - Full command line to check
 * @param {Object} options - Options for checking
 * @param {Object} options.allowlist - Custom allowlist (optional, loads from file if not provided)
 * @returns {Promise<Object>} { approved: boolean, reason: string, details: Array }
 */
export async function checkCommand(commandLine, options = {}) {
  const allowlist = options.allowlist || await loadAllowlist();

  // Parse command line into sub-commands
  const subCommands = parseCommandLine(commandLine);

  // Check full command line against matchCommandLine patterns
  const fullLineCheck = checkSingleCommand(commandLine, allowlist, true);

  // Check each sub-command
  const subCommandChecks = subCommands.map(cmd => ({
    command: cmd,
    ...checkSingleCommand(cmd, allowlist, false)
  }));

  // Determine final approval status
  // Logic: Both sub-commands and full command line must not be explicitly denied,
  // then either all sub-commands OR full command line needs to be approved

  const anyDenied = fullLineCheck.denied || subCommandChecks.some(c => c.denied);
  const allSubCommandsApproved = subCommandChecks.length > 0 && subCommandChecks.every(c => c.approved);
  const fullLineApproved = fullLineCheck.approved;

  const approved = !anyDenied && (allSubCommandsApproved || fullLineApproved);

  let reason;
  if (anyDenied) {
    const deniedCheck = fullLineCheck.denied ? fullLineCheck : subCommandChecks.find(c => c.denied);
    reason = `Command denied: ${deniedCheck.reason}`;
  } else if (approved) {
    if (fullLineApproved) {
      reason = `👍🏻 Full command line approved: ${fullLineCheck.matchedRule}`;
    } else {
      reason = '👍🏻 All sub-commands approved';
    }
  } else {
    reason = '👎🏻 No matching approval rule found - requires explicit approval';
  }

  return {
    approved,
    reason,
    commandLine,
    subCommands,
    details: {
      fullLineCheck,
      subCommandChecks
    }
  };
}

/**
 * Execute a command with allowlist checking
 * 
 * @param {string} commandLine - Command to execute
 * @returns {Promise<Object>}
 */
export async function executeCommandWithCheck(commandLine) {
  let grant = '';
  const check = await checkCommand(commandLine);
  if (!check.approved) {
    // TODO: enqueue for human approval to tasks/approval.task.md
    // TODO: poll for approval status before proceeding to execute
    // return {
    //   pending: true,
    //   content: 'pending human approval',
    // }
    // grant = 'manually approved by human';
    return {
      success: false,
      content: `The user was not authorized to run this command.\nReason: ${check.reason}`,
      grant: 'auto-denied by denylist',
    };
  } else {
    grant = 'auto-approved by allowlist';
  }

  try {
    // Execute the command
    // log('info', `🔧  Executing: ${commandLine}`);

    // const result = await spawnAsync(commandLine);
    // return {
    //   success: 0 == result.exitCode,
    //   content: `${result.stdout}${result.stderr}`,
    //   result,
    //   grant,
    // };

    // stopping short of pseudo-tty, but still shell-like environment
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);
    const result = await execAsync(commandLine);
    return {
      success: true,
      content: `${result.stdout}${result.stderr}`,
      result,
      grant,
    };
  } catch (error) {
    return {
      success: false,
      content: `${error.message}`,
      result: null,
      grant,
    };
  }
}
