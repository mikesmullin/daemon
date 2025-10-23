const fs = await import('fs/promises');
const path = await import('path');
import yaml from 'js-yaml';
import ejs from 'ejs';
import { _G } from './globals.mjs';
import utils, { log } from './utils.mjs';
import color from './colors.mjs';
import { Copilot } from './copilot.mjs';
import { registry } from './ai-providers/registry.mjs';
import { Session } from './session.mjs';
import { Tool } from './tool.mjs';
import _ from 'lodash';
import os from 'os';

// Auto-register all tools
import '../tools/fs.mjs';
import '../tools/shell.mjs';
import '../tools/tasks.mjs';
import '../tools/agent.mjs';
import '../tools/web.mjs';
import '../tools/gemini-image.mjs';
import '../tools/mcp.mjs';
import '../tools/voice.mjs';

export class Agent {
  // Agents follow BehaviorTree (BT) patterns
  // each Agent can have zero or more Sessions
  // every Session has a corresponding BT state
  // states are recorded as lock files in _G.PROC_DIR
  // where a lock file is named <session_id>
  // and its contents are the BT state

  static _isValidBtState(state) {
    return Session._isValidBtState(state);
  }

  // if bt_state is given, write the BT state for a given session_id
  // else return the current BT state for a given session_id
  // aborts if the state file does not exist, is invalid, or any error occurs
  static async state(session_id, bt_state) {
    return Session.state(session_id, bt_state);
  }

  // list agent sessions and their BT state
  static async list() {
    return Session.list();
  }

  // generate the next agent session ID (a monotonically increasing integer)
  static async nextId() {
    return Session.nextId();
  }

  // mark an agent session with a new BT state
  static async kill(session_id, bt_state = 'fail') {
    return Session.state(session_id, bt_state);
  }

  // append a new user message to an agent session
  static async push(session_id, prompt) {
    return Session.push(session_id, prompt);
  }

  // fork a new agent session from a template or an existing session
  static async fork({ agent, session_id, prompt = null }) {
    try {
      // Generate new session ID
      const new_session_id = await Agent.nextId();

      await Agent.state(new_session_id, 'success');

      let sessionContent = {};
      if (null != session_id) {
        const existingSessionFileName = `${session_id}.yaml`;
        const existingSessionPath = path.join(_G.SESSIONS_DIR, existingSessionFileName);
        sessionContent = await utils.readYaml(existingSessionPath);
        utils.assert(sessionContent.apiVersion == 'daemon/v1');
        utils.assert(sessionContent.kind == 'Agent');

        if (null == agent) {
          agent = sessionContent.name;
        }
      }
      else {
        const templateFileName = `${agent}.yaml`;
        const templatePath = path.join(_G.TEMPLATES_DIR, templateFileName);
        sessionContent = await utils.readYaml(templatePath);

        // render EJS in system prompt template, if present
        if (sessionContent.spec.system_prompt) {
          sessionContent.spec.system_prompt = ejs.render(sessionContent.spec.system_prompt, {
            os,
          });
        }
      }
      const newgSessionFileName = `${new_session_id}.yaml`;
      const newgSessionPath = path.join(_G.SESSIONS_DIR, newgSessionFileName);
      await utils.writeYaml(newgSessionPath, sessionContent);

      if (prompt) {
        await Agent.push(new_session_id, prompt);
      }

      // Auto-launch tmux pane if running in tmux and config allows
      log('debug', `🖼️  Tmux auto-pane settings detected: TMUX=${process.env.TMUX}, config=${_G.CONFIG.daemon?.auto_tmux_panes}`);

      if (process.env.TMUX && _G.CONFIG.daemon?.auto_tmux_panes) {
        try {
          const { spawn } = await import('child_process');
          const command = `d watch ${new_session_id}`;
          const paneTitle = `${agent}-${new_session_id}`;

          log('debug', `🖼️  Creating tmux pane: ${command}`);

          // Split the current pane and run the watch command
          const result = spawn('tmux', [
            'split-window',
            // '-v',  // vertical split
            '-h',  // horizontal split
            '-c', process.cwd(),  // set working directory
            command  // command to run in new pane
          ], { detached: true, stdio: ['ignore', 'pipe', 'pipe'] });

          // Set pane title in a separate command
          setTimeout(() => {
            spawn('tmux', ['select-pane', '-T', paneTitle], {
              detached: true,
              stdio: 'ignore'
            });
          }, 100);

          log('info', `🖼️  Created tmux pane "${paneTitle}" for session ${new_session_id}`);
        } catch (error) {
          log('debug', `Could not create tmux pane: ${error.message}`);
        }
      } else {
        if (!process.env.TMUX) {
          log('debug', '🖼️  Not in tmux session - skipping auto-pane creation');
        }
        if (!_G.CONFIG.daemon?.auto_tmux_panes) {
          log('debug', '🖼️  auto_tmux_panes disabled in config - skipping auto-pane creation');
        }
      }

      return {
        session_id: new_session_id,
        agent,
        prompt,
      };
    } catch (error) {
      utils.abort(`Failed to fork session for agent ${agent}: ${error.message}`);
    }
  }

