// File Operations
//
// Basic File Operations:
// - create_file(filePath, content) // Create a new file with the specified content
// - list_directory(path, glob_pattern?, depth?) // List files/folders with optional glob filtering and recursion depth
// - create_directory(dirPath) // Create a new directory
// - grep_search(query, isRegexp, includePattern?, maxResults?) // Search for text in files (literal or regex)
// - open_file(filePath) // Open a file in VS Code editor
//
// Safe File Editing Tools:
// - view_file(filePath, lineStart?, lineEnd?) // Safely view file contents with read tracking (supports negative line indices)
// - edit_file(filePath, oldString, newString?) // Precisely edit files with safety validation
// - apply_patch(filePath, patch, dryRun?) // Apply unified diff patches with validation
//

import { _G } from '../lib/globals.mjs';
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync, statSync, appendFileSync, openSync, readSync, closeSync } from 'fs';
import { join, dirname, relative } from 'path';
import { spawnSync } from 'child_process';
import { createHash } from 'crypto';
import utils from '../lib/utils.mjs';
import minimatchPkg from 'minimatch';
const { Minimatch } = minimatchPkg;

// File tracking system for safety (persistent across daemon restarts)
const fileVersions = new Map();

// Get current session ID from global context or fall back to default
function getCurrentSessionId() {
  return _G.currentSessionId || 'default';
}

// Helper functions for file tracking
function getFileContentHash(filePath) {
  try {
    const content = readFileSync(filePath, 'utf8');
    return createHash('sha256').update(content).digest('hex');
  } catch (error) {
    return null;
  }
}

function getLastReadFilePath(sessionId = 'default') {
  return join(_G.PROC_DIR || 'agents/proc', `${sessionId}_last_read`);
}

function readFileReverse(filePath, maxBytes = 8192) {
  // Read file from end to find the most recent entries efficiently
  if (!existsSync(filePath)) {
    return [];
  }

  try {
    const stats = statSync(filePath);
    const fileSize = stats.size;

    if (fileSize === 0) {
      return [];
    }

    const fd = openSync(filePath, 'r');
    const chunkSize = Math.min(maxBytes, fileSize);
    const buffer = Buffer.alloc(chunkSize);
    const position = Math.max(0, fileSize - chunkSize);

    const bytesRead = readSync(fd, buffer, 0, chunkSize, position);
    closeSync(fd);

    const content = buffer.subarray(0, bytesRead).toString('utf8');

    // If we didn't read from the beginning, we might have a partial first line
    const lines = content.split('\n');
    if (position > 0 && lines.length > 0) {
      // Remove potentially incomplete first line unless we read from the very beginning
      lines.shift();
    }

    // Reverse the lines to get most recent first, filter out empty lines
    return lines.reverse().filter(line => line.trim());

  } catch (error) {
    return [];
  }
}

function findLastReadTime(filePath, sessionId = 'default') {
  const hash = getFileContentHash(filePath);
  if (!hash) return null;

  const lastReadPath = getLastReadFilePath(sessionId);
  const lines = readFileReverse(lastReadPath);

  // Look for the most recent entry for this hash
  for (const line of lines) {
    if (line.trim()) {
      const [lineHash, timestamp] = line.split(': ');
      if (lineHash === hash && timestamp) {
        return parseInt(timestamp, 10);
      }
    }
  }

  return null;
}

function recordFileRead(filePath, sessionId = null) {
  const hash = getFileContentHash(filePath);
  if (!hash) return;

  const actualSessionId = sessionId || getCurrentSessionId();
  const lastReadPath = getLastReadFilePath(actualSessionId);
  const dir = dirname(lastReadPath);

  // Ensure directory exists
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  try {
    const timestamp = Date.now();
    const entry = `${hash}: ${timestamp}\n`;

    // Append-only operation for performance and safety
    appendFileSync(lastReadPath, entry, 'utf8');
  } catch (error) {
    // Log error but don't fail the operation
    console.warn('Failed to record file read:', error.message);
  }
}

