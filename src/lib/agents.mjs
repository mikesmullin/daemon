const fs = await import('fs/promises');
const path = await import('path');
import yaml from 'js-yaml';
import ejs from 'ejs';
import { _G } from './globals.mjs';
import utils, { log } from './utils.mjs';
import color from './colors.mjs';
import { Copilot } from './copilot.mjs';
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
    return ['idle', 'running', 'success', 'fail'].includes(state);
  }

  // if bt_state is given, write the BT state for a given session_id
  // else return the current BT state for a given session_id
  // aborts if the state file does not exist, is invalid, or any error occurs
  static async state(session_id, bt_state) {
    if (bt_state) { // write
      const procPath = path.join(_G.PROC_DIR, `${session_id}`);
      if (!Agent._isValidBtState(bt_state)) {
        utils.abort(`Refuse to write ${procPath}. session: ${session_id}, invalid_state: ${bt_state}`);
      }
      try {
        await fs.writeFile(procPath, bt_state, 'utf-8');
        log('debug', `Wrote ${procPath}. session: ${session_id}, state: ${bt_state}`);
        return bt_state;
      } catch (err) {
        utils.abort(`Failed to write ${procPath}. session: ${session_id}, state: ${err.message}`);
      }
    }
    else { // read
      try {
        const sessionPath = path.join(_G.PROC_DIR, session_id);
        const stats = await fs.stat(sessionPath);
        if (!stats.isFile()) {
          utils.abort(`BT state path for session ${session_id} is not a file`);
        }

        const bt_state_raw = await fs.readFile(sessionPath, 'utf-8');
        const bt_state = bt_state_raw.trim();
        if (!Agent._isValidBtState(bt_state)) {
          utils.abort(`Invalid BT state "${bt_state}" for session ${session_id}`);
        }
        return bt_state;
      } catch (error) {
        if (error.code === 'ENOENT') {
          utils.abort(`BT state file for session ${session_id} not found`);
        } else {
          utils.abort(`Failed to read BT state for session ${session_id}: ${error.message}`);
        }
      }
    }
  }

  // list agent sessions and their BT state
  static async list() {
    try {
      log('debug', `Listing sessions in ${_G.PROC_DIR}`);

      const session_ids = await fs.readdir(_G.PROC_DIR);
      const sessions = [];

      for (const session_id of session_ids) {
        if ('_next' == session_id) continue;
        const bt_state = await Agent.state(session_id);
        if (bt_state) {
          // Read session file to get additional details
          const sessionFileName = `${session_id}.yaml`;
          const sessionPath = path.join(_G.SESSIONS_DIR, sessionFileName);

          let agent = 'unknown';
          let model = 'unknown';
          let last_message = '';

          try {
            const sessionContent = await fs.readFile(sessionPath, 'utf-8');
            const sessionData = yaml.load(sessionContent);

            // Extract agent and model from metadata
            if (sessionData.metadata) {
              agent = sessionData.metadata.name || 'unknown';
              model = sessionData.metadata.model || 'unknown';
            }

            // Extract last message
            if (sessionData.spec.messages && sessionData.spec.messages.length > 0) {
              const lastMsg = sessionData.spec.messages[sessionData.spec.messages.length - 1];
              // Format as "timestamp role: content" (no truncation here - let outputAs handle it)
              const content = lastMsg.content || '';
              last_message = `${lastMsg.ts || ''} ${lastMsg.role || ''}: ${content}`;
            }
          } catch (fileError) {
            log('debug', `Could not read session file ${sessionFileName}: ${fileError.message}`);
          }

          sessions.push({
            session_id: session_id,
            bt_state,
            agent,
            model,
            last_message
          });
        }
      }

      return sessions;
    } catch (error) {
      log('error', `Failed to list sessions: ${error.message}`);
      return [];
    }
  }

  // generate the next agent session ID (a monotonically increasing integer)
  static async nextId() {
    try {
      const raw = await fs.readFile(_G.NEXT_PATH, 'utf-8');
      if (!/^\d+$/.test(raw)) {
        utils.abort(`Corrupt next file value "${raw}"`);
      }
      const next = String(+raw + 1);
      await fs.writeFile(_G.NEXT_PATH, next, 'utf-8');
      return raw;
    } catch (err) {
      if (err.code === 'ENOENT') {
        await fs.writeFile(_G.NEXT_PATH, '1', 'utf-8');
        return '0';
      }
      utils.abort(`Failed allocating next session id: ${err.message}`);
    }
  }

  // mark an agent session with a new BT state
  static async kill(session_id, bt_state = 'fail') {
    return await Agent.state(session_id, bt_state);
  }

  // append a new user message to an agent session
  static async push(session_id, prompt) {
    try {
      const sessionFileName = `${session_id}.yaml`;
      const sessionPath = path.join(_G.SESSIONS_DIR, sessionFileName);
      const sessionContent = await utils.readYaml(sessionPath);

      // Initialize messages array if it doesn't exist
      if (!sessionContent.spec.messages) {
        sessionContent.spec.messages = [];
      }

      // Add new user message with timestamp
      const newMessage = {
        ts: new Date().toISOString(),
        role: 'user',
        content: prompt
      };

      sessionContent.spec.messages.push(newMessage);
      const messageId = sessionContent.spec.messages.length - 1;

      // Write back to file
      await utils.writeYaml(sessionPath, sessionContent);

      // Return detailed information about the appended message
      return {
        session_id: session_id,
        message_id: messageId,
        ts: newMessage.ts,
        role: newMessage.role,
        message: newMessage.content
      };
    } catch (error) {
      utils.abort(`Failed to push message to session ${session_id}: ${error.message}`);
    }
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

      const toolDefinitions = [];
      const capabilities = sessionContent.metadata.tools || [];
      for (const name in _G.tools) {
        if (capabilities.includes(name)) {
          toolDefinitions.push(_G.tools[name].definition);
        }
      }

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

      await Agent.state(session_id, 'idle');
      return {
        session_id,
        agent: sessionContent.metadata.name,
        model: sessionContent.metadata.model,
        last_message_digest,
        used_tokens: sessionContent.metadata.usage.total_tokens,
      };
    } catch (error) {
      await Agent.state(session_id, 'fail');
      utils.abort(error.message);
    }
  }

  // execute an agent tool
  static async tool(name, args, options = {}) {
    const tool = _G.tools[name];
    utils.assert(tool, `Unknown tool: ${name} `);

    try {
      // Set session context if available
      const sessionId = options.sessionId;
      if (sessionId !== undefined) {
        _G.currentSessionId = sessionId;
      }

      const result = await tool.execute(args, options);
      return result;
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // process pending tool calls from session file
  static async processPendingToolCalls(sessionContent, session_id = null) {
    if (!sessionContent.spec?.messages) {
      return;
    }

    let sessionUpdated = false;

    // Find tool_calls messages and process pending calls
    for (const message of sessionContent.spec.messages) {
      if (message.role === 'assistant' && message.tool_calls) {
        for (const toolCall of message.tool_calls) {
          // Check if this tool call needs to be executed
          let shouldExecute = true;
          // for (const attempt of sessionContent.metadata.attempts || []) {
          //   if (attempt.tool_call_id === toolCall.id) {
          //     shouldExecute = false;
          //     break;
          //   }
          // }
          for (const message2 of sessionContent.spec.messages) {
            if (message2.role == 'tool' && message2.tool_call_id == toolCall.id) {
              shouldExecute = false;
              break;
            }
          }

          if (shouldExecute) {
            log('warn', `🔧 Executing tool call ${color.bold(toolCall.function.name)} #${toolCall.id}`);

            // Update attempts tracking
            // if (!sessionContent.metadata.attempts) {
            //   sessionContent.metadata.attempts = [];
            // }
            // sessionContent.metadata.attempts.push({
            //   tool_call_id: toolCall.id,
            //   lastRunAt: new Date().toISOString()
            // });
            // sessionUpdated = true;

            try {
              // Parse arguments and execute the tool
              const args = JSON.parse(toolCall.function.arguments);
              const result = await Agent.tool(toolCall.function.name, args, { sessionId: session_id });
              const content = result.content ? result.content : JSON.stringify(result, null, 2);

              // Add tool result message to session
              sessionContent.spec.messages.push({
                ts: new Date().toISOString(),
                role: 'tool',
                tool_call_id: toolCall.id,
                content,
              });

              if (content) {
                console.log(content);
              }
              if (true == result.success) {
                log('info', `✅ Tool ${color.bold(toolCall.function.name)} succeeded. #${toolCall.id}`);
              }
              else {
                log('error', `❌ Tool ${color.bold(toolCall.function.name)} failed. #${toolCall.id} Error: ${content}`);
              }
            } catch (error) {
              // Add error result message to session
              sessionContent.spec.messages.push({
                ts: new Date().toISOString(),
                role: 'tool_result',
                content: {
                  success: false,
                  error: error.message
                },
                tool_call_id: toolCall.id
              });

              log('error', `Error during Tool call ${color.bold(toolCall.function.name)}.error: `, error.message);
            }

            sessionUpdated = true;
          }
        }
      }
    }

    return sessionUpdated;
  }

  // // perform a single step of the agent orchestrator loop
  // static async step() {
  //   // find all sessions
  //   const sessions = await Agent.list();

  //   const a1 = await Agent.fork('planner');
  //   console.debug(`Forked new agent session: ${ a1 } `);
  //   const as1 = await Agent.state(a1);
  //   console.debug(`Session ${ a1 } state: ${ as1 } `);

  //   const a2 = await Agent.fork('executor');
  //   console.debug(`Forked new agent session: ${ a2 } `);
  //   const as2 = await Agent.state(a2);
  //   console.debug(`Session ${ a2 } state: ${ as2 } `);

  //   // const response = await Agent.eval(a1);
  //   // console.debug(`Session ${ a1 } evaluation response: `, response);    
  // }
}