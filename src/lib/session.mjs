const fs = await import('fs/promises');
const path = await import('path');
import yaml from 'js-yaml';
import ejs from 'ejs';
import { _G } from './globals.mjs';
import utils, { log } from './utils.mjs';
import os from 'os';

/**
 * Session Management Class
 * 
 * Handles all session-related operations including CRUD, BT state management,
 * and message transformation utilities for API compatibility.
 */
export class Session {

  // =============================================================================
  // BT STATE MANAGEMENT (moved from Agent class)
  // =============================================================================

  /**
   * Validate BT (Behavior Tree) state values
   */
  static _isValidBtState(state) {
    return ['pending', 'running', 'fail', 'success'].includes(state);
  }

  /**
   * Set or get BT state for a session
   * BT states are stored as lock files in _G.PROC_DIR
   * 
   * @param {string} session_id - The session identifier
   * @param {string} bt_state - Optional state to set
   * @returns {Promise<string>} The BT state
   */
  static async state(session_id, bt_state) {
    if (bt_state) { // write
      const procPath = path.join(_G.PROC_DIR, `${session_id}`);
      if (!Session._isValidBtState(bt_state)) {
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
        if (!Session._isValidBtState(bt_state)) {
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

  /**
   * Set BT state for a session
   */
  static async setState(session_id, bt_state) {
    return await Session.state(session_id, bt_state);
  }

  /**
   * Get BT state for a session
   */
  static async getState(session_id) {
    return await Session.state(session_id);
  }

  // =============================================================================
  // SESSION CRUD OPERATIONS
  // =============================================================================

  /**
   * Generate the next session ID (monotonically increasing integer)
   */
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

  /**
   * Load session data from YAML file with validation
   */
  static async load(session_id) {
    try {
      const sessionFileName = `${session_id}.yaml`;
      const sessionPath = path.join(_G.SESSIONS_DIR, sessionFileName);
      return await utils.readYaml(sessionPath);
    } catch (error) {
      utils.abort(`Failed to load session ${session_id}: ${error.message}`);
    }
  }

  /**
   * Save session data to YAML file with consistent formatting
   */
  static async save(session_id, sessionContent) {
    try {
      const sessionFileName = `${session_id}.yaml`;
      const sessionPath = path.join(_G.SESSIONS_DIR, sessionFileName);
      await utils.writeYaml(sessionPath, sessionContent);
    } catch (error) {
      utils.abort(`Failed to save session ${session_id}: ${error.message}`);
    }
  }

  /**
   * Get the last read timestamp for a session
   * Used to track which messages have already been logged to avoid repetition
   */
  static async getLastRead(session_id) {
    try {
      const sessionContent = await Session.load(session_id);
      return sessionContent.metadata?.last_read || null;
    } catch (error) {
      log('debug', `Could not get last_read for session ${session_id}: ${error.message}`);
      return null;
    }
  }

  /**
   * Update the last read timestamp for a session
   * This marks when the session was last processed for logging to avoid repetitive output
   */
  static async updateLastRead(session_id, timestamp = null) {
    try {
      const sessionContent = await Session.load(session_id);

      // Initialize metadata if it doesn't exist
      if (!sessionContent.metadata) {
        sessionContent.metadata = {};
      }

      // Use provided timestamp or current time
      const readTimestamp = timestamp || new Date().toISOString();
      sessionContent.metadata.last_read = readTimestamp;

      await Session.save(session_id, sessionContent);
      return readTimestamp;
    } catch (error) {
      log('debug', `Could not update last_read for session ${session_id}: ${error.message}`);
      return null;
    }
  }  /**
   * Create a new session from an agent template
   */
  static async new(agent, prompt = null) {
    try {
      const new_session_id = await Session.nextId();

      // Set initial state based on whether there's work to do
      const initialState = prompt ? 'pending' : 'success';
      await Session.setState(new_session_id, initialState);

      const templateFileName = `${agent}.yaml`;
      const templatePath = path.join(_G.TEMPLATES_DIR, templateFileName);
      const sessionContent = await utils.readYaml(templatePath);

      // Render EJS in system prompt template, if present
      if (sessionContent.spec.system_prompt) {
        sessionContent.spec.system_prompt = ejs.render(sessionContent.spec.system_prompt, {
          os,
        });
      }

      await Session.save(new_session_id, sessionContent);

      if (prompt) {
        await Session.push(new_session_id, prompt);
      }

      return {
        session_id: new_session_id,
        agent,
        prompt,
      };
    } catch (error) {
      utils.abort(`Failed to create new session for agent ${agent}: ${error.message}`);
    }
  }

  /**
   * Fork an existing session
   */
  static async fork(session_id, prompt = null) {
    try {
      const new_session_id = await Session.nextId();

      // Set initial state based on whether there's work to do
      const initialState = prompt ? 'pending' : 'success';
      await Session.setState(new_session_id, initialState);

      const sessionContent = await Session.load(session_id);
      utils.assert(sessionContent.apiVersion == 'daemon/v1');
      utils.assert(sessionContent.kind == 'Agent');

      await Session.save(new_session_id, sessionContent);

      if (prompt) {
        await Session.push(new_session_id, prompt);
      }

      return {
        session_id: new_session_id,
        agent: sessionContent.metadata.name,
        prompt,
      };
    } catch (error) {
      utils.abort(`Failed to fork session ${session_id}: ${error.message}`);
    }
  }

  /**
   * Add a user message to a session
   */
  static async push(session_id, prompt) {
    try {
      const sessionContent = await Session.load(session_id);

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

      await Session.save(session_id, sessionContent);

      // Set session to pending since new work was added
      await Session.setState(session_id, 'pending');

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

  /**
   * List all agent sessions with their current state
   */
  static async list() {
    try {
      log('debug', `Listing sessions in ${_G.PROC_DIR}`);

      const session_ids = await fs.readdir(_G.PROC_DIR);
      const sessions = [];

      for (const session_id of session_ids) {
        if ('_next' == session_id || /_last_read$/.test(session_id)) continue;
        const bt_state = await Session.getState(session_id);
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

  // =============================================================================
  // MESSAGE TRANSFORMATION UTILITIES (CRITICAL AREAS - HEAVILY COMMENTED)
  // =============================================================================

  /**
   * CRITICAL: Prepare messages for Copilot/Claude API compatibility
   * 
   * This function strips custom metadata fields before sending to the API.
   * The Copilot/Claude API expects only specific fields in message objects:
   * - role: 'system' | 'user' | 'assistant' | 'tool'
   * - content: string content of the message
   * - tool_calls: array of tool calls (for assistant messages)
   * - tool_call_id: ID linking tool results to calls (for tool messages)
   * 
   * Custom fields like 'ts' (timestamp), 'finish_reason', and any other metadata
   * MUST be filtered out or the API will reject the request with validation errors.
   * 
   * This filtering allows us to store rich metadata locally while maintaining
   * strict API compatibility for external service calls.
   * 
   * @param {Array} messages - Array of message objects with potential metadata
   * @returns {Array} API-compatible message objects
   */
  static prepareMessagesForAPI(messages) {
    return messages.map(message => {
      // Keep only API-compatible fields
      const apiMessage = {
        role: message.role,
        content: message.content
      };

      // Include tool_calls for assistant messages if present
      if (message.tool_calls) {
        apiMessage.tool_calls = message.tool_calls;
      }

      // Include tool_call_id for tool result messages if present
      if (message.tool_call_id) {
        apiMessage.tool_call_id = message.tool_call_id;
      }

      // Explicitly exclude: ts, finish_reason, and any other custom fields
      return apiMessage;
    });
  }

  /**
   * CRITICAL: Normalize API responses for model-agnostic operation
   * 
   * Different AI models (Claude, GPT-4, etc.) return different response structures.
   * For example:
   * - Claude returns choices array with different field names
   * - GPT-4 has its own response format
   * - Future models may have entirely different structures
   * 
   * This function transforms any model-specific response into our internal format,
   * keeping the rest of the system model-agnostic. This allows future support
   * for additional models without changing core application logic.
   * 
   * We extract only the data we need for session storage:
   * - Message content and role
   * - Tool calls if present
   * - Usage statistics
   * - Creation timestamp
   * 
   * Model-specific fields are discarded to maintain consistency.
   * 
   * @param {Object} response - Raw API response from any model
   * @returns {Object} Normalized response in our internal format
   */
  static normalizeAPIResponse(response) {
    // For now, we assume Copilot API format (OpenAI-compatible)
    // This can be extended to handle other model formats in the future

    const normalized = {
      usage: response.usage,
      created: response.created,
      choices: response.choices.map(choice => ({
        message: {
          role: choice.message.role,
          content: choice.message.content,
          tool_calls: choice.message.tool_calls
        },
        finish_reason: choice.finish_reason
      }))
    };

    return normalized;
  }

  /**
   * CRITICAL: Generate human-readable conversation output for STDOUT
   * 
   * This function formats session messages for human consumption, filtering
   * and styling the output for readability rather than showing raw JSON data.
   * 
   * It uses our custom utils.log*() functions to provide:
   * - Color-coded output by message role
   * - Formatted timestamps
   * - Tool call summaries
   * - Clean content presentation
   * 
   * This output formatting will be expanded in the future to support:
   * - Claude think blocks
   * - Per-tool custom logging functions
   * - Rich formatting for different content types
   * 
   * The function only displays information that humans care about,
   * hiding technical metadata that's useful for the system but not for users.
   * 
   * @param {Array} messages - Array of session messages
   */
  static logConversation(messages) {
    for (const message of messages) {
      if (message.role == 'user') {
        utils.logUser(message.content);
      } else if (message.role == 'assistant' && message.content) {
        utils.logAssistant(message.content);
      } else if (message.role == 'assistant' && message.tool_calls?.length > 0) {
        for (const tool_call of message.tool_calls) {
          utils.logToolCall(tool_call);
        }
      }
      // TODO: Add support for Claude think blocks
      // TODO: Add per-tool custom logging functions
    }
  }
}