function getLastReadTime(filePath, sessionId = null) {
  const actualSessionId = sessionId || getCurrentSessionId();
  return findLastReadTime(filePath, actualSessionId);
} function generateDiff(oldContent, newContent, filePath = '') {
  try {
    // Use git diff for better formatting
    const result = spawnSync('git', ['diff', '--no-index', '--no-prefix', '/dev/null', '-'], {
      input: `--- a/${filePath}\n+++ b/${filePath}\n@@ -1,${oldContent.split('\n').length} +1,${newContent.split('\n').length} @@\n${oldContent.split('\n').map(l => `-${l}`).join('\n')}\n${newContent.split('\n').map(l => `+${l}`).join('\n')}`,
      encoding: 'utf8'
    });

    if (result.status === 0 || result.status === 1) {
      return result.stdout || 'No differences found';
    }
  } catch (error) {
    // Fallback to simple diff
  }

  // Simple diff fallback
  const oldLines = oldContent.split('\n');
  const newLines = newContent.split('\n');
  const maxLines = Math.max(oldLines.length, newLines.length);

  let diff = `--- ${filePath} (old)\n+++ ${filePath} (new)\n@@ -1,${oldLines.length} +1,${newLines.length} @@\n`;

  for (let i = 0; i < maxLines; i++) {
    const oldLine = oldLines[i];
    const newLine = newLines[i];

    if (oldLine !== undefined && newLine !== undefined) {
      if (oldLine !== newLine) {
        diff += `-${oldLine}\n+${newLine}\n`;
      } else {
        diff += ` ${oldLine}\n`;
      }
    } else if (oldLine !== undefined) {
      diff += `-${oldLine}\n`;
    } else if (newLine !== undefined) {
      diff += `+${newLine}\n`;
    }
  }

  return diff;
}

function countChanges(oldContent, newContent) {
  const oldLines = oldContent.split('\n');
  const newLines = newContent.split('\n');

  let additions = 0;
  let removals = 0;

  // Simple line-based counting
  if (newLines.length > oldLines.length) {
    additions = newLines.length - oldLines.length;
  } else if (oldLines.length > newLines.length) {
    removals = oldLines.length - newLines.length;
  }

  // Count changed lines
  const maxLines = Math.max(oldLines.length, newLines.length);
  for (let i = 0; i < maxLines; i++) {
    const oldLine = oldLines[i];
    const newLine = newLines[i];

    if (oldLine !== undefined && newLine !== undefined && oldLine !== newLine) {
      if (!additions && !removals) {
        additions++;
        removals++;
      }
    }
  }

  return { additions, removals };
}

_G.tools.create_file = {
  definition: {
    type: 'function',
    function: {
      name: 'create_file',
      description: 'This is a tool for creating a new file in the workspace. The file will be created with the specified content. The directory will be created if it does not already exist. Never use this tool to edit a file that already exists.',
      parameters: {
        type: 'object',
        properties: {
          filePath: {
            type: 'string',
            description: 'The absolute path to the file to create.'
          },
          content: {
            type: 'string',
            description: 'The content to write to the file.'
          }
        },
        required: ['filePath', 'content']
      }
    }
  },
  metadata: {
    requiresHumanApproval: false,  // File creation is generally safe

    preToolUse: async (args, context) => {
      // Check if trying to overwrite critical system files
      const criticalPaths = ['/etc/', '/bin/', '/usr/bin/', '/sys/', '/proc/'];
      const filePath = args.filePath;

      if (criticalPaths.some(path => filePath.startsWith(path))) {
        return 'deny';
      }

      // Check if file already exists (should be handled by tool logic but safety first)
      if (existsSync(filePath)) {
        return 'approve'; // Ask user since tool says it won't edit existing files
      }

      return 'allow';
    },

    getApprovalPrompt: async (args, context) => {
      const exists = existsSync(args.filePath);
      return `Creating file: ${args.filePath}\n` +
        `Content length: ${args.content.length} characters\n` +
        (exists ? `⚠️  File already exists and will be overwritten!` : `✅ New file creation`);
    }
  },
  execute: async (args) => {
    try {
      // Check if file already exists
      if (existsSync(args.filePath)) {
        return {
          success: false,
          content: 'File already exists. Use a different tool to edit existing files.',
          metadata: {
            path: args.filePath,
            error: 'file_exists',
            operation: 'create_file'
          }
        };
      }

      // Ensure directory exists
      const dir = dirname(args.filePath);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }

      writeFileSync(args.filePath, args.content, 'utf8');

      // Log the operation
      utils.logFileSystem(`Created file: ${args.filePath}`);

      return {
        success: true,
        content: `The following files were successfully edited:\n${args.filePath}`,
        metadata: {
          path: args.filePath,
          size: args.content.length,
          operation: 'create_file'
        }
      };
    } catch (error) {
      return {
        success: false,
        content: error.message,
        metadata: {
          path: args.filePath,
          error: error.message,
          operation: 'create_file'
        }
      };
    }
  }
};

