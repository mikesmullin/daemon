const fs = await import('fs/promises');
const path = await import('path');
import { _G } from './globals.mjs';
import { log, abort } from './utils.mjs';

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
          sessions.push({ session_id: session_id, bt_state });
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

  // fork a new agent session from a template
  static async fork(agent) {
    try {
      // Generate new session ID
      const session_id = await Agent.nextId();

      await Agent.state(session_id, 'idle');

      // Create session YAML file from agent template
      const sessionFileName = `${session_id}-${agent}.yaml`;
      const sessionPath = path.join(_G.SESSIONS_DIR, sessionFileName);
      const templateFileName = `${agent}.yaml`;
      const templatePath = path.join(_G.TEMPLATES_DIR, templateFileName);

      const templateContent = await fs.readFile(templatePath, 'utf-8');
      await fs.writeFile(sessionPath, templateContent, 'utf-8');
      log('debug', `Created session file ${sessionFileName} from template ${templateFileName}`);

      return session_id;
    } catch (error) {
      abort(`Failed to fork session for agent ${agent}: ${error.message}`);
    }
  }



}