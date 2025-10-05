const fs = await import('fs/promises');
const path = await import('path');
import { _G } from './globals.mjs';
import { log } from './utils.mjs';
import { GenIdx } from './genidx.mjs';

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

  // return the current BT state for a given session id (gid)
  // returns null if the state file does not exist, is invalid, or any error occurs
  static async state(gid) {
    try {
      const sessionPath = path.join(_G.PROC_DIR, gid);
      const stats = await fs.stat(sessionPath);
      if (!stats.isFile()) {
        log('error', `BT state path for session ${gid} is not a file - aborting`);
        process.abort();
      }

      const bt_state_raw = await fs.readFile(sessionPath, 'utf-8');
      const bt_state = bt_state_raw.trim();
      if (!Agent._isValidBtState(bt_state)) {
        log('error', `Invalid BT state "${bt_state}" for session ${gid} - aborting`);
        process.abort();
      }
      return bt_state;
    } catch (error) {
      if (error.code === 'ENOENT') {
        log('error', `BT state file for session ${gid} not found - aborting`);
      } else {
        log('error', `Failed to read BT state for session ${gid}: ${error.message} - aborting`);
      }
      process.abort();
    }
  }

  // list agent sessions and their BT state
  static async list() {
    try {
      log('debug', `Listing sessions in ${_G.PROC_DIR}`);

      const files = await fs.readdir(_G.PROC_DIR);
      const sessions = [];

      for (const file of files) {
        const bt_state = await Agent.state(file);
        if (bt_state) {
          sessions.push({ session_id: file, bt_state });
        }
      }

      return sessions;
    } catch (error) {
      log('error', `Failed to list sessions: ${error.message}`);
      return [];
    }
  }

  // Shared generational index allocator
  static _genidx = new GenIdx();

  // generate the next agent session ID as a 32-bit unsigned integer string
  static nextId() {
    return this._genidx.next();
  }

  // mark an agent session as killed
  static async kill(gid, bt_state) {
    // Reclaim using generational index allocator
    const success = this._genidx.kill(gid);
    if (!success) {
      log('warn', `GID ${gid} invalid or generation mismatch`);
      return false;
    }

    // Update BT state file with the provided state
    const procPath = path.join(_G.PROC_DIR, gid);
    await fs.writeFile(procPath, bt_state, 'utf-8');
    log('debug', `Marked session ${gid} with BT state: ${bt_state}`);

    return true;
  }

  // fork a new agent session from a template
  static async fork(agent) {
    try {
      // Generate new session ID using Generational Index Array
      const gid = Agent.nextId();

      // Create BT state file in PROC_DIR
      const procPath = path.join(_G.PROC_DIR, gid);
      await fs.writeFile(procPath, 'idle', 'utf-8');
      log('debug', `Created BT state file for session ${gid}`);

      // Create session YAML file from agent template
      const sessionFileName = `${gid}-${agent}.session.yaml`;
      const sessionPath = path.join(_G.SESSIONS_DIR, sessionFileName);
      const templatePath = path.join(_G.TEMPLATES_DIR, `${agent}.agent.yaml`);

      const templateContent = await fs.readFile(templatePath, 'utf-8');
      await fs.writeFile(sessionPath, templateContent, 'utf-8');
      log('debug', `Created session file ${sessionFileName} from template ${agent}.agent.yaml`);

      return gid;
    } catch (error) {
      log('error', `Failed to fork session for agent ${agent}: ${error.message}`);
      throw error;
    }
  }
}