_G.tools.list_directory = {
  definition: {
    type: 'function',
    function: {
      name: 'list_directory',
      description: 'List files and folders in a directory with optional glob pattern matching and recursive depth',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Path to the directory'
          },
          glob_pattern: {
            type: 'string',
            description: 'Optional glob pattern to filter results (e.g., "*.js", "**/*.md"). Supports wildcards: * (any chars), ** (recursive dirs), ? (single char)'
          },
          depth: {
            type: 'number',
            description: 'Optional recursion depth. 0 = current directory only (default), 1 = one level deep, -1 = unlimited depth'
          }
        },
        required: ['path']
      }
    }
  },
  execute: async (args) => {
    try {
      const basePath = args.path;
      const globPattern = args.glob_pattern;
      const maxDepth = args.depth !== undefined ? args.depth : 0;

      if (!existsSync(basePath)) {
        return {
          success: false,
          content: 'Directory not found',
          metadata: {
            path: basePath,
            error: 'directory_not_found',
            operation: 'list_directory'
          }
        };
      }

      // Recursive directory listing function
      const listRecursive = (dirPath, currentDepth = 0) => {
        const entries = [];

        // Create minimatch matcher if glob pattern provided
        const matcher = globPattern ? new Minimatch(globPattern, { dot: true }) : null;

        try {
          const items = readdirSync(dirPath);

          for (const name of items) {
            const fullPath = join(dirPath, name);
            const relativePath = relative(basePath, fullPath);

            try {
              const stats = statSync(fullPath);
              const isDirectory = stats.isDirectory();

              // Check if matches glob pattern (if provided)
              // Match against both relative path and just the name for flexibility
              const matchesGlob = !matcher ||
                matcher.match(relativePath) ||
                matcher.match(name);

              if (matchesGlob || isDirectory) {
                const entry = {
                  name: relativePath || name,
                  type: isDirectory ? 'directory' : 'file',
                  size: stats.size,
                  modified: stats.mtime
                };

                // Only add to results if it matches the glob (or no glob provided)
                if (matchesGlob) {
                  entries.push(entry);
                }

                // Recurse into directories if depth allows
                if (isDirectory && (maxDepth === -1 || currentDepth < maxDepth)) {
                  const subEntries = listRecursive(fullPath, currentDepth + 1);
                  entries.push(...subEntries);
                }
              }
            } catch (statError) {
              // Skip files we can't stat (permission issues, etc.)
              continue;
            }
          }
        } catch (readError) {
          // Skip directories we can't read
        }

        return entries;
      };

      const entries = listRecursive(basePath);

      // Log the operation
      const depthInfo = maxDepth === -1 ? 'unlimited depth' : maxDepth === 0 ? 'non-recursive' : `depth ${maxDepth}`;
      const globInfo = globPattern ? ` matching "${globPattern}"` : '';
      utils.logFileSystem(`Listed directory: ${basePath} (${depthInfo}${globInfo}, ${entries.length} entries)`);

      return {
        success: true,
        content: `Listed ${entries.length} entries in ${basePath}${globInfo}:\n${entries.map(e => `${e.type === 'directory' ? '📁' : '📄'} ${e.name}`).join('\n')}`,
        metadata: {
          path: basePath,
          entries: entries,
          count: entries.length,
          glob_pattern: globPattern,
          depth: maxDepth,
          operation: 'list_directory'
        }
      };
    } catch (error) {
      return {
        success: false,
        content: error.message,
        metadata: {
          path: args.path,
          error: error.message,
          operation: 'list_directory'
        }
      };
    }
  }
};

_G.tools.create_directory = {
  definition: {
    type: 'function',
    function: {
      name: 'create_directory',
      description: 'Create a new directory structure in the workspace. Will recursively create all directories in the path, like mkdir -p. You do not need to use this tool before using create_file, that tool will automatically create the needed directories.',
      parameters: {
        type: 'object',
        properties: {
          dirPath: {
            type: 'string',
            description: 'The absolute path to the directory to create.'
          }
        },
        required: ['dirPath']
      }
    }
  },
  execute: async (args) => {
    try {
      mkdirSync(args.dirPath, { recursive: true });

      // Log the operation
      utils.logFileSystem(`Created directory: ${args.dirPath}`);

      return {
        success: true,
        content: `Created directory at ${args.dirPath}`,
        metadata: {
          path: args.dirPath,
          operation: 'create_directory'
        }
      };
    } catch (error) {
      return {
        success: false,
        content: `Error creating directory: ${error.message}`,
        metadata: {
          path: args.dirPath,
          error: error.message,
          operation: 'create_directory'
        }
      };
    }
  }
};

