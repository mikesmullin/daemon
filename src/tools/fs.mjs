// File Operations
//
// - read_file(path) // Read contents of a file from the filesystem
// - write_file(path, content) // Write or overwrite a file
// - list_directory(path) // List files and folders in a directory
// - create_directory(path) // Create a new directory
//

import { _G } from '../lib/globals.mjs';
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync, statSync } from 'fs';
import { join, dirname } from 'path';

export const read_file = {
  definition: {
    type: 'function',
    function: {
      name: 'read_file',
      description: 'Read contents of a file from the filesystem',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Absolute or relative path to the file'
          }
        },
        required: ['path']
      }
    }
  },
  execute: async (args) => {
    try {
      if (!existsSync(args.path)) {
        return { success: false, error: 'File not found' };
      }
      const content = readFileSync(args.path, 'utf8');
      return { success: true, content };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
};

export const write_file = {
  definition: {
    type: 'function',
    function: {
      name: 'write_file',
      description: 'Write or overwrite a file',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Absolute or relative path to the file'
          },
          content: {
            type: 'string',
            description: 'Content to write to the file'
          }
        },
        required: ['path', 'content']
      }
    }
  },
  execute: async (args) => {
    try {
      // Ensure directory exists
      const dir = dirname(args.path);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }

      writeFileSync(args.path, args.content, 'utf8');
      return { success: true, path: args.path };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
};

export const list_directory = {
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
        return { success: false, error: 'Directory not found' };
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

      return { success: true, entries };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
};

export const create_directory = {
  definition: {
    type: 'function',
    function: {
      name: 'create_directory',
      description: 'Create a new directory (recursively)',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Path to the directory to create'
          }
        },
        required: ['path']
      }
    }
  },
  execute: async (args) => {
    try {
      mkdirSync(args.path, { recursive: true });
      return { success: true, path: args.path };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
};