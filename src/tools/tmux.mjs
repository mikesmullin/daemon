import { _G } from '../lib/globals.mjs';
import utils from '../lib/utils.mjs';

// Register tmux management tool
_G.tools.tmux_watch = {
  definition: {
    type: "function",
    function: {
      name: "tmux_watch",
      description: "Create a new tmux pane to watch a specific session",
      parameters: {
        type: "object",
        properties: {
          session_id: {
            type: "string", 
            description: "The session ID to watch in the new pane"
          },
          tmux_session: {
            type: "string",
            description: "The tmux session name (optional, defaults to 'daemon')",
            default: "daemon"
          },
          pane_title: {
            type: "string", 
            description: "Title for the new pane (optional)",
            default: ""
          }
        },
        required: ["session_id"]
      }
    }
  },
  metadata: {
    preToolUse: () => 'allow' // No approval needed for tmux operations
  },
  execute: async (args) => {
    try {
      const { spawn } = await import('child_process');
      const tmuxSession = args.tmux_session || 'daemon';
      const paneTitle = args.pane_title || `watch-${args.session_id}`;
      
      // Check if we're running inside tmux
      if (!process.env.TMUX) {
        return {
          success: false,
          content: "Not running inside a tmux session. Cannot create new panes.",
          metadata: { error: 'not_in_tmux' }
        };
      }
      
      // Create new pane with watch command
      const command = `d watch ${args.session_id}`;
      const tmuxCmd = [
        'split-window', 
        '-t', tmuxSession,
        '-c', process.cwd(), // Use current working directory
        command
      ];
      
      // Set pane title if provided
      if (paneTitle) {
        tmuxCmd.push('\\;', 'select-pane', '-T', paneTitle);
      }
      
      const result = await new Promise((resolve, reject) => {
        const proc = spawn('tmux', tmuxCmd, { 
          stdio: ['ignore', 'pipe', 'pipe']
        });
        
        let stdout = '';
        let stderr = '';
        
        proc.stdout.on('data', (data) => stdout += data.toString());
        proc.stderr.on('data', (data) => stderr += data.toString());
        
        proc.on('close', (code) => {
          if (code === 0) {
            resolve({ stdout, stderr });
          } else {
            reject(new Error(`tmux command failed with code ${code}: ${stderr}`));
          }
        });
      });
      
      utils.logAgent(`Created tmux pane watching session ${args.session_id}`);
      
      return {
        success: true,
        content: `Created new tmux pane "${paneTitle}" watching session ${args.session_id}`,
        metadata: {
          session_id: args.session_id,
          tmux_session: tmuxSession,
          pane_title: paneTitle,
          operation: 'tmux_split_pane'
        }
      };
      
    } catch (error) {
      return {
        success: false,
        content: `Failed to create tmux pane: ${error.message}`,
        metadata: { error: error.message }
      };
    }
  }
};