_G.tools.grep_search = {
  definition: {
    type: 'function',
    function: {
      name: 'grep_search',
      description: 'Do a fast text search in the workspace. Use this tool when you want to search with an exact string or regex. If you are not sure what words will appear in the workspace, prefer using regex patterns with alternation (|) or character classes to search for multiple potential words at once instead of making separate searches. For example, use \'function|method|procedure\' to look for all of those words at once. Use includePattern to search within files matching a specific pattern, or in a specific file, using a relative path. Use this tool when you want to see an overview of a particular file, instead of using read_file many times to look for code within a file.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'The pattern to search for in files in the workspace. Use regex with alternation (e.g., \'word1|word2|word3\') or character classes to find multiple potential words in a single search. Be sure to set the isRegexp property properly to declare whether it\'s a regex or plain text pattern. Is case-insensitive.'
          },
          isRegexp: {
            type: 'boolean',
            description: 'Whether the pattern is a regex.'
          },
          includePattern: {
            type: 'string',
            description: 'Search files matching this glob pattern. Will be applied to the relative path of files within the workspace. To search recursively inside a folder, use a proper glob pattern like "src/folder/**". Do not use | in includePattern.'
          },
          maxResults: {
            type: 'number',
            description: 'The maximum number of results to return. Do not use this unless necessary, it can slow things down. By default, only some matches are returned. If you use this and don\'t see what you\'re looking for, you can try again with a more specific query or a larger maxResults.'
          }
        },
        required: ['query', 'isRegexp']
      }
    }
  },
  execute: async (args) => {
    try {
      const { query, isRegexp, includePattern, maxResults } = args;
      const workspacePath = process.cwd();
      const defaultMaxResults = 20;
      const limit = maxResults || defaultMaxResults;

      // Build the search pattern
      let searchPattern;
      if (isRegexp) {
        try {
          searchPattern = new RegExp(query, 'i'); // Case-insensitive
        } catch (regexError) {
          return {
            success: false,
            content: `Invalid regex pattern: ${regexError.message}`,
            metadata: {
              error: 'invalid_regex',
              query,
              operation: 'grep_search'
            }
          };
        }
      } else {
        // Escape special regex characters for literal search
        const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        searchPattern = new RegExp(escapedQuery, 'i'); // Case-insensitive
      }

      const matches = [];
      let totalMatches = 0;
      let filesSearched = 0;

      // Create minimatch matcher if includePattern provided
      const includeMatcher = includePattern ? new Minimatch(includePattern, { dot: true }) : null;

      // Recursive file search function
      const searchInDirectory = (dirPath) => {
        if (totalMatches >= limit) return;

        try {
          const items = readdirSync(dirPath);

          for (const name of items) {
            if (totalMatches >= limit) break;

            const fullPath = join(dirPath, name);
            const relativePath = relative(workspacePath, fullPath);

            // Skip common ignore patterns
            if (name === 'node_modules' || name === '.git' || name === '.vscode' ||
              name.startsWith('.') && name !== '.env') {
              continue;
            }

            try {
              const stats = statSync(fullPath);

              if (stats.isDirectory()) {
                searchInDirectory(fullPath);
              } else if (stats.isFile()) {
                // Check if file matches includePattern (if provided)
                if (includeMatcher && !includeMatcher.match(relativePath)) {
                  continue;
                }

                // Skip binary files (simple heuristic based on extension)
                const skipExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.ico', '.svg',
                  '.pdf', '.zip', '.tar', '.gz', '.exe', '.dll', '.so',
                  '.bin', '.dat', '.db', '.sqlite', '.woff', '.woff2', '.ttf', '.eot'];
                if (skipExtensions.some(ext => name.endsWith(ext))) {
                  continue;
                }

                // Skip very large files (> 1MB)
                if (stats.size > 1024 * 1024) {
                  continue;
                }

                filesSearched++;

                try {
                  const content = readFileSync(fullPath, 'utf8');
                  const lines = content.split('\n');

                  for (let i = 0; i < lines.length; i++) {
                    if (totalMatches >= limit) break;

                    const line = lines[i];
                    if (searchPattern.test(line)) {
                      totalMatches++;
                      matches.push({
                        path: relativePath,
                        line: i + 1,
                        content: line
                      });
                    }
                  }
                } catch (readError) {
                  // Skip files we can't read (binary, permission issues, etc.)
                }
              }
            } catch (statError) {
              // Skip files we can't stat
              continue;
            }
          }
        } catch (readDirError) {
          // Skip directories we can't read
        }
      };

      // Start search from workspace root
      searchInDirectory(workspacePath);

      const hasMoreResults = totalMatches >= limit;
      const resultSummary = `${totalMatches} match${totalMatches !== 1 ? 'es' : ''}${hasMoreResults ? ' (more results are available)' : ''}`;

      // Format matches similar to the example
      let formattedMatches = '';
      if (matches.length > 0) {
        formattedMatches = matches.map(m =>
          `<match path="${join(workspacePath, m.path)}" line=${m.line}>\n    ${m.content.trim()}\n</match>`
        ).join('\n');
      }

      const searchInfo = includePattern ? ` in "${includePattern}"` : '';
      utils.logFileSystem(`Grep search: "${query}" (${isRegexp ? 'regex' : 'literal'}${searchInfo}, ${filesSearched} files searched, ${totalMatches} matches)`);

      return {
        success: true,
        content: `${resultSummary}\n${formattedMatches}`,
        metadata: {
          query,
          isRegexp,
          includePattern: includePattern || null,
          totalMatches,
          matchesReturned: matches.length,
          filesSearched,
          hasMoreResults,
          operation: 'grep_search'
        }
      };
    } catch (error) {
      return {
        success: false,
        content: `Search error: ${error.message}`,
        metadata: {
          error: error.message,
          query: args.query,
          operation: 'grep_search'
        }
      };
    }
  }
};

