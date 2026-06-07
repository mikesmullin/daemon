import { globals } from '../../common/globals.mjs';
import { Utils } from '../../common/utils.mjs';
import { ToolExecutionStatus } from '../agent/controllers/host-container-bridge.mjs';
import { spawn } from 'child_process';

export class VoicePlugin {
  constructor() {
    globals.pluginsRegistry.set('voice', this);
    this.registerTools();
  }

  registerTools() {
    globals.dslRegistry.set('human__speak_to', this.speakToHuman.bind(this));
  }

  get definition() {
    return [
      {
        type: "function",
        function: {
          name: "human__speak_to",
          description: "Use text-to-speech to vocalize information through the speakers.",
          parameters: {
            type: "object",
            properties: {
              preset: { type: "string", description: "Voice preset to use." },
              text: { type: "string", description: "The text to speak." }
            },
            required: ["preset", "text"]
          }
        },
        metadata: {
          requiresHostExecution: true, help: "human speak_to <preset> <text>"
        }
      }
    ];
  }

  async speakToHuman(args, options = {}) {
      let text, preset;
      
      if (Array.isArray(args)) {
          // CLI usage: d tool speak_to_human <preset> <text...>
          if (args.length < 2) {
              const msg = 'Usage: speak_to_human <preset> <text>';
              Utils.logError(msg);
              return { status: ToolExecutionStatus.FAILURE, error: msg };
          }
          preset = args[0];
          text = args.slice(1).join(' ');
      } else {
          // Agent usage: { preset: "...", text: "..." }
          text = args.text;
          preset = args.preset;
      }

      if (!text || !preset) {
          const msg = 'Usage: speak_to_human <preset> <text>';
          Utils.logError(msg);
          return { status: ToolExecutionStatus.FAILURE, error: msg };
      }

      const { signal } = options;
      
      Utils.logInfo(`[VOICE] Speaking (${preset}): "${text}"...`);
      
      return new Promise((resolve, reject) => {
          const child = spawn('voice', ['hot', preset, text]);
          
          if (signal) {
              signal.addEventListener('abort', () => {
                  Utils.logInfo('[VOICE] Interrupted!');
                  child.kill('SIGINT');  // Use SIGINT like Ctrl+C
                  resolve({ status: ToolExecutionStatus.FAILURE, error: 'Aborted' });
              });
          }
          
          let stderr = '';
          if (child.stderr) {
              child.stderr.on('data', d => stderr += d);
          }

          child.on('close', (code) => {
              if (signal?.aborted) {
                  resolve({ status: ToolExecutionStatus.FAILURE, error: 'Aborted' });
              } else if (code === 0) {
                  Utils.logInfo('[VOICE] Finished speaking.');
                  resolve({
                      status: ToolExecutionStatus.SUCCESS,
                      result: `Spoke: "${text}"`
                  });
              } else {
                  Utils.logWarn(`Voice process exited with ${code}: ${stderr}`);
                  resolve({
                      status: ToolExecutionStatus.FAILURE,
                      error: `Voice error: process exited with ${code}`
                  });
              }
          });
          
          child.on('error', (err) => {
              Utils.logError(`Failed to spawn voice: ${err.message}`);
              resolve({
                  status: ToolExecutionStatus.FAILURE,
                  error: `Voice error: ${err.message}`
              });
          });
      });
  }
}
export const voicePlugin = new VoicePlugin();
