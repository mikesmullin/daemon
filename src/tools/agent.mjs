// Agent Operations
//
// - list_agents() // Get all active subagent sessions with IDs, types, and status
// - create_agent(agent, prompt) // Create and start a new specialized subagent for specific tasks
// - command_agent(session_id, prompt) // Send additional instructions to an active subagent
// - check_agent_result(session_id) // Get the last response from a subagent
// - delete_agent(session_id) // Soft-delete an active agent session (mark as deleted, file removed on `d clean`)
//

import { _G } from '../lib/globals.mjs';
import { Agent } from '../lib/agents.mjs';
import utils from '../lib/utils.mjs';
import path from 'path';

_G.tools.list_agents = {
  definition: {
    type: 'function',
    function: {
      name: 'list_agents',
      description: 'Get a list of all currently active subagent sessions with their IDs, agent types, and status. Use this to monitor your subagent workforce, check which agents are available for new tasks, and get session IDs needed for command_agent or check_agent_result operations. Only shows subagents (excludes the main orchestrator and soft-deleted agents).',
    }
  },
  execute: async () => {
    try {
      const allSessions = await Agent.list();

      // Filter to only include sessions with 'subagent' label and not deleted
      const result = allSessions.filter(session => {
        // Check if session has subagent label and is not deleted
        return session.labels &&
          session.labels.includes('subagent') &&
          (!session.labels.includes('deleted'));
      });

      // Log the operation
      utils.logAgent(`Listed ${result.length} active subagent sessions`);

      return {
        success: true,
        content: `Found ${result.length} active subagent sessions`,
        metadata: {
          intent: 'list_agents',
          agents: result,
          count: result.length,
          operation: 'list_agents'
        }
      };
    } catch (error) {
      return {
        success: false,
        content: error.message,
        metadata: {
          error: error.message,
          operation: 'list_agents'
        }
      };
    }
  }
};