  static async prompt({ model, messages, tools = [], max_tokens }) {
    const modelName = model || 'claude-sonnet-4';


    try {
      // Get the appropriate provider for this model
      const provider = await registry.getProvider(modelName);
      const providerName = provider.constructor.getName();

      log('debug', `🤖 ${providerName} AI API Request (model: ${modelName})`);

      // Strip provider prefix from model name if present
      const cleanModelName = registry.stripProviderPrefix(modelName);

      // Make the request
      const response = await provider.createChatCompletion({
        model: cleanModelName,
        messages: messages,
        tools: tools,
        max_tokens: max_tokens,
      });

      // Add provider name to response metadata
      response.provider = providerName;

      log('debug', '🤖 ${providerName} AI API Response: ' + JSON.stringify(response, null, 2));

      // Log metrics if available
      provider.logMetrics(response);

      return response;
    } catch (error) {
      log('error', `AI API error: ${error.message}`);
      utils.abort(error);
    }
  }  // evaluate an agent session by sending its context to the LLM as a prompt
  static async eval(session_id) {
    try {
      const state = await Agent.state(session_id);
      // if (state !== 'success') {
      //   utils.abort(`Cannot eval session ${session_id} in state ${state}`);
      // }
      await Agent.state(session_id, 'running');

      const sessionFileName = `${session_id}.yaml`;
      const sessionPath = path.join(_G.SESSIONS_DIR, sessionFileName);
      const sessionContent = await utils.readYaml(sessionPath);

      const capabilities = sessionContent.metadata.tools || [];

      // Smart MCP initialization: only load if agent needs MCP tools
      if (capabilities.length === 0) {
        // No tools specified - load all tools including MCP (backwards compat)
        const { ensureMCPInitialized } = await import('../tools/mcp.mjs');
        await ensureMCPInitialized();
      } else {
        // Check if any MCP tools are needed
        const needsMCP = capabilities.some(tool => tool.startsWith('mcp_'));
        if (needsMCP) {
          const { ensureMCPInitialized } = await import('../tools/mcp.mjs');
          await ensureMCPInitialized();
        }
        // else: Skip MCP entirely for better performance
      }

      const availableTools = [];
      for (const name in _G.tools) {
        if (capabilities.includes(name)) {
          availableTools.push(_G.tools[name]);
        }
      }
      const toolDefinitions = Tool.prepareToolsForAPI(availableTools);

      let sessionUpdated = await Agent.processPendingToolCalls(sessionContent, session_id);
      const system_prompt = sessionContent.spec.system_prompt || 'You are a helpful assistant.';
      const messages = [{ role: 'system', content: system_prompt }];
      let last_message = {};


      // Get last_read timestamp to avoid repeating already logged messages
      const lastRead = await Session.getLastRead(session_id);

      // Set session first message time for relative timestamp calculation
      const allMessages = sessionContent.spec.messages || [];
      if (allMessages.length > 0 && allMessages[0].ts) {
        _G.sessionFirstMessageTime = allMessages[0].ts;
      }

      for (const message of allMessages) {
        messages.push(_.omit(message, ['ts']));

        // Only log messages that are newer than last_read timestamp
        const shouldLog = !lastRead || !message.ts || new Date(message.ts) > new Date(lastRead); if (shouldLog) {
          if (message.role == 'user') utils.logUser(message.content, message.ts);
          if (message.role == 'assistant' && message.content) utils.logAssistant(message.content, message.ts, sessionContent.metadata.provider, sessionContent.metadata.model, sessionContent.metadata.name);
          if (message.role == 'assistant' && message.tool_calls?.length > 0) {
            for (const tool_call of message.tool_calls) {
              utils.logToolCall(tool_call, message.ts);
              for (const message2 of allMessages) {
                if (message2.role == 'tool' && message2.tool_call_id == tool_call.id && message2.content) {
                  utils.logToolResponse(message2.content, message2.ts);
                }
              }
            }
          }
        }
        // TODO: request and log claude thought
        last_message = message;
      }

      if (
        // user has message pending for assistant
        (last_message.role == 'user') ||

        // user has run the tool and the result is pending for assistant
        (last_message.role == 'tool')
      ) {
        const response = await Agent.prompt({
          model: sessionContent.metadata.model,
          messages: messages,
          tools: toolDefinitions,
        });

        sessionContent.metadata.usage = response.usage;
        sessionContent.metadata.provider = response.provider; // Store provider name

        for (const choice of response.choices) {
          if (null == sessionContent.spec.messages) sessionContent.spec.messages = [];
          choice.message.ts = utils.unixToIso(_.get(response, 'created', utils.unixTime()));
          choice.message.finish_reason = choice.finish_reason;
          const msg2 = _.pick(choice.message, ['ts', 'role', 'content', 'tool_calls', 'finish_reason']);
          if (msg2.role == 'user') utils.logUser(msg2.content, msg2.ts);
          if (msg2.role == 'assistant' && msg2.content) utils.logAssistant(msg2.content, msg2.ts, response.provider, response.model, sessionContent.metadata.name);
          if (msg2.role == 'assistant' && msg2.tool_calls?.length > 0) {
            for (const tool_call of msg2.tool_calls) {
              utils.logToolCall(tool_call, msg2.ts);
            }
          }
          sessionContent.spec.messages.push(msg2);

          // Set session first message time ONLY if not already set
          // This should only be set once for the very first message (user prompt)
          if (!_G.sessionFirstMessageTime && msg2.ts) {
            _G.sessionFirstMessageTime = msg2.ts;
          }
        }

        sessionUpdated = true;

        // IMPROVEMENT: Immediately process any tool calls from the response
        // This creates a seamless flow: get response → approve tools → execute → finish
        // Benefits: no need to persist approval state, better UX
        const toolCallsAdded = response.choices.some(choice =>
          choice.message.tool_calls && choice.message.tool_calls.length > 0
        );

        if (toolCallsAdded) {
          const toolsExecuted = await Agent.processPendingToolCalls(sessionContent, session_id);
          if (toolsExecuted) {
            sessionUpdated = true;
          }
        }
      }

      let last_message_digest = '';
      if (null == sessionContent.spec.messages) sessionContent.spec.messages = [];
      for (const message of sessionContent.spec.messages) {
        const tool_calls = _.map(message.tool_calls, 'function.name').join(', ');
        last_message_digest = `${message.ts} ${message.role}: ${message.content || ''}${tool_calls ? `(tools: ${tool_calls})` : ''} `;
      }

      if (sessionUpdated) {
        await utils.writeYaml(sessionPath, sessionContent);
      }

      // Determine final state based on session completion status
      const sessionMessages = sessionContent.spec.messages || [];
      const lastMessage = sessionMessages[sessionMessages.length - 1];

      let finalState = 'success'; // Default to success

      if (lastMessage) {
        if (lastMessage.role === 'assistant') {
          // If assistant message has finish_reason: stop and no tool_calls, we're done
          if (lastMessage.finish_reason === 'stop' && (!lastMessage.tool_calls || lastMessage.tool_calls.length === 0)) {
            finalState = 'success';
          }
          // If assistant message has tool_calls, check if they were executed
          else if (lastMessage.tool_calls && lastMessage.tool_calls.length > 0) {
            // Check if all tool calls have corresponding tool results
            let allToolsExecuted = true;
            for (const toolCall of lastMessage.tool_calls) {
              const hasResult = sessionMessages.some(msg =>
                msg.role === 'tool' && msg.tool_call_id === toolCall.id
              );
              if (!hasResult) {
                allToolsExecuted = false;
                break;
              }
            }

            if (allToolsExecuted) {
              // All tools executed, assistant may need to respond to results
              finalState = 'pending';
            } else {
              // Tools still need execution (shouldn't happen with new flow, but safety)
              finalState = 'pending';
            }
          }
          // Other finish reasons might indicate more work needed
          else {
            finalState = 'pending';
          }
        }
        // If last message is tool result, assistant should respond to it
        else if (lastMessage.role === 'tool') {
          finalState = 'pending';
        }
        // If last message is from user, assistant needs to respond
        else if (lastMessage.role === 'user') {
          finalState = 'pending';
        }
      }

      // Update last_read timestamp to mark that logging is complete for this session
      // This prevents repetitive output in watch mode on subsequent iterations
      await Session.updateLastRead(session_id);

      await Agent.state(session_id, finalState);
      return {
        session_id,
        agent: sessionContent.metadata.name,
        model: sessionContent.metadata.model,
        last_message_digest,
        used_tokens: sessionContent.metadata.usage.total_tokens,
        final_state: finalState,
      };
    } catch (error) {
      await Agent.state(session_id, 'fail');
      utils.abort(error);
    }
  }

  // execute an agent tool
  static async tool(name, args, options = {}) {
    return Tool.execute(name, args, options.sessionId);
  }

  // process pending tool calls from session file
  static async processPendingToolCalls(sessionContent, session_id = null) {
    return Tool.processPendingCalls(sessionContent, session_id);
  }

  // perform one pump iteration - process all pending sessions
  static async pump() {
    const sessions = await Session.list();
    let pendingSessions = sessions.filter(s => s.bt_state === 'pending');

    // If watching a specific session, filter to only that session
    if (_G.watchSessionId) {
      pendingSessions = pendingSessions.filter(s => s.session_id === _G.watchSessionId);
    }

    // log(0 == pendingSessions.length ? 'debug' : 'info', `Processing ${pendingSessions.length} pending session(s)`);

    let processed = 0;
    for (const session of pendingSessions) {
      try {
        log('debug', `🔄 Processing session ${session.session_id} (${session.agent})`);
        await Agent.eval(session.session_id);
        processed++;
      } catch (error) {
        log('error', `❌ Failed to process session ${session.session_id}: ${error.message}`);
      }
    }

    return { processed, total: pendingSessions.length };
  }
}