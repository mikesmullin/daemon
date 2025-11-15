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
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import * as observability from './observability.mjs';

// Get the directory of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Auto-register all tools
import '../tools/fs.mjs';
import '../tools/agent.mjs';
import '../tools/web.mjs';
import '../tools/gemini-image.mjs';
import '../tools/mcp.mjs';
import '../tools/human.mjs';

// Auto-register all plugins
// Plugins are dynamically loaded from plugins/**/index.mjs
async function loadPlugins() {
  try {
    const pluginsDir = path.join(__dirname, '../../plugins');

    // Check if plugins directory exists
    try {
      await fs.access(pluginsDir);
    } catch {
      // Plugins directory doesn't exist, skip loading
      log('debug', '📦 No plugins directory found, skipping plugin loading');
      return;
    }

    const entries = await fs.readdir(pluginsDir, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const pluginIndexPath = path.join(pluginsDir, entry.name, 'index.mjs');

        try {
          await fs.access(pluginIndexPath);

          // Import the plugin module
          const pluginModule = await import(pluginIndexPath);

          // Call the default export (plugin registration function) if it exists
          if (typeof pluginModule.default === 'function') {
            // Pass _G and utils to the plugin for registration
            pluginModule.default({ ..._G, utils });
            log('debug', `✅ Loaded plugin: ${entry.name}`);
          } else {
            log('warn', `⚠️  Plugin ${entry.name} does not export a default registration function`);
          }
        } catch (error) {
          if (error.code !== 'ENOENT') {
            // Extract just the first line of error message for brevity
            const errorMsg = error.message.split('\n')[0];
            log('warn', `⚠️  Failed to load plugin ${entry.name}: ${errorMsg}. Run 'bun install' to verify plugin dependencies.`);
          }
          // If index.mjs doesn't exist, skip this plugin silently
        }
      }
    }
  } catch (error) {
    log('warn', `⚠️  Error loading plugins: ${error.message}`);
  }
}