_G.tools.view_file = {
  definition: {
    type: 'function',
    function: {
      name: 'view_file',
      description: 'Safely view file contents with read tracking for edit safety. This tool must be used before any file editing operations to establish read timestamps and enable safe editing. Supports both absolute (1-based) and relative (negative) line numbers.',
      parameters: {
        type: 'object',
        properties: {
          filePath: {
            type: 'string',
            description: 'The absolute path to the file to view'
          },
          lineStart: {
            type: 'number',
            description: 'Starting line number. Positive numbers are 1-based from start (e.g., 1 = first line). Negative numbers count from end (e.g., -1 = last line, -5 = fifth from last). Optional, defaults to 1 (first line).'
          },
          lineEnd: {
            type: 'number',
            description: 'Ending line number (inclusive). Positive numbers are 1-based from start. Negative numbers count from end (e.g., -1 = last line, -2 = second from last). Optional, defaults to last line. Examples: lineStart=1, lineEnd=10 (first 10 lines); lineStart=-5, lineEnd=-1 (last 5 lines); lineStart=-10, lineEnd=-5 (lines 10-5 from end).'
          }
        },
        required: ['filePath']
      }
    }
  },
  execute: async (args) => {
    try {
      if (!existsSync(args.filePath)) {
        return {
          success: false,
          content: 'File not found',
          metadata: {
            path: args.filePath,
            error: 'file_not_found',
            operation: 'view_file'
          }
        };
      }

      const stats = statSync(args.filePath);
      if (stats.isDirectory()) {
        return {
          success: false,
          content: 'Path is a directory, not a file',
          metadata: {
            path: args.filePath,
            error: 'is_directory',
            operation: 'view_file'
          }
        };
      }

      const content = readFileSync(args.filePath, 'utf8');
      const lines = content.split('\n');
      const totalLines = lines.length;

      // Record read time for safety tracking
      recordFileRead(args.filePath);

      let displayContent = content;
      let startLine = 1;
      let endLine = totalLines;

      // Handle line range if specified
      if (args.lineStart !== undefined || args.lineEnd !== undefined) {
        // Convert negative indices to positive (ruby-style)
        let rawStart = args.lineStart !== undefined ? args.lineStart : 1;
        let rawEnd = args.lineEnd !== undefined ? args.lineEnd : totalLines;

        // Handle negative indices: -1 is last line, -2 is second-to-last, etc.
        if (rawStart < 0) {
          rawStart = totalLines + rawStart + 1; // +1 because we use 1-indexed
        }
        if (rawEnd < 0) {
          rawEnd = totalLines + rawEnd + 1;
        }

        // Clamp to valid range
        startLine = Math.max(1, Math.min(totalLines, rawStart));
        endLine = Math.max(1, Math.min(totalLines, rawEnd));

        // Ensure startLine <= endLine
        if (startLine > endLine) {
          [startLine, endLine] = [endLine, startLine];
        }

        const selectedLines = lines.slice(startLine - 1, endLine);
        displayContent = selectedLines.join('\n');
      }

      // Log the operation
      utils.logFileSystem(`Viewed file: ${args.filePath} (lines ${startLine}-${endLine})`);

      return {
        success: true,
        content: displayContent,
        metadata: {
          filePath: args.filePath,
          totalLines: lines.length,
          displayedLines: `${startLine}-${endLine}`,
          size: stats.size,
          lastModified: stats.mtime.toISOString(),
          readTimestamp: Date.now(),
          operation: 'view_file'
        }
      };
    } catch (error) {
      return {
        success: false,
        content: error.message,
        metadata: {
          path: args.filePath,
          error: error.message,
          operation: 'view_file'
        }
      };
    }
  }
};

