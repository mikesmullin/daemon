// Agent Operations
//
// - list_sessions() // Get all active sub-agent sessions with IDs, types, and status
// - new_session(agent, prompt) // Create and start a new specialized sub-agent for specific tasks
// - append_prompt(session_id, prompt) // Send additional instructions to an active sub-agent
// - fork_session(session_id, [prompt]) // Create a copy of an existing agent session for parallel work
// - kill_session(session_id) // Terminate and clean up an active agent session
//

import { _G } from '../lib/globals.mjs';
import { Agent } from '../lib/agents.mjs';
import utils from '../lib/utils.mjs';

_G.tools.list_sessions = {
  definition: {
    type: 'function',
    function: {
      name: 'list_sessions',
      description: 'Get a list of all currently active sub-agent sessions with their IDs, types, and status. Use this to monitor your agent workforce, check which agents are available for new tasks, and get session IDs needed for append_prompt or fork_session operations.',
    }
  },
  execute: async () => {
    try {
      const result = await Agent.list();

      // Log the operation
      utils.logAgent(`Listed ${result.length} active sessions`);

      return {
        success: true,
        content: `Found ${result.length} active sessions`,
        metadata: {
          intent: 'list_sessions',
          sessions: result,
          count: result.length,
          operation: 'list_sessions'
        }
      };
    } catch (error) {
      return {
        success: false,
        content: error.message,
        metadata: {
          error: error.message,
          operation: 'list_sessions'
        }
      };
    }
  }
};

_G.tools.append_prompt = {
  definition: {
    type: 'function',
    function: {
      name: 'append_prompt',
      description: 'Send additional instructions or context to an active sub-agent. Use this when you need to provide new information, clarify requirements, or give follow-up tasks to an agent that is already working on something.',
      parameters: {
        type: 'object',
        properties: {
          session_id: {
            type: 'number',
            description: 'The session ID of the active agent you want to communicate with (get this from list_sessions). Must be a valid active session.'
          },
          prompt: {
            type: 'string',
            description: 'Clear, specific instructions for the agent. Include concrete details about what you want done, any constraints, expected output format, or additional context. DO NOT send empty strings - always provide meaningful direction. Examples: "Please also check the error logs in /var/log", "Update the function to handle null values", "Generate a summary report of your findings".'
          }
        },
        required: ['session_id', 'prompt']
      }
    }
  },
  execute: async (args) => {
    try {
      const result = await Agent.push(args.session_id, args.prompt);

      // Log the operation
      utils.logAgent(`Appended prompt to session ${args.session_id}`);

      return {
        success: true,
        content: `Successfully appended prompt to session ${args.session_id}`,
        metadata: {
          intent: 'append_prompt',
          session_id: args.session_id,
          result: result,
          operation: 'append_prompt'
        }
      };
    } catch (error) {
      return {
        success: false,
        content: error.message,
        metadata: {
          error: error.message,
          session_id: args.session_id,
          operation: 'append_prompt'
        }
      };
    }
  }
};

_G.tools.new_session = {
  definition: {
    type: 'function',
    function: {
      name: 'new_session',
      description: 'Create and start a new specialized sub-agent to handle specific tasks. Use this when you need dedicated expertise (planning, execution, evaluation, etc.) or want to delegate a substantial piece of work. Each agent type has different capabilities - choose based on the task requirements.',
      parameters: {
        type: 'object',
        properties: {
          agent: {
            type: 'string',
            description: 'The specialized agent template to instantiate. Available types: "planner" (task decomposition, strategy), "executor" (file operations, system commands), "evaluator" (assessment, validation), "retriever" (information gathering), "solo" (general purpose). Choose based on the primary function needed.'
          },
          prompt: {
            type: 'string',
            description: 'Comprehensive initial task description for the new agent. Must be specific and actionable - include the objective, context, constraints, expected deliverables, and success criteria. DO NOT use empty strings or generic prompts. Example: "Analyze the user authentication system in /src/auth/ and identify security vulnerabilities. Focus on input validation and session management. Provide a detailed report with specific recommendations."'
          }
        },
        required: ['agent', 'prompt']
      }
    }
  },
  execute: async (args) => {
    try {
      const result = await Agent.fork({ agent: args.agent, prompt: args.prompt });

      // Log the operation
      utils.logAgent(`Created new ${args.agent} session: ${result.session_id}`);

      return {
        success: true,
        content: `Successfully created new ${args.agent} session ${result.session_id}`,
        metadata: {
          intent: 'fork_session',
          agent: args.agent,
          session_id: result.session_id,
          result: result,
          operation: 'new_session'
        }
      };
    } catch (error) {
      return {
        success: false,
        content: error.message,
        metadata: {
          error: error.message,
          agent: args.agent,
          operation: 'new_session'
        }
      };
    }
  }
};

_G.tools.fork_session = {
  definition: {
    type: 'function',
    function: {
      name: 'fork_session',
      description: 'Create a copy of an existing agent session to explore alternative approaches or run parallel tasks. Use this when you want to try different strategies, test multiple solutions, or delegate related sub-tasks while preserving the original agent\'s work.',
      parameters: {
        type: 'object',
        properties: {
          session_id: {
            type: 'number',
            description: 'The session ID of the agent to fork (get this from list_sessions). The new agent will inherit the original agent\'s context, memory, and conversation history.'
          },
          prompt: {
            type: 'string',
            description: 'Optional specific task or direction for the forked agent. If provided, this should be a clear instruction for what the new agent should do differently or additionally. If omitted, the forked agent continues from where the original left off. Example: "Take a different approach focusing on performance optimization instead of security".'
          }
        },
        required: ['session_id']
      }
    }
  },
  execute: async (args) => {
    try {
      const result = await Agent.fork({ session_id: args.session_id, prompt: args.prompt });

      // Log the operation
      utils.logAgent(`Forked session ${args.session_id} to new session ${result.session_id}`);

      return {
        success: true,
        content: `Successfully forked session ${args.session_id} to new session ${result.session_id}`,
        metadata: {
          intent: 'fork_session',
          original_session_id: args.session_id,
          new_session_id: result.session_id,
          result: result,
          operation: 'fork_session'
        }
      };
    } catch (error) {
      return {
        success: false,
        content: error.message,
        metadata: {
          error: error.message,
          session_id: args.session_id,
          operation: 'fork_session'
        }
      };
    }
  }
};

_G.tools.kill_session = {
  definition: {
    type: 'function',
    function: {
      name: 'kill_session',
      description: 'Terminate and clean up an active agent session. Use this when an agent has completed its task, is no longer needed, or is stuck/malfunctioning. This frees up system resources and removes the agent from the active sessions list.',
      parameters: {
        type: 'object',
        properties: {
          session_id: {
            type: 'number',
            description: 'The session ID of the agent to terminate (get this from list_sessions). The agent will be immediately stopped and cannot be restarted - use carefully.'
          }
        },
        required: ['session_id']
      }
    }
  },
  execute: async (args) => {
    try {
      const result = await Agent.kill(args.session_id);

      // Log the operation
      utils.logAgent(`Terminated session ${args.session_id}`);

      return {
        success: true,
        content: `Successfully terminated session ${args.session_id}`,
        metadata: {
          intent: 'kill_session',
          session_id: args.session_id,
          bt_state: result,
          operation: 'kill_session'
        }
      };
    } catch (error) {
      return {
        success: false,
        content: error.message,
        metadata: {
          error: error.message,
          session_id: args.session_id,
          operation: 'kill_session'
        }
      };
    }
  }
};