// Load plugins immediately
await loadPlugins();

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

  // list available agent templates from agents/templates/*.yaml
  static async listAvailable() {
    try {
      const templates = [];

      // Read all yaml files from templates directory
      const files = await fs.readdir(_G.TEMPLATES_DIR);

      for (const file of files) {
        if (file.endsWith('.yaml')) {
          const agentName = path.basename(file, '.yaml');
          const templatePath = path.join(_G.TEMPLATES_DIR, file);

          try {
            const templateContent = await utils.readYaml(templatePath);

            // Only include agents with 'subagent' label
            const labels = templateContent.metadata?.labels || [];
            if (labels.includes('subagent')) {
              templates.push({
                name: agentName,
                description: templateContent.metadata?.description || '',
                model: templateContent.metadata?.model || 'unknown',
                tools: templateContent.metadata?.tools || []
              });
            }
          } catch (error) {
            log('debug', `Warning: Could not read template ${file}: ${error.message}`);
          }
        }
      }

      return templates;
    } catch (error) {
      throw new Error(`Failed to list available agents: ${error.message}`);
    }
  }

  // list running subagent sessions (with 'subagent' label, not deleted)
  static async listRunning() {
    try {
      const allSessions = await Agent.list();

      // Filter to only include sessions with 'subagent' label and not deleted
      const result = allSessions.filter(session => {
        return session.labels &&
          session.labels.includes('subagent') &&
          (!session.labels.includes('deleted'));
      });

      return result;
    } catch (error) {
      throw new Error(`Failed to list running agents: ${error.message}`);
    }
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
  static async fork({ agent, session_id, prompt = null, labels = [] }) {
    try {
      // Generate new session ID
      const new_session_id = await Agent.nextId();

      await Agent.state(new_session_id, 'success');

      let sessionContent = {};
      if (null != session_id) {
        // Forking from an existing session
        const existingSessionFileName = `${session_id}.yaml`;
        const existingSessionPath = path.join(_G.SESSIONS_DIR, existingSessionFileName);
        sessionContent = await utils.readYaml(existingSessionPath);
        utils.assert(sessionContent.apiVersion == 'daemon/v1');
        utils.assert(sessionContent.kind == 'Agent');

        if (null == agent) {
          // Get agent name from the session's metadata.name
          agent = sessionContent.metadata?.name || 'unknown';
        }
      }
      else {
        // Creating from a template
        // Support multi-path template resolution:
        // 1. Check current working directory (process.cwd())
        // 2. Check workspace root templates directory (_G.TEMPLATES_DIR)
        
        // Strip .yaml extension if provided by user
        const agentName = agent.endsWith('.yaml') ? agent.slice(0, -5) : agent;
        
        const searchPaths = [
          // Path 1: Current working directory
          path.join(process.cwd(), `${agentName}.yaml`),
          // Path 2: Workspace root templates directory (for bare names like 'solo')
          path.join(_G.TEMPLATES_DIR, `${agentName}.yaml`),
          // Path 3: Workspace root templates directory with agent as path
          path.join(_G.TEMPLATES_DIR, agent.endsWith('.yaml') ? agent : `${agent}.yaml`)
        ];
        
        let templatePath = null;
        let foundPath = null;
        
        // Try each search path in order
        for (const searchPath of searchPaths) {
          try {
            await fs.access(searchPath);
            foundPath = searchPath;
            log('debug', `✅ Found agent template at: ${searchPath}`);
            break;
          } catch (error) {
            log('debug', `❌ Agent template not found at: ${searchPath}`);
          }
        }
        
        if (!foundPath) {
          const searchPathsFormatted = searchPaths.map(p => `  - ${p}`).join('\n');
          utils.abort(
            `Agent template "${agent}" not found.\n\n` +
            `Searched in:\n${searchPathsFormatted}\n\n` +
            `Available templates: ${await Agent.listAvailable().then(t => t.map(a => a.name).join(', '))}`
          );
        }
        
        templatePath = foundPath;
        sessionContent = await utils.readYaml(templatePath);

        // Ensure spec exists (YAML parses empty "spec:" as null)
        if (!sessionContent.spec) {
          sessionContent.spec = {};
        }

        // render EJS in system prompt template, if present
        if (sessionContent.spec.system_prompt) {
          sessionContent.spec.system_prompt = ejs.render(sessionContent.spec.system_prompt, {
            os,
          });
        }

        // Store the template name in metadata.name for session tracking
        if (!sessionContent.metadata) {
          sessionContent.metadata = {};
        }
        sessionContent.metadata.name = agent;
      }

      // Merge labels: start with template labels (if any), then add new labels
      if (!sessionContent.metadata) {
        sessionContent.metadata = {};
      }

      const templateLabels = sessionContent.metadata.labels || [];
      const mergedLabels = [...new Set([...templateLabels, ...labels])]; // Use Set to avoid duplicates

      if (mergedLabels.length > 0) {
        sessionContent.metadata.labels = mergedLabels;
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
          if (message.role == 'assistant' && message.content) utils.logAssistant(message.content, message.ts, sessionContent.metadata.provider, sessionContent.metadata.model, sessionContent.metadata.name, session_id);
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
        // Check if user interrupted in interactive mode
        if (_G.signalHandler.interruptRequested && _G.cliFlags.interactive) {
          log('debug', '⚠️  User interrupted - prompting for new input');
          _G.signalHandler.interruptRequested = false;
          
          // Import TUI prompt module
          const { prompt: tuiPrompt } = await import('../lib/tui.mjs');
          
          // Set FSM state to ask_human
          _G.fsmState = 'ask_human';
          
          // Prompt user for new input
          const userInput = await tuiPrompt('> ');
          
          // Reset FSM state
          _G.fsmState = 'normal';
          
          if (userInput && userInput.trim()) {
            // Add user's new input as a message
            const newUserMessage = {
              ts: utils.unixToIso(utils.unixTime()),
              role: 'user',
              content: userInput.trim()
            };
            
            if (null == sessionContent.spec.messages) sessionContent.spec.messages = [];
            sessionContent.spec.messages.push(newUserMessage);
            sessionUpdated = true;
            
            // Update last_message to reflect the new user input
            last_message = newUserMessage;
            
            // Log the new user message
            utils.logUser(newUserMessage.content, newUserMessage.ts);
            
            // Save the session with the new message
            await utils.writeYaml(sessionPath, sessionContent);
            
            // Update lastRead to prevent re-logging
            await Session.updateLastRead(session_id, newUserMessage.ts);
            
            // Rebuild messages array for API call
            messages.push(_.omit(newUserMessage, ['ts']));
          } else {
            // User provided empty input, continue with original flow
            log('debug', 'Empty input received, continuing agent execution');
          }
        }

        const response = await Agent.prompt({
          model: sessionContent.metadata.model,
          messages: messages,
          tools: toolDefinitions,
        });

        // Check if user interrupted in interactive mode after API response
        if (_G.signalHandler.interruptRequested && _G.cliFlags.interactive) {
          log('debug', '⚠️  User interrupted - prompting for new input');
          _G.signalHandler.interruptRequested = false;
          
          // Import TUI prompt module
          const { prompt: tuiPrompt } = await import('../lib/tui.mjs');
          
          // Set FSM state to ask_human
          _G.fsmState = 'ask_human';
          
          // Prompt user for new input
          const userInput = await tuiPrompt('> ');
          
          // Reset FSM state
          _G.fsmState = 'normal';
          
          if (userInput && userInput.trim()) {
            // Add user's new input as a message
            const newUserMessage = {
              ts: utils.unixToIso(utils.unixTime()),
              role: 'user',
              content: userInput.trim()
            };
            
            if (null == sessionContent.spec.messages) sessionContent.spec.messages = [];
            sessionContent.spec.messages.push(newUserMessage);
            
            // Log the new user message
            utils.logUser(newUserMessage.content, newUserMessage.ts);
            
            // Save the session with the new message
            await utils.writeYaml(sessionPath, sessionContent);
            
            // Update lastRead to prevent re-logging
            await Session.updateLastRead(session_id, newUserMessage.ts);
            
            // Set state to pending so agent will be re-evaluated with new message
            await Agent.state(session_id, 'pending');
            return;
          } else {
            // User provided empty input, continue with normal flow
            log('debug', 'Empty input received, continuing agent execution');
          }
        }

        // Emit observability event for assistant response
        if (response.choices && response.choices.length > 0) {
          const choice = response.choices[0];
          if (choice.message.content) {
            observability.emitResponse(
              session_id,
              sessionContent.metadata.name,
              choice.message.content,
              sessionContent.metadata.model,
              response.usage?.total_cost,
              response.usage?.total_tokens
            );
          }
          if (choice.message.tool_calls && choice.message.tool_calls.length > 0) {
            for (const tool_call of choice.message.tool_calls) {
              observability.emitToolCall(
                session_id,
                sessionContent.metadata.name,
                tool_call.function.name,
                JSON.parse(tool_call.function.arguments || '{}')
              );
            }
          }
        }

        sessionContent.metadata.usage = response.usage;
        sessionContent.metadata.provider = response.provider; // Store provider name

        // Check if response has no choices (empty response from LLM)
        // This indicates the conversation is complete - the LLM has nothing more to say
        const emptyResponse = !response.choices || response.choices.length === 0;

        if (emptyResponse) {
          log('debug', '🏁 LLM returned empty response - conversation complete');
          // Add a marker message to indicate LLM chose not to respond
          if (null == sessionContent.spec.messages) sessionContent.spec.messages = [];
          sessionContent.spec.messages.push({
            ts: utils.unixToIso(_.get(response, 'created', utils.unixTime())),
            role: 'assistant',
            content: '',
            finish_reason: 'empty'  // Custom finish reason: LLM was given a chance but chose not to respond
          });
          sessionUpdated = true;
        } else {
          for (const choice of response.choices) {
            if (null == sessionContent.spec.messages) sessionContent.spec.messages = [];
            choice.message.ts = utils.unixToIso(_.get(response, 'created', utils.unixTime()));
            choice.message.finish_reason = choice.finish_reason;
            const msg2 = _.pick(choice.message, ['ts', 'role', 'content', 'tool_calls', 'finish_reason']);
            if (msg2.role == 'user') utils.logUser(msg2.content, msg2.ts);
            if (msg2.role == 'assistant' && msg2.content) utils.logAssistant(msg2.content, msg2.ts, response.provider, response.model, sessionContent.metadata.name, session_id);
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
          // If assistant message has finish_reason: empty, LLM chose not to respond - conversation complete
          else if (lastMessage.finish_reason === 'empty') {
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
              // All tools executed. Check if the last tool result was followed by another assistant message
              // Find the index of the last tool result for this set of tool calls
              let lastToolResultIndex = -1;
              for (let i = sessionMessages.length - 1; i >= 0; i--) {
                if (sessionMessages[i].role === 'tool') {
                  const toolCallId = sessionMessages[i].tool_call_id;
                  const belongsToLastAssistant = lastMessage.tool_calls.some(tc => tc.id === toolCallId);
                  if (belongsToLastAssistant) {
                    lastToolResultIndex = i;
                    break;
                  }
                }
              }

              // If there's a tool result and it's the last message, give assistant a chance to respond
              if (lastToolResultIndex === sessionMessages.length - 1) {
                finalState = 'pending';
              } else {
                // Tool results were processed and assistant already responded (or chose not to)
                // This means the conversation is complete
                finalState = 'success';
              }
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
      
      // Emit STOP hook if session completed
      if (finalState === 'success') {
        observability.emitHook('STOP', session_id, sessionContent.metadata.name, {
          reason: lastMessage?.finish_reason || 'completed'
        });
      }
      
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
    let pendingSessions = sessions.filter(s => s.state === 'pending');

    // If watching a specific session, filter to only that session
    if (_G.cliFlags?.session) {
      pendingSessions = pendingSessions.filter(s => s.session_id === _G.cliFlags.session);
    }

    // If filtering by labels, ensure session has all required labels
    if (_G.cliFlags?.labels && _G.cliFlags.labels.length > 0) {
      pendingSessions = pendingSessions.filter(s => {
        // Session must have labels array
        if (!s.labels || !Array.isArray(s.labels)) {
          return false;
        }

        // Session must contain ALL required labels (AND logic)
        return _G.cliFlags.labels.every(requiredLabel => s.labels.includes(requiredLabel));
      });
    }

    // log(0 == pendingSessions.length ? 'debug' : 'info', `Processing ${pendingSessions.length} pending session(s)`);

    const concurrencyLimit = _G.cliFlags?.concurrency;
    let processed = 0;

    // Helper function to process a single session
    const processSession = async (session) => {
      try {
        log('debug', `🔄 Processing session ${session.session_id} (${session.agent})`);
        await Agent.eval(session.session_id);
        return { success: true, session_id: session.session_id };
      } catch (error) {
        log('error', `❌ Failed to process session ${session.session_id}: ${error.message}`);
        return { success: false, session_id: session.session_id, error };
      }
    };

    if (concurrencyLimit && concurrencyLimit > 0) {
      // Process in batches with concurrency limit
      for (let i = 0; i < pendingSessions.length; i += concurrencyLimit) {
        const batch = pendingSessions.slice(i, i + concurrencyLimit);
        log('debug', `🔄 Processing batch of ${batch.length} sessions (limit: ${concurrencyLimit})`);
        
        const results = await Promise.allSettled(batch.map(processSession));
        
        // Count successful processes
        processed += results.filter(r => r.status === 'fulfilled' && r.value.success).length;
      }
    } else {
      // No concurrency limit - process all in parallel
      if (pendingSessions.length > 0) {
        log('debug', `🔄 Processing ${pendingSessions.length} sessions in parallel (no limit)`);
      }
      
      const results = await Promise.allSettled(pendingSessions.map(processSession));
      
      // Count successful processes
      processed = results.filter(r => r.status === 'fulfilled' && r.value.success).length;
    }

    return { processed, total: pendingSessions.length };
  }
}