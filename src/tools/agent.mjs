// Agent Operations
//
// - available_agents() // Get all available agent templates that can be instantiated
// - running_agents() // Get all active subagent sessions with IDs, types, and status
// - create_agent(agent, prompt) // Create and start a new specialized subagent for specific tasks
// - command_agent(session_id, prompt) // Send additional instructions to an active subagent
// - check_agent_response(session_id) // Get the last response from a subagent
// - delete_agent(session_id) // Soft-delete an active agent session (mark as deleted, file removed on `d clean`)
// - sleep(seconds) // Pause execution for specified duration (useful for waiting on subagents)
//

import { _G } from '../lib/globals.mjs';
import { Agent } from '../lib/agents.mjs';
import utils from '../lib/utils.mjs';
import path from 'path';

_G.tools.available_agents = {
  definition: {
    type: 'function',
    function: {
      name: 'available_agents',
      description: 'Get a list of all available agent templates that can be instantiated. This shows what types of agents you can create using create_agent. Returns template details including agent name (from filename), description, model, and available tools.',
    }
  },
  execute: async () => {
    try {
      const templates = await Agent.listAvailable();

      // Log the operation
      utils.logAgent(`Listed ${templates.length} available agent templates`);

      // Format agent details for the LLM
      let contentText = `Found ${templates.length} available agent templates:\n\n`;
      templates.forEach((agent, idx) => {
        contentText += `${idx + 1}. ${agent.name}\n`;
        if (agent.description) {
          contentText += `   Description: ${agent.description}\n`;
        }
        if (agent.model) {
          contentText += `   Model: ${agent.model}\n`;
        }
        if (agent.tools && agent.tools.length > 0) {
          contentText += `   Tools: ${agent.tools.join(', ')}\n`;
        }
        contentText += '\n';
      });

      return {
        success: true,
        content: contentText,
        metadata: {
          agents: templates
        }
      };
    } catch (error) {
      return {
        success: false,
        content: error.message,
        metadata: {
          error: error.message
        }
      };
    }
  }
}; _G.tools.running_agents = {
  definition: {
    type: 'function',
    function: {
      name: 'running_agents',
      description: 'Get a list of all currently running subagent sessions with their IDs, agent types, and status. Use this to monitor your active subagent workforce, check which agents are currently working, and get session IDs needed for command_agent or check_agent_response operations. Only shows subagents that are not soft-deleted.',
    }
  },
  execute: async () => {
    try {
      const result = await Agent.listRunning();

      // Log the operation
      utils.logAgent(`Listed ${result.length} running subagent sessions`);

      // Format running agent details for the LLM
      let contentText = `Found ${result.length} running subagent sessions:\n\n`;
      result.forEach((agent, idx) => {
        contentText += `${idx + 1}. Session ID: ${agent.session_id}\n`;
        contentText += `   Agent Type: ${agent.agent}\n`;
        contentText += `   Status: ${agent.status}\n`;
        if (agent.state) {
          contentText += `   State: ${agent.state}\n`;
        }
        if (agent.labels && agent.labels.length > 0) {
          contentText += `   Labels: ${agent.labels.join(', ')}\n`;
        }
        if (agent.created_at) {
          contentText += `   Created: ${agent.created_at}\n`;
        }
        contentText += '\n';
      });

      return {
        success: true,
        content: contentText,
        metadata: {
          agents: result
        }
      };
    } catch (error) {
      return {
        success: false,
        content: error.message,
        metadata: {
          error: error.message
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
      description: 'Create and start a new specialized subagent to handle specific tasks. Each agent type has different capabilities - use available_agents tool first to discover what agent templates are available, then choose based on the task requirements.',
      parameters: {
        type: 'object',
        properties: {
          agent: {
            type: 'string',
            description: 'The specialized agent template to instantiate. Use the available_agents tool to see what templates are available and their capabilities. Choose the template that best matches the task requirements.'
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
      // Strip '@' prefix from agent name if present (for convenience)
      const agentName = args.agent.startsWith('@') ? args.agent.slice(1) : args.agent;
      
      const result = await Agent.fork({ agent: agentName, prompt: args.prompt, labels: ['subagent'] });

      // Log the operation
      utils.logAgent(`Created new ${agentName} subagent: ${result.session_id}`);

      return {
        success: true,
        content: `Successfully created new ${agentName} subagent with session ID ${result.session_id}.\n\nAgent: ${agentName}\nSession ID: ${result.session_id}\nPrompt: ${args.prompt}`,
        metadata: {
          agent: agentName,
          session_id: result.session_id,
          result: result
        }
      };
    } catch (error) {
      return {
        success: false,
        content: error.message,
        metadata: {
          error: error.message,
          agent: args.agent
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
            description: 'The session ID of the active subagent you want to communicate with (get this from running_agents). Must be a valid active subagent session.'
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
            session_id: args.session_id
          }
        };
      }

      if (!session.labels || !session.labels.includes('subagent')) {
        return {
          success: false,
          content: `Session ${args.session_id} is not a subagent. command_agent only works with subagent sessions.`,
          metadata: {
            error: 'not_a_subagent',
            session_id: args.session_id
          }
        };
      }

      if (session.labels.includes('deleted')) {
        return {
          success: false,
          content: `Session ${args.session_id} has been deleted`,
          metadata: {
            error: 'session_deleted',
            session_id: args.session_id
          }
        };
      }

      const result = await Agent.push(args.session_id, args.prompt);

      // Log the operation
      utils.logAgent(`Commanded subagent session ${args.session_id}`);

      return {
        success: true,
        content: `Successfully sent command to subagent ${args.session_id}.\n\nSession ID: ${args.session_id}\nCommand: ${args.prompt}`,
        metadata: {
          session_id: args.session_id,
          result: result
        }
      };
    } catch (error) {
      return {
        success: false,
        content: error.message,
        metadata: {
          error: error.message,
          session_id: args.session_id
        }
      };
    }
  }
};

_G.tools.check_agent_response = {
  definition: {
    type: 'function',
    function: {
      name: 'check_agent_response',
      description: 'Get the last response from a subagent. Use this to check what the agent has reported, what it has accomplished, or what it is currently working on. Only works with subagents.',
      parameters: {
        type: 'object',
        properties: {
          session_id: {
            type: 'number',
            description: 'The session ID of the subagent you want to check (get this from running_agents). Must be a valid active subagent session.'
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
            session_id: args.session_id
          }
        };
      }

      if (!session.labels || !session.labels.includes('subagent')) {
        return {
          success: false,
          content: `Session ${args.session_id} is not a subagent. check_agent_response only works with subagent sessions.`,
          metadata: {
            error: 'not_a_subagent',
            session_id: args.session_id
          }
        };
      }

      if (session.labels.includes('deleted')) {
        return {
          success: false,
          content: `Session ${args.session_id} has been deleted`,
          metadata: {
            error: 'session_deleted',
            session_id: args.session_id
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
          content: `Subagent ${args.session_id} (${session.agent}) has not responded yet.\n\nSession ID: ${args.session_id}\nAgent Type: ${session.agent}\nStatus: No response yet`,
          metadata: {
            session_id: args.session_id,
            agent: session.agent,
            has_response: false
          }
        };
      }

      // Log the operation
      utils.logAgent(`Checked response from subagent session ${args.session_id}`);

      // Format the response with additional context
      let contentText = `Subagent ${args.session_id} (${session.agent}) last response:\n\n`;
      contentText += `Session ID: ${args.session_id}\n`;
      contentText += `Agent Type: ${session.agent}\n`;
      if (lastAssistantMessage.ts) {
        contentText += `Timestamp: ${new Date(lastAssistantMessage.ts).toISOString()}\n`;
      }
      if (lastAssistantMessage.finish_reason) {
        contentText += `Finish Reason: ${lastAssistantMessage.finish_reason}\n`;
      }
      contentText += `\nResponse:\n${lastAssistantMessage.content || '(no content)'}`;

      return {
        success: true,
        content: contentText,
        metadata: {
          session_id: args.session_id,
          agent: session.agent,
          has_response: true,
          last_response: lastAssistantMessage.content || '',
          timestamp: lastAssistantMessage.ts,
          finish_reason: lastAssistantMessage.finish_reason
        }
      };
    } catch (error) {
      return {
        success: false,
        content: error.message,
        metadata: {
          error: error.message,
          session_id: args.session_id
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
            description: 'The session ID of the subagent to delete (get this from running_agents). Must be a valid subagent session.'
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
            session_id: args.session_id
          }
        };
      }

      if (!session.labels || !session.labels.includes('subagent')) {
        return {
          success: false,
          content: `Session ${args.session_id} is not a subagent. delete_agent only works with subagent sessions.`,
          metadata: {
            error: 'not_a_subagent',
            session_id: args.session_id
          }
        };
      }

      if (session.labels.includes('deleted')) {
        return {
          success: false,
          content: `Session ${args.session_id} is already deleted`,
          metadata: {
            error: 'already_deleted',
            session_id: args.session_id
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

      // Clean up any PTY sessions for this agent
      try {
        const { ptyManager } = await import('../../plugins/shell/pty-manager.mjs');
        const closedCount = ptyManager.closeAgentSessions(args.session_id.toString());
        if (closedCount > 0) {
          utils.logAgent(`Closed ${closedCount} PTY session(s) for agent ${args.session_id}`);
        }
      } catch (error) {
        // PTY manager might not be loaded, ignore
        log('debug', `Could not clean up PTY sessions: ${error.message}`);
      }

      // Log the operation
      utils.logAgent(`Soft-deleted subagent session ${args.session_id}`);

      return {
        success: true,
        content: `Successfully marked subagent ${args.session_id} as deleted.\n\nSession ID: ${args.session_id}\nAgent Type: ${session.agent}\n\nRun 'd clean' to remove the file.`,
        metadata: {
          session_id: args.session_id,
          agent: session.agent
        }
      };
    } catch (error) {
      return {
        success: false,
        content: error.message,
        metadata: {
          error: error.message,
          session_id: args.session_id
        }
      };
    }
  }
};

_G.tools.sleep = {
  definition: {
    type: 'function',
    function: {
      name: 'sleep',
      description: 'Pause execution for a specified duration. Useful when coordinating with subagents - allows time for them to make progress before checking their status. Also helpful for rate limiting, waiting for external processes, or scheduling periodic checks. The agent will resume execution after the sleep duration.',
      parameters: {
        type: 'object',
        properties: {
          seconds: {
            type: 'number',
            description: 'Number of seconds to sleep. Can be fractional (e.g., 0.5 for half a second). Practical range: 0.1 to 300 seconds (5 minutes). For longer delays, consider using multiple sleep calls or external scheduling.'
          }
        },
        required: ['seconds']
      }
    }
  },
  execute: async (args) => {
    try {
      const seconds = parseFloat(args.seconds);

      if (isNaN(seconds) || seconds < 0) {
        return {
          success: false,
          content: `Invalid sleep duration: ${args.seconds}. Must be a positive number.`,
          metadata: {
            error: 'invalid_duration',
            requested: args.seconds
          }
        };
      }

      if (seconds > 300) {
        return {
          success: false,
          content: `Sleep duration too long: ${seconds}s. Maximum is 300 seconds (5 minutes). For longer delays, use multiple sleep calls.`,
          metadata: {
            error: 'duration_too_long',
            requested: seconds,
            maximum: 300
          }
        };
      }

      const milliseconds = Math.round(seconds * 1000);

      // Log the operation
      utils.logAgent(`Sleeping for ${seconds} seconds...`);

      // Perform the actual sleep
      await new Promise(resolve => setTimeout(resolve, milliseconds));

      // Log completion
      utils.logAgent(`Woke up after ${seconds} seconds`);

      return {
        success: true,
        content: `Slept for ${seconds} seconds (${milliseconds}ms)`,
        metadata: {
          duration_seconds: seconds,
          duration_ms: milliseconds
        }
      };
    } catch (error) {
      return {
        success: false,
        content: error.message,
        metadata: {
          error: error.message
        }
      };
    }
  }
};
