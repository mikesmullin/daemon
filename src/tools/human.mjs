// Human Interaction Operations
//
// - speak_to_human(text, preset?, output_file?) // Use text-to-speech to vocalize information to get human's attention
// - ask_human(question?) // Prompt the human for input via an interactive text prompt
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

// Ask human for input using interactive text prompt
_G.tools.ask_human = {
  definition: {
    type: 'function',
    function: {
      name: 'ask_human',
      description: 'Prompt the human for input using an interactive text prompt. Displays a prompt to stdout and waits indefinitely for the human to type their response and press enter. Use this when you need clarification, input, or decisions from the human. This is blocking - the agent will wait until the human responds.',
      parameters: {
        type: 'object',
        properties: {
          question: {
            type: 'string',
            description: 'Optional question or context to display before the prompt. If provided, this will be shown to help the human understand what input is needed.'
          }
        },
        required: []
      }
    }
  },
  metadata: {
    requiresHumanApproval: false,  // This tool itself IS human interaction
    preToolUse: () => 'allow'  // No approval needed - the human IS the approver
  },
  execute: async (args, options = {}) => {
    const { question } = args;

    try {
      // Display the question if provided (before the prompt)
      if (question && question.trim()) {
        console.log(`\n${question}`);
      }

      // Import TUI prompt module
      const { prompt: tuiPrompt } = await import('../lib/tui.mjs');

      // Show interactive prompt and wait for human response
      const response = await tuiPrompt('> ');

      if (!response || !response.trim()) {
        return {
          success: false,
          content: 'No input received from human',
          metadata: {
            error: 'empty_response',
            question: question || null
          }
        };
      }

      const trimmedResponse = response.trim();

      log('info', `✅ Received human input: "${trimmedResponse}"`);

      return {
        success: true,
        content: `Human responded: "${trimmedResponse}"`,
        metadata: {
          response: trimmedResponse,
          question: question || null,
          response_length: trimmedResponse.length
        }
      };

    } catch (error) {
      log('error', `❌ Failed to get human input: ${error.message}`);

      return {
        success: false,
        content: `Failed to get human input: ${error.message}`,
        metadata: {
          error: error.message,
          question: question || null
        }
      };
    }
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