_G.tools.create_agent = {
  definition: {
    type: 'function',
    function: {
      name: 'create_agent',
      description: 'Create and start a new specialized subagent to handle specific tasks. Use this when you need dedicated expertise (planning, execution, evaluation, etc.) or want to delegate a substantial piece of work. Each agent type has different capabilities - choose based on the task requirements.',
      parameters: {
        type: 'object',
        properties: {
          agent: {
            type: 'string',
            description: 'The specialized agent template to instantiate. Available types: "solo" (general purpose). Choose based on the primary function needed.'
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
      const result = await Agent.fork({ agent: args.agent, prompt: args.prompt, labels: ['subagent'] });

      // Log the operation
      utils.logAgent(`Created new ${args.agent} subagent: ${result.session_id}`);

      return {
        success: true,
        content: `Successfully created new ${args.agent} subagent ${result.session_id}`,
        metadata: {
          intent: 'create_agent',
          agent: args.agent,
          session_id: result.session_id,
          result: result,
          operation: 'create_agent'
        }
      };
    } catch (error) {
      return {
        success: false,
        content: error.message,
        metadata: {
          error: error.message,
          agent: args.agent,
          operation: 'create_agent'
        }
      };
    }
  }
};

_G.tools.command_agent = {
  definition: {
    type: 'function',
    function: {
      name: 'command_agent',
      description: 'Send additional instructions or context to an active subagent. Use this when you need to provide new information, clarify requirements, or give follow-up tasks to an agent that is already working on something. Only works with subagents.',
      parameters: {
        type: 'object',
        properties: {
          session_id: {
            type: 'number',
            description: 'The session ID of the active subagent you want to communicate with (get this from list_agents). Must be a valid active subagent session.'
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
      // Verify this is a subagent session
      const sessions = await Agent.list();
      const session = sessions.find(s => s.session_id == args.session_id);

      if (!session) {
        return {
          success: false,
          content: `Session ${args.session_id} not found`,
          metadata: {
            error: 'session_not_found',
            session_id: args.session_id,
            operation: 'command_agent'
          }
        };
      }

      if (!session.labels || !session.labels.includes('subagent')) {
        return {
          success: false,
          content: `Session ${args.session_id} is not a subagent. command_agent only works with subagent sessions.`,
          metadata: {
            error: 'not_a_subagent',
            session_id: args.session_id,
            operation: 'command_agent'
          }
        };
      }

      if (session.labels.includes('deleted')) {
        return {
          success: false,
          content: `Session ${args.session_id} has been deleted`,
          metadata: {
            error: 'session_deleted',
            session_id: args.session_id,
            operation: 'command_agent'
          }
        };
      }

      const result = await Agent.push(args.session_id, args.prompt);

      // Log the operation
      utils.logAgent(`Commanded subagent session ${args.session_id}`);

      return {
        success: true,
        content: `Successfully sent command to subagent ${args.session_id}`,
        metadata: {
          intent: 'command_agent',
          session_id: args.session_id,
          result: result,
          operation: 'command_agent'
        }
      };
    } catch (error) {
      return {
        success: false,
        content: error.message,
        metadata: {
          error: error.message,
          session_id: args.session_id,
          operation: 'command_agent'
        }
      };
    }
  }
};

_G.tools.check_agent_result = {
  definition: {
    type: 'function',
    function: {
      name: 'check_agent_result',
      description: 'Get the last response from a subagent. Use this to check what the agent has reported, what it has accomplished, or what it is currently working on. Only works with subagents.',
      parameters: {
        type: 'object',
        properties: {
          session_id: {
            type: 'number',
            description: 'The session ID of the subagent you want to check (get this from list_agents). Must be a valid active subagent session.'
          }
        },
        required: ['session_id']
      }
    }
  },
  execute: async (args) => {
    try {
      // Verify this is a subagent session
      const sessions = await Agent.list();
      const session = sessions.find(s => s.session_id == args.session_id);

      if (!session) {
        return {
          success: false,
          content: `Session ${args.session_id} not found`,
          metadata: {
            error: 'session_not_found',
            session_id: args.session_id,
            operation: 'check_agent_result'
          }
        };
      }

      if (!session.labels || !session.labels.includes('subagent')) {
        return {
          success: false,
          content: `Session ${args.session_id} is not a subagent. check_agent_result only works with subagent sessions.`,
          metadata: {
            error: 'not_a_subagent',
            session_id: args.session_id,
            operation: 'check_agent_result'
          }
        };
      }

      if (session.labels.includes('deleted')) {
        return {
          success: false,
          content: `Session ${args.session_id} has been deleted`,
          metadata: {
            error: 'session_deleted',
            session_id: args.session_id,
            operation: 'check_agent_result'
          }
        };
      }

      // Read the session file to get the last assistant message
      const sessionPath = path.join(_G.SESSIONS_DIR, `${args.session_id}.yaml`);
      const sessionContent = await utils.readYaml(sessionPath);

      const messages = sessionContent.spec.messages || [];

      // Find the last assistant message
      let lastAssistantMessage = null;
      for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i].role === 'assistant') {
          lastAssistantMessage = messages[i];
          break;
        }
      }

      if (!lastAssistantMessage) {
        return {
          success: true,
          content: `Subagent ${args.session_id} (${session.agent}) has not responded yet`,
          metadata: {
            session_id: args.session_id,
            agent: session.agent,
            has_response: false,
            operation: 'check_agent_result'
          }
        };
      }

      // Log the operation
      utils.logAgent(`Checked result from subagent session ${args.session_id}`);

      return {
        success: true,
        content: `Subagent ${args.session_id} (${session.agent}) last response:\n${lastAssistantMessage.content || '(no content)'}`,
        metadata: {
          intent: 'check_agent_result',
          session_id: args.session_id,
          agent: session.agent,
          has_response: true,
          last_response: lastAssistantMessage.content || '',
          timestamp: lastAssistantMessage.ts,
          finish_reason: lastAssistantMessage.finish_reason,
          operation: 'check_agent_result'
        }
      };
    } catch (error) {
      return {
        success: false,
        content: error.message,
        metadata: {
          error: error.message,
          session_id: args.session_id,
          operation: 'check_agent_result'
        }
      };
    }
  }
};

_G.tools.delete_agent = {
  definition: {
    type: 'function',
    function: {
      name: 'delete_agent',
      description: 'Soft-delete a subagent session. The session is marked as deleted but the file is not removed until `d clean` is run by the human operator. Use this when a subagent has completed its task, is no longer needed, or is stuck/malfunctioning. Only works with subagents.',
      parameters: {
        type: 'object',
        properties: {
          session_id: {
            type: 'number',
            description: 'The session ID of the subagent to delete (get this from list_agents). Must be a valid subagent session.'
          }
        },
        required: ['session_id']
      }
    }
  },
  execute: async (args) => {
    try {
      // Verify this is a subagent session
      const sessions = await Agent.list();
      const session = sessions.find(s => s.session_id == args.session_id);

      if (!session) {
        return {
          success: false,
          content: `Session ${args.session_id} not found`,
          metadata: {
            error: 'session_not_found',
            session_id: args.session_id,
            operation: 'delete_agent'
          }
        };
      }

      if (!session.labels || !session.labels.includes('subagent')) {
        return {
          success: false,
          content: `Session ${args.session_id} is not a subagent. delete_agent only works with subagent sessions.`,
          metadata: {
            error: 'not_a_subagent',
            session_id: args.session_id,
            operation: 'delete_agent'
          }
        };
      }

      if (session.labels.includes('deleted')) {
        return {
          success: false,
          content: `Session ${args.session_id} is already deleted`,
          metadata: {
            error: 'already_deleted',
            session_id: args.session_id,
            operation: 'delete_agent'
          }
        };
      }

      // Mark the session as deleted by adding the 'deleted' label
      const sessionPath = path.join(_G.SESSIONS_DIR, `${args.session_id}.yaml`);
      const sessionContent = await utils.readYaml(sessionPath);

      if (!sessionContent.metadata.labels) {
        sessionContent.metadata.labels = [];
      }

      sessionContent.metadata.labels.push('deleted');

      await utils.writeYaml(sessionPath, sessionContent);

      // Also mark the BT state as failed
      await Agent.kill(args.session_id, 'fail');

      // Log the operation
      utils.logAgent(`Soft-deleted subagent session ${args.session_id}`);

      return {
        success: true,
        content: `Successfully marked subagent ${args.session_id} as deleted. Run 'd clean' to remove the file.`,
        metadata: {
          intent: 'delete_agent',
          session_id: args.session_id,
          agent: session.agent,
          operation: 'delete_agent'
        }
      };
    } catch (error) {
      return {
        success: false,
        content: error.message,
        metadata: {
          error: error.message,
          session_id: args.session_id,
          operation: 'delete_agent'
        }
      };
    }
  }
};
