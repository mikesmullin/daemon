// Voice Operations
//
// - speak_to_human(text, preset?, output_file?) // Use text-to-speech to vocalize information to get human's attention
//

import { _G } from '../lib/globals.mjs';
import utils, { log } from '../lib/utils.mjs';
import { spawn } from 'child_process';

// Path to voice executable (Windows executable accessible from WSL)
const VOICE_PATH = '/mnt/c/Users/mikes/.local/bin/voice.exe';

_G.tools.speak_to_human = {
  definition: {
    type: 'function',
    function: {
      name: 'speak_to_human',
      description: 'Use text-to-speech to vocalize information through speakers/headphones to get the human\'s attention. Useful for alerts, notifications, or when agent needs human interaction. Text may be transformed by LLM for better speech output.',
      parameters: {
        type: 'object',
        properties: {
          text: {
            type: 'string',
            description: 'The text to speak. Will be processed by LLM for natural speech unless no_transform is true.'
          },
          preset: {
            type: 'string',
            description: 'Voice preset name (e.g., glados, bella, adam). If not specified, uses default voice.',
            default: 'bella'
          },
          no_transform: {
            type: 'boolean',
            description: 'Skip LLM applying personality layer via text transformation and use input text verbatim',
            default: false
          }
        },
        required: ['text']
      }
    }
  },
  metadata: {
    requiresHumanApproval: false,  // Voice output is generally safe and non-destructive
    preToolUse: () => 'allow'  // No approval needed
  },
  execute: async (args, options = {}) => {
    const { text, preset, output_file, no_transform } = args;

    if (!text || typeof text !== 'string' || text.trim() === '') {
      return {
        success: false,
        content: 'Error: text parameter is required and must be a non-empty string',
        metadata: { error: 'invalid_text' }
      };
    }

    // Build command arguments
    const cmdArgs = [];

    // Add flags
    if (no_transform) {
      cmdArgs.push('--no-transform');
    }

    if (output_file) {
      cmdArgs.push('-o', output_file);
    }

    // Add preset (required by voice command, default to 'neutral')
    const voicePreset = preset || 'neutral';
    cmdArgs.push(voicePreset);

    // Add text
    cmdArgs.push(text);

    log('debug', `🔊 Speaking: "${text}" with preset: ${voicePreset}`);
    utils.logShell(`${VOICE_PATH} ${cmdArgs.map(a => `"${a}"`).join(' ')}`);

    // Execute voice command using spawn with stdio inherit for immediate execution
    // This avoids the blocking behavior of execAsync with Windows executables
    return new Promise((resolve) => {
      const child = spawn(VOICE_PATH, cmdArgs, {
        stdio: 'inherit'  // Pass through stdio - no buffering, immediate execution
      });

      child.on('close', (code) => {
        if (code === 0) {
          const outputInfo = output_file
            ? `Audio saved to: ${output_file}`
            : 'Audio played through speakers';

          resolve({
            success: true,
            content: `Successfully vocalized: "${text}"\n${outputInfo}`,
            metadata: {
              text,
              preset: voicePreset,
              output_file: output_file || null,
              no_transform: no_transform || false,
              exit_code: code
            }
          });
        } else {
          log('error', `❌ Voice command failed with exit code: ${code}`);
          resolve({
            success: false,
            content: `Failed to vocalize text: voice command exited with code ${code}`,
            metadata: {
              error: `exit_code_${code}`,
              exit_code: code,
              text,
              preset: voicePreset
            }
          });
        }
      });

      child.on('error', (error) => {
        log('error', `❌ Voice command failed: ${error.message}`);
        resolve({
          success: false,
          content: `Failed to vocalize text: ${error.message}`,
          metadata: {
            error: error.message,
            text,
            preset: voicePreset
          }
        });
      });
    });
  }
};

// Export a helper function to list available presets
_G.tools.list_voice_presets = {
  definition: {
    type: 'function',
    function: {
      name: 'list_voice_presets',
      description: 'List all available voice presets that can be used with speak_to_human',
      parameters: {
        type: 'object',
        properties: {},
        required: []
      }
    }
  },
  metadata: {
    requiresHumanApproval: false,
    preToolUse: () => 'allow'
  },
  execute: async (args, options = {}) => {
    try {
      log('debug', '🎤 Listing voice presets');

      const command = `${VOICE_PATH} --list`;
      const { stdout, stderr } = await execAsync(command, {
        timeout: 10000  // 10 second timeout
      });

      return {
        success: true,
        content: `Available voice presets:\n${stdout.trim()}`,
        metadata: {
          presets: stdout.trim(),
          stderr: stderr.trim()
        }
      };

    } catch (error) {
      log('error', `❌ Failed to list voice presets: ${error.message}`);

      return {
        success: false,
        content: `Failed to list voice presets: ${error.message}`,
        metadata: {
          error: error.message
        }
      };
    }
  }
};
