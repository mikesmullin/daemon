const fs = await import('fs/promises');
const path = await import('path');
import yaml from 'js-yaml';
import { _G } from './globals.mjs';
import { assert, log, abort, readYaml, writeYaml } from './utils.mjs';
import { Copilot } from './copilot.mjs';

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
      const procPath = path.join(_G.PROC_DIR, session_id);
      if (!Agent._isValidBtState(bt_state)) {
        abort(`Refuse to write ${procPath}. session: ${session_id}, invalid_state: ${bt_state}`);
        return false;
      }
      try {
        await fs.writeFile(procPath, bt_state, 'utf-8');
        log('debug', `Wrote ${procPath}. session: ${session_id}, state: ${bt_state}`);
        return true;
      } catch (err) {
        abort(`Failed to write ${procPath}. session: ${session_id}, state: ${err.message}`);
      }
    }
    else { // read
      try {
        const sessionPath = path.join(_G.PROC_DIR, session_id);
        const stats = await fs.stat(sessionPath);
        if (!stats.isFile()) {
          abort(`BT state path for session ${session_id} is not a file`);
        }

        const bt_state_raw = await fs.readFile(sessionPath, 'utf-8');
        const bt_state = bt_state_raw.trim();
        if (!Agent._isValidBtState(bt_state)) {
          abort(`Invalid BT state "${bt_state}" for session ${session_id}`);
        }
        return bt_state;
      } catch (error) {
        if (error.code === 'ENOENT') {
          abort(`BT state file for session ${session_id} not found`);
        } else {
          abort(`Failed to read BT state for session ${session_id}: ${error.message}`);
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
            if (sessionData.messages && sessionData.messages.length > 0) {
              const lastMsg = sessionData.messages[sessionData.messages.length - 1];
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
        abort(`Corrupt next file value "${raw}"`);
      }
      const next = String(+raw + 1);
      await fs.writeFile(_G.NEXT_PATH, next, 'utf-8');
      return raw;
    } catch (err) {
      if (err.code === 'ENOENT') {
        await fs.writeFile(_G.NEXT_PATH, '1', 'utf-8');
        return '0';
      }
      abort(`Failed allocating next session id: ${err.message}`);
    }
  }

  // mark an agent session with a new BT state
  static async kill(session_id, bt_state = 'fail') {
    await Agent.state(session_id, bt_state);
  }

  // append a new user message to an agent session
  static async push(session_id, content) {
    try {
      const sessionFileName = `${session_id}.yaml`;
      const sessionPath = path.join(_G.SESSIONS_DIR, sessionFileName);
      const sessionContent = await readYaml(sessionPath);

      // Initialize messages array if it doesn't exist
      if (!sessionContent.messages) {
        sessionContent.messages = [];
      }

      // Add new user message with timestamp
      const newMessage = {
        ts: new Date().toISOString(),
        role: 'user',
        content: content
      };

      sessionContent.messages.push(newMessage);
      const messageId = sessionContent.messages.length - 1;

      // Write back to file
      await writeYaml(sessionPath, sessionContent);

      // Return detailed information about the appended message
      return {
        session_id: session_id,
        message_id: messageId,
        ts: newMessage.ts,
        role: newMessage.role,
        message: newMessage.content
      };
    } catch (error) {
      abort(`Failed to push message to session ${session_id}: ${error.message}`);
    }
  }

  // fork a new agent session from a template or an existing session
  static async fork({ agent, session_id, prompt = null }) {
    try {
      // Generate new session ID
      const new_session_id = await Agent.nextId();

      await Agent.state(new_session_id, 'idle');

      let sessionContent = {};
      if (session_id) {
        const existingSessionFileName = `${session_id}.yaml`;
        const existingSessionPath = path.join(_G.SESSIONS_DIR, existingSessionFileName);
        sessionContent = await readYaml(existingSessionPath);
        assert(sessionContent.apiVersion == 'daemon/v1');
        assert(sessionContent.kind == 'Agent');

        if (null == agent) {
          agent = sessionContent.name;
        }
      }
      else {
        const templateFileName = `${agent}.yaml`;
        const templatePath = path.join(_G.TEMPLATES_DIR, templateFileName);
        sessionContent = await readYaml(templatePath);
      }
      const newgSessionFileName = `${new_session_id}.yaml`;
      const newgSessionPath = path.join(_G.SESSIONS_DIR, newgSessionFileName);
      await writeYaml(newgSessionPath, sessionContent);

      if (prompt) {
        await Agent.push(new_session_id, prompt);
      }

      return {
        session_id: new_session_id,
        agent,
        prompt,
      };
    } catch (error) {
      abort(`Failed to fork session for agent ${agent}: ${error.message}`);
    }
  }

  // evaluate an agent session by sending its context to the LLM as a prompt
  static async eval(session_id) {
    const sessionFileName = `${session_id}.yaml`;
    const sessionPath = path.join(_G.SESSIONS_DIR, sessionFileName);
    const sessionContent = await readYaml(sessionPath);

    const messages = [
      {
        role: 'system',
        content: 'You are a pirate. Always respond in pirate speak with "Arrr!" and nautical terms.'
      },
      {
        role: 'user',
        content: 'My favorite color is blue.'
      },
      {
        role: 'assistant',
        content: 'Arrr! Blue, ye say? That be the hue o’ the deep sea and the sky over the horizon! A fine choice for a pirate’s heart. Be ye wantin’ to deck out yer ship’s sails in that azure glory or somethin’ else? Speak, me matey! Arrr!'
      },
      {
        role: 'user',
        content: 'My favorite number is 42.'
      },
      {
        role: 'assistant',
        content: 'Arrr! Forty-two, eh? That be a number with a mystical ring, like a cannon blast echoin’ across the seven seas! Be it yer lucky number for plunderin’ or just a whim, it’s a fine pick. What else be stirrin’ in yer pirate soul, matey? Arrr!'
      },
      {
        role: 'user',
        content: 'What were my favorite color and number? Answer in one sentence.'
      },
    ];
    try {
      await Copilot.init();
      const response = await Copilot.client.chat.completions.create({
        model: 'claude-sonnet-4',
        messages: messages,
        max_tokens: 300,
      });
      return response;
    } catch (error) {
      console.error('❌ Error:', error.message);
    }
  }

  // perform a single step of the agent orchestrator loop
  static async step() {
    // find all sessions
    const sessions = await Agent.list();

    const a1 = await Agent.fork('planner');
    console.debug(`Forked new agent session: ${a1}`);
    const as1 = await Agent.state(a1);
    console.debug(`Session ${a1} state: ${as1}`);

    const a2 = await Agent.fork('executor');
    console.debug(`Forked new agent session: ${a2}`);
    const as2 = await Agent.state(a2);
    console.debug(`Session ${a2} state: ${as2}`);

    // const response = await Agent.eval(a1);
    // console.debug(`Session ${a1} evaluation response:`, response);    
  }
}