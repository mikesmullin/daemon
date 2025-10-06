// Agent Operations
//
// - send_message(agent_id, content) // Send a message to another agent
//

import { _G } from '../lib/globals.mjs';
import { existsSync } from 'fs';
import { join } from 'path';

export const send_message = {
  definition: {
    type: 'function',
    function: {
      name: 'send_message',
      description: 'Send a message to another agent by appending to their chat log',
      parameters: {
        type: 'object',
        properties: {
          agent_id: {
            type: 'string',
            description: 'Target agent ID (e.g. "planner-001")'
          },
          content: {
            type: 'string',
            description: 'Message content to send'
          }
        },
        required: ['agent_id', 'content']
      }
    }
  },
  execute: async (args) => {
    try {
      const agentFile = join('templates', `${args.agent_id}.agent.yaml`);

      if (!existsSync(agentFile)) {
        return { success: false, error: `Agent not found: ${args.agent_id}` };
      }

      // This will be handled by the daemon's appendMessage function
      // For now, just return success with intent
      return {
        success: true,
        intent: 'append_message',
        agent_id: args.agent_id,
        content: args.content
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
};