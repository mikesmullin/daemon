// File Operations
//
// Basic File Operations:
// - create_file(filePath, content) // Create a new file with the specified content
// - list_directory(path) // List files and folders in a directory
// - create_directory(dirPath) // Create a new directory
//
// Safe File Editing Tools:
// - view_file(filePath, lineStart?, lineEnd?) // Safely view file contents with read tracking
// - edit_file(filePath, oldString, newString?) // Precisely edit files with safety validation
// - apply_patch(filePath, patch, dryRun?) // Apply unified diff patches with validation
//

import { _G } from '../lib/globals.mjs';
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync, statSync, appendFileSync, openSync, readSync, closeSync } from 'fs';
import { join, dirname } from 'path';
import { spawnSync } from 'child_process';
import { createHash } from 'crypto';
import utils from '../lib/utils.mjs';

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
      description: 'List files and folders in a directory',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Path to the directory'
          }
        },
        required: ['path']
      }
    }
  },
  execute: async (args) => {
    try {
      if (!existsSync(args.path)) {
        return {
          success: false,
          content: 'Directory not found',
          metadata: {
            path: args.path,
            error: 'directory_not_found',
            operation: 'list_directory'
          }
        };
      }

      const entries = readdirSync(args.path).map(name => {
        const fullPath = join(args.path, name);
        const stats = statSync(fullPath);
        return {
          name,
          type: stats.isDirectory() ? 'directory' : 'file',
          size: stats.size,
          modified: stats.mtime
        };
      });

      // Log the operation
      utils.logFileSystem(`Listed directory: ${args.path} (${entries.length} entries)`);

      return {
        success: true,
        content: `Listed ${entries.length} entries in ${args.path}:\n${entries.map(e => `${e.type === 'directory' ? '📁' : '📄'} ${e.name}`).join('\n')}`,
        metadata: {
          path: args.path,
          entries: entries,
          count: entries.length,
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

_G.tools.view_file = {
  definition: {
    type: 'function',
    function: {
      name: 'view_file',
      description: 'Safely view file contents with read tracking for edit safety. This tool must be used before any file editing operations to establish read timestamps and enable safe editing.',
      parameters: {
        type: 'object',
        properties: {
          filePath: {
            type: 'string',
            description: 'The absolute path to the file to view'
          },
          lineStart: {
            type: 'number',
            description: 'Starting line number (1-based, optional)'
          },
          lineEnd: {
            type: 'number',
            description: 'Ending line number (1-based, optional)'
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

      // Record read time for safety tracking
      recordFileRead(args.filePath);

      let displayContent = content;
      let startLine = 1;
      let endLine = lines.length;

      // Handle line range if specified
      if (args.lineStart || args.lineEnd) {
        startLine = Math.max(1, args.lineStart || 1);
        endLine = Math.min(lines.length, args.lineEnd || lines.length);

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