_G.tools.edit_file = {
  definition: {
    type: 'function',
    function: {
      name: 'edit_file',
      description: `Precisely edit files using string replacement with comprehensive safety checks. This tool requires prior file reading and validates uniqueness of matches.

SAFETY REQUIREMENTS:
1. You MUST use view_file first to read the file before editing
2. The old_string MUST be unique within the file
3. Include 3-5 lines of context before and after the target change
4. old_string must match exactly including all whitespace and indentation

USAGE PATTERNS:
- To edit content: provide file_path, old_string (with context), and new_string
- To delete content: provide file_path and old_string, leave new_string empty
- To insert content: provide file_path with old_string as insertion point, new_string as content to insert

The tool will fail safely if:
- File hasn't been read first
- File was modified since last read
- old_string appears multiple times (ambiguous)
- old_string not found (exact match required)`,
      parameters: {
        type: 'object',
        properties: {
          filePath: {
            type: 'string',
            description: 'The absolute path to the file to edit'
          },
          oldString: {
            type: 'string',
            description: 'The exact text to replace (must be unique and include sufficient context)'
          },
          newString: {
            type: 'string',
            description: 'The replacement text (leave empty to delete content)'
          }
        },
        required: ['filePath', 'oldString']
      }
    }
  },
  execute: async (args) => {
    try {
      // Validate file exists
      if (!existsSync(args.filePath)) {
        return {
          success: false,
          content: 'File not found',
          metadata: {
            path: args.filePath,
            error: 'file_not_found',
            operation: 'edit_file'
          }
        };
      }

      const stats = statSync(args.filePath);
      if (stats.isDirectory()) {
        return {
          success: false,
          content: 'Path is a directory, not a file',
          metadata: {
            path: args.filePath,
            error: 'is_directory',
            operation: 'edit_file'
          }
        };
      }

      // Safety check: must read file first
      const lastReadTime = getLastReadTime(args.filePath);
      if (!lastReadTime) {
        return {
          success: false,
          content: 'You must read the file using view_file before editing it. This ensures safety and prevents conflicts.',
          metadata: {
            path: args.filePath,
            error: 'file_not_read',
            operation: 'edit_file'
          }
        };
      }

      // Safety check: file hasn't been modified since last read
      const modTime = stats.mtime.getTime();
      if (modTime > lastReadTime) {
        return {
          success: false,
          error: `File has been modified since it was last read. Last read: ${new Date(lastReadTime).toISOString()}, File modified: ${stats.mtime.toISOString()}. Please read the file again before editing.`
        };
      }

      // Read current content
      const oldContent = readFileSync(args.filePath, 'utf8');

      // Validate old_string exists
      const index = oldContent.indexOf(args.oldString);
      if (index === -1) {
        return {
          success: false,
          error: 'old_string not found in file. Make sure it matches exactly, including whitespace and line breaks.'
        };
      }

      // Validate old_string is unique
      const lastIndex = oldContent.lastIndexOf(args.oldString);
      if (index !== lastIndex) {
        return {
          success: false,
          error: 'old_string appears multiple times in the file. Please provide more context to ensure a unique match.'
        };
      }

      // Perform the replacement
      const newString = args.newString || '';
      const newContent = oldContent.substring(0, index) + newString + oldContent.substring(index + args.oldString.length);

      // Check if content actually changed
      if (oldContent === newContent) {
        return {
          success: false,
          error: 'No changes would be made. The new content is identical to the old content.'
        };
      }

      // Generate diff and statistics
      const diff = generateDiff(oldContent, newContent, args.filePath);
      const { additions, removals } = countChanges(oldContent, newContent);

      // Write the file
      writeFileSync(args.filePath, newContent, 'utf8');

      // Update read timestamp to reflect the change
      recordFileRead(args.filePath);

      // Log the operation
      utils.logFileSystem(`Edited file: ${args.filePath} (+${additions} -${removals})`);

      return {
        success: true,
        content: `Successfully edited file: ${args.filePath}`,
        metadata: {
          message: `Successfully edited file: ${args.filePath}`,
          filePath: args.filePath,
          diff: diff,
          changes: {
            additions: additions,
            removals: removals,
            oldLength: oldContent.length,
            newLength: newContent.length
          },
          operation: args.newString === '' ? 'delete' : args.newString ? 'replace' : 'insert'
        }
      };

    } catch (error) {
      return {
        success: false,
        content: error.message,
        metadata: {
          path: args.filePath,
          error: error.message,
          operation: 'edit_file'
        }
      };
    }
  }
};

