const fs = await import('fs/promises');
const path = await import('path');
import yaml from 'js-yaml';
import ejs from 'ejs';
import { _G } from './globals.mjs';
import utils, { log } from './utils.mjs';
import color from './colors.mjs';
import { Copilot } from './copilot.mjs';
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

export class Agent {
  // Agents follow BehaviorTree (BT) patterns
  // each Agent can have zero or more Sessions
  // every Session has a corresponding BT state
  // valid BT states are: idle, running, success, fail
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

      await Agent.state(new_session_id, 'idle');

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
    await Copilot.init();
    log('debug', '🤖 Copilot API Request');
    const response = await Copilot.client.chat.completions.create({
      model: model || 'claude-sonnet-4',
      messages: messages,
      tools: tools,
      // max_tokens, // ie. 300
      max_tokens: 300
    });
    log('debug', '🤖 Copilot API Response: ' + JSON.stringify(response, null, 2));
    return response;
  }

  // evaluate an agent session by sending its context to the LLM as a prompt
  static async eval(session_id) {
    try {
      const state = await Agent.state(session_id);
      // if (state !== 'idle') {
      //   utils.abort(`Cannot eval session ${session_id} in state ${state}`);
      // }
      await Agent.state(session_id, 'running');

      const sessionFileName = `${session_id}.yaml`;
      const sessionPath = path.join(_G.SESSIONS_DIR, sessionFileName);
      const sessionContent = await utils.readYaml(sessionPath);

      const capabilities = sessionContent.metadata.tools || [];
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
      for (const message of (sessionContent.spec.messages || [])) {
        messages.push(_.omit(message, ['ts']));
        if (message.role == 'user') utils.logUser(message.content);
        if (message.role == 'assistant' && message.content) utils.logAssistant(message.content);
        if (message.role == 'assistant' && message.tool_calls?.length > 0) {
          for (const tool_call of message.tool_calls) {
            log('info', `🔧 Tool call: ${color.bold(tool_call.function.name)}(${tool_call.function.arguments})`);
            for (const message2 of (sessionContent.spec.messages || [])) {
              if (message2.role == 'tool' && message2.tool_call_id == tool_call.id && message2.content) {
                console.log(message2.content);
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
        for (const choice of response.choices) {
          if (null == sessionContent.spec.messages) sessionContent.spec.messages = [];
          choice.message.ts = utils.unixToIso(_.get(response, 'created', utils.unixTime()));
          choice.message.finish_reason = choice.finish_reason;
          const msg2 = _.pick(choice.message, ['ts', 'role', 'content', 'tool_calls', 'finish_reason']);
          if (msg2.role == 'user') utils.logUser(msg2.content);
          if (msg2.role == 'assistant' && msg2.content) utils.logAssistant(msg2.content);
          if (msg2.role == 'assistant' && msg2.tool_calls?.length > 0) {
            for (const tool_call of msg2.tool_calls) {
              log('info', `🔧 Tool call: ${color.bold(tool_call.function.name)}(${tool_call.function.arguments})`);
            }
          }
          sessionContent.spec.messages.push(msg2);
        }

        sessionUpdated = true;
        
        // IMPROVEMENT: Immediately process any tool calls from the response
        // This creates a seamless flow: get response → approve tools → execute → finish
        // Benefits: no need to persist approval state, better UX
        const toolCallsAdded = response.choices.some(choice => 
          choice.message.tool_calls && choice.message.tool_calls.length > 0
        );
        
        if (toolCallsAdded) {
          log('info', '🔄 Processing tool calls immediately...');
          const toolsExecuted = await Agent.processPendingToolCalls(sessionContent, session_id);
          if (toolsExecuted) {
            sessionUpdated = true;
            log('info', '✅ Tool execution completed in same eval pass');
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

      let finalState = 'idle'; // Default to idle

      if (lastMessage) {
        if (lastMessage.role === 'assistant') {
          // If assistant message has tool_calls, check if they were executed
          if (lastMessage.tool_calls && lastMessage.tool_calls.length > 0) {
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
          // If assistant message has finish_reason: stop and no tool_calls, we're done
          else if (lastMessage.finish_reason === 'stop') {
            finalState = 'idle';
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
      utils.abort(error.message);
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
    const pendingSessions = sessions.filter(s => s.bt_state === 'pending');

    // log(0 == pendingSessions.length ? 'debug' : 'info', `Processing ${pendingSessions.length} pending session(s)`);

    let processed = 0;
    for (const session of pendingSessions) {
      try {
        log('info', `🔄 Processing session ${session.session_id} (${session.agent})`);
        await Agent.eval(session.session_id);
        processed++;
      } catch (error) {
        log('error', `❌ Failed to process session ${session.session_id}: ${error.message}`);
      }
    }

    return { processed, total: pendingSessions.length };
  }
}