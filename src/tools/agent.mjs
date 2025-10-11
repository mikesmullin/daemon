// Agent Operations
//
// - append_prompt(session_id, prompt) // Append a user message to another agent session prompt context
//

import { _G } from '../lib/globals.mjs';
import { existsSync } from 'fs';
import { join } from 'path';
import { Agent } from '../lib/agents.mjs';

_G.tools.list_sessions = {
  definition: {
    type: 'function',
    function: {
      name: 'list_sessions',
      description: 'List all active agent sessions',
    }
  },
  execute: async () => {
    try {
      const result = await Agent.list();

      return {
        success: true,
        intent: 'list_sessions',
        sessions: result
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
};

_G.tools.append_prompt = {
  definition: {
    type: 'function',
    function: {
      name: 'append_prompt',
      description: 'Append a user message to another agent session prompt context',
      parameters: {
        type: 'object',
        properties: {
          session_id: {
            type: 'number',
            description: 'Target session id (e.g. 2)'
          },
          prompt: {
            type: 'string',
            description: 'Message to append to the agent session'
          }
        },
        required: ['session_id', 'prompt']
      }
    }
  },
  execute: async (args) => {
    try {
      const result = await Agent.push(args.session_id, args.prompt);

      return {
        success: true,
        intent: 'append_prompt',
        result
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
};

_G.tools.new_session = {
  definition: {
    type: 'function',
    function: {
      name: 'new_session',
      description: 'Create a new agent session from an agent template',
      parameters: {
        type: 'object',
        properties: {
          agent: {
            type: 'string',
            description: 'Agent template to use for the new session (e.g. "planner")'
          },
          prompt: {
            type: 'string',
            description: 'Optional new initial prompt for the forked session'
          }
        },
        required: ['agent']
      }
    }
  },
  execute: async (args) => {
    try {
      const result = await Agent.fork({ agent: args.agent, prompt: args.prompt });

      return {
        success: true,
        intent: 'fork_session',
        result
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
};

_G.tools.fork_session = {
  definition: {
    type: 'function',
    function: {
      name: 'fork_session',
      description: 'Fork an existing agent session',
      parameters: {
        type: 'object',
        properties: {
          session_id: {
            type: 'number',
            description: 'Target session id (e.g. 2)'
          },
          prompt: {
            type: 'string',
            description: 'Optional new initial prompt for the forked session'
          }
        },
        required: ['session_id']
      }
    }
  },
  execute: async (args) => {
    try {
      const result = await Agent.fork({ session_id: args.session_id, prompt: args.prompt });

      return {
        success: true,
        intent: 'fork_session',
        result
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
};

_G.tools.kill_session = {
  definition: {
    type: 'function',
    function: {
      name: 'kill_session',
      description: 'Terminate an active agent session',
      parameters: {
        type: 'object',
        properties: {
          session_id: {
            type: 'number',
            description: 'Target session id (e.g. 2)'
          }
        },
        required: ['session_id']
      }
    }
  },
  execute: async (args) => {
    try {
      const result = await Agent.kill(args.session_id);

      return {
        success: true,
        intent: 'kill_session',
        bt_state: result
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
};