_G.tools.apply_patch = {
  definition: {
    type: 'function',
    function: {
      name: 'apply_patch',
      description: `Apply a unified diff patch to a file with safety validation. This tool can apply patches generated by git diff or similar tools.

SAFETY FEATURES:
- Validates file was read before patching
- Checks file hasn't been modified since last read
- Dry-run validation before applying changes
- Provides detailed feedback on patch application

PATCH FORMAT:
Supports unified diff format with context lines:
- Lines starting with ' ' (space) are context
- Lines starting with '-' are removed
- Lines starting with '+' are added
- Headers like '@@' indicate line ranges`,
      parameters: {
        type: 'object',
        properties: {
          filePath: {
            type: 'string',
            description: 'The absolute path to the file to patch'
          },
          patch: {
            type: 'string',
            description: 'The unified diff patch content to apply'
          },
          dryRun: {
            type: 'boolean',
            description: 'If true, validate the patch without applying it (default: false)'
          }
        },
        required: ['filePath', 'patch']
      }
    }
  },
  execute: async (args) => {
    try {
      // Validate file exists
      if (!existsSync(args.filePath)) {
        return {
          success: false,
          content: 'File not found',
          metadata: {
            path: args.filePath,
            error: 'file_not_found',
            operation: 'apply_patch'
          }
        };
      }

      const stats = statSync(args.filePath);
      if (stats.isDirectory()) {
        return {
          success: false,
          content: 'Path is a directory, not a file',
          metadata: {
            path: args.filePath,
            error: 'is_directory',
            operation: 'apply_patch'
          }
        };
      }

      // Safety check: must read file first
      const lastReadTime = getLastReadTime(args.filePath);
      if (!lastReadTime) {
        return {
          success: false,
          content: 'You must read the file using view_file before applying patches. This ensures safety and prevents conflicts.',
          metadata: {
            path: args.filePath,
            error: 'file_not_read',
            operation: 'apply_patch'
          }
        };
      }

      // Safety check: file hasn't been modified since last read
      const modTime = stats.mtime.getTime();
      if (modTime > lastReadTime) {
        return {
          success: false,
          error: `File has been modified since it was last read. Last read: ${new Date(lastReadTime).toISOString()}, File modified: ${stats.mtime.toISOString()}. Please read the file again before patching.`
        };
      }

      const oldContent = readFileSync(args.filePath, 'utf8');
      const lines = oldContent.split('\n');

      // Parse the patch
      const patchLines = args.patch.split('\n');
      const hunks = [];
      let currentHunk = null;

      for (let i = 0; i < patchLines.length; i++) {
        const line = patchLines[i];

        // Parse hunk header: @@ -oldStart,oldCount +newStart,newCount @@
        const hunkMatch = line.match(/^@@\s+-(\d+)(?:,(\d+))?\s+\+(\d+)(?:,(\d+))?\s+@@/);
        if (hunkMatch) {
          if (currentHunk) {
            hunks.push(currentHunk);
          }
          currentHunk = {
            oldStart: parseInt(hunkMatch[1], 10),
            oldCount: parseInt(hunkMatch[2] || '1', 10),
            newStart: parseInt(hunkMatch[3], 10),
            newCount: parseInt(hunkMatch[4] || '1', 10),
            changes: []
          };
          continue;
        }

        // Parse change lines
        if (currentHunk && (line.startsWith(' ') || line.startsWith('-') || line.startsWith('+'))) {
          currentHunk.changes.push({
            type: line[0],
            content: line.slice(1)
          });
        }
      }

      if (currentHunk) {
        hunks.push(currentHunk);
      }

      if (hunks.length === 0) {
        return { success: false, error: 'No valid hunks found in patch' };
      }

      // Apply hunks in reverse order to maintain line numbers
      let newLines = [...lines];
      let totalAdditions = 0;
      let totalRemovals = 0;

      for (let h = hunks.length - 1; h >= 0; h--) {
        const hunk = hunks[h];
        let lineIndex = hunk.oldStart - 1; // Convert to 0-based
        let contextCount = 0;
        let removeCount = 0;

        // Validate context lines first
        for (const change of hunk.changes) {
          if (change.type === ' ') {
            if (lineIndex + contextCount >= newLines.length ||
              newLines[lineIndex + contextCount] !== change.content) {
              return {
                success: false,
                error: `Patch context mismatch at line ${lineIndex + contextCount + 1}. Expected: "${change.content}", Found: "${newLines[lineIndex + contextCount] || 'EOF'}"`
              };
            }
            contextCount++;
          } else if (change.type === '-') {
            if (lineIndex + contextCount >= newLines.length ||
              newLines[lineIndex + contextCount] !== change.content) {
              return {
                success: false,
                error: `Patch removal mismatch at line ${lineIndex + contextCount + 1}. Expected: "${change.content}", Found: "${newLines[lineIndex + contextCount] || 'EOF'}"`
              };
            }
            contextCount++;
            removeCount++;
          }
        }

        // If dry run, don't actually apply changes
        if (args.dryRun) {
          continue;
        }

        // Apply the hunk
        let currentLine = lineIndex;
        const newHunkLines = [];

        for (const change of hunk.changes) {
          if (change.type === ' ') {
            // Context line - keep as is
            newHunkLines.push(change.content);
            currentLine++;
          } else if (change.type === '-') {
            // Remove line - skip it
            currentLine++;
            totalRemovals++;
          } else if (change.type === '+') {
            // Add line
            newHunkLines.push(change.content);
            totalAdditions++;
          }
        }

        // Replace the hunk in the file
        const hunkEndLine = currentLine;
        newLines.splice(lineIndex, hunkEndLine - lineIndex, ...newHunkLines);
      }

      if (args.dryRun) {
        return {
          success: true,
          content: 'Patch validation successful - no conflicts found',
          metadata: {
            message: 'Patch validation successful - no conflicts found',
            filePath: args.filePath,
            dryRun: true,
            hunksFound: hunks.length,
            estimatedChanges: {
              additions: hunks.reduce((sum, h) => sum + h.changes.filter(c => c.type === '+').length, 0),
              removals: hunks.reduce((sum, h) => sum + h.changes.filter(c => c.type === '-').length, 0)
            },
            operation: 'apply_patch'
          }
        };
      }

      const newContent = newLines.join('\n');

      // Check if content actually changed
      if (oldContent === newContent) {
        return {
          success: false,
          content: 'Patch resulted in no changes to the file content.',
          metadata: {
            error: 'Patch resulted in no changes to the file content.',
            path: args.filePath,
            operation: 'apply_patch'
          }
        };
      }

      // Write the file
      writeFileSync(args.filePath, newContent, 'utf8');

      // Update read timestamp
      recordFileRead(args.filePath);

      // Generate final diff for verification
      const finalDiff = generateDiff(oldContent, newContent, args.filePath);

      // Log the operation
      utils.logFileSystem(`Applied patch to: ${args.filePath} (+${totalAdditions} -${totalRemovals})`);

      return {
        success: true,
        content: `Successfully applied patch to: ${args.filePath}`,
        metadata: {
          message: `Successfully applied patch to: ${args.filePath}`,
          filePath: args.filePath,
          hunksApplied: hunks.length,
          changes: {
            additions: totalAdditions,
            removals: totalRemovals,
            oldLength: oldContent.length,
            newLength: newContent.length
          },
          diff: finalDiff,
          operation: 'apply_patch'
        }
      };

    } catch (error) {
      return {
        success: false,
        content: error.message,
        metadata: {
          path: args.filePath,
          error: error.message,
          operation: 'apply_patch'
        }
      };
    }
  }
};

_G.tools.open_file = {
  definition: {
    type: 'function',
    function: {
      name: 'open_file',
      description: 'Open a file in VS Code editor. For code/text files, this opens them in the editor. For media files (audio, video, images), it opens them in the default system application. The command runs in the background, so it does not block execution.',
      parameters: {
        type: 'object',
        properties: {
          filePath: {
            type: 'string',
            description: 'The path to the file to open. Can be absolute or relative to the current working directory. Examples: "src/main.js", "/home/user/document.txt", "output.mp3"'
          }
        },
        required: ['filePath']
      }
    }
  },
  metadata: {
    requiresHumanApproval: false,  // Opening files in editor is generally safe
    preToolUse: () => 'allow'
  },
  execute: async (args) => {
    const { filePath } = args;

    try {
      // Check if file exists
      if (!existsSync(filePath)) {
        return {
          success: false,
          content: `File not found: ${filePath}`,
          metadata: {
            error: 'file_not_found',
            path: filePath,
            operation: 'open_file'
          }
        };
      }

      // Execute 'code <file>' command in background
      const result = spawnSync('code', [filePath], {
        stdio: 'ignore',  // Don't capture output
        detached: true,   // Run in background
        shell: false
      });

      // Note: We don't check result.status because code command may exit immediately
      // even when successful (it sends the file to an existing VS Code instance)

      utils.logAgent(`Opened file in VS Code: ${filePath}`);

      return {
        success: true,
        content: `Successfully opened file in VS Code: ${filePath}`,
        metadata: {
          path: filePath,
          operation: 'open_file'
        }
      };

    } catch (error) {
      return {
        success: false,
        content: `Failed to open file: ${error.message}`,
        metadata: {
          path: filePath,
          error: error.message,
          operation: 'open_file'
        }
      };
    }
  }
};
