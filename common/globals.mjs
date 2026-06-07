import fs from 'fs';
import { EventEmitter } from 'events';

class Globals {
  constructor() {
    this.config = {};
    this.commandQueue = [];
    this.metrics = { counters: {}, timers: {} };
    this.isPaused = false;
    this.isRepl = false;
    this.concurrency = 5;
    this.dbPaths = {
      sessions: "./db/workspaces/**/db/sessions/",
      templates: "./agent/templates",
      groups: "./db/groups"
    };
    this.eventBus = new EventEmitter();
    this.pluginsRegistry = new Map();
    this.dslRegistry = new Map();
    this.dbCollections = new Set();
    // Track active tool calls by session ID for cancellation: Map<sessionId, AbortController>
    this.activeToolCalls = new Map();
    // Plugin interface registries
    this.widgetRegistry = new Map();     // Map<pluginName.widgetName, { plugin, render: () => string }>
    this.subcommandRegistry = new Map(); // Map<subcommandPath, { plugin, handler }>
    this.humanOnlyTools = new Set();     // Set of tool names that are human-only
    this.humanQuestions = new Map();     // Map<id, { question, status, answer, sessionId }>
    this.humanQuestionsCounter = 0;
    this.humanApprovals = new Map();     // Map<id, { resolve, sessionId }>
    this.humanApprovalsCounter = 0;
    // Track current request context for output filtering
    this.currentRequestContext = { procId: null }; // { procId: number|null }
    // Tool call state tracking for stateful execution (FSM pattern)
    this.toolCallStates = new Map();     // Map<toolCallId, { status, state, context, externalData }>
    // Container runtime config (defaults, overridden by loadConfig)
    this.containerRuntime = 'podman';
    this.containerImage = 'daemon-v3-image';
    this.pasteDetectionThreshold = 150; // ms, configurable via config.yml pasteDetectionThreshold
  }

  loadConfig(path = './config.yml') {
    try {
      if (fs.existsSync(path)) {
        const file = fs.readFileSync(path, 'utf8');
        this.config = Bun.YAML.parse(file);
        
        // Load top-level config values
        if (this.config.concurrency) {
            this.concurrency = this.config.concurrency;
        }
        if (this.config.pasteDetectionThreshold) {
            this.pasteDetectionThreshold = this.config.pasteDetectionThreshold;
        }
        
        if (this.config.container) {
            if (this.config.container.runtime) {
                this.containerRuntime = this.config.container.runtime;
            }
            if (this.config.container.image) {
                this.containerImage = this.config.container.image;
            }
        }
      } else {
          console.warn(`Config file not found at ${path}`);
      }
    } catch (e) {
      console.error('Failed to load config:', e);
    }
  }

  setConfig(key, value) {
    // Simple dot-notation setter
    const keys = key.split('.');
    let current = this.config;
    for (let i = 0; i < keys.length - 1; i++) {
      if (!current[keys[i]]) current[keys[i]] = {};
      current = current[keys[i]];
    }
    current[keys[keys.length - 1]] = value;
    
    // Update runtime values if needed
    if (key === 'concurrency') {
        this.concurrency = value;
    }
  }

  getConfig(key) {
      const keys = key.split('.');
      let current = this.config;
      for (const k of keys) {
          if (current === undefined || current === null) return undefined;
          current = current[k];
      }
      return current;
  }

  getFlattenedConfig() {
      const result = {};
      const recurse = (obj, prefix = '') => {
          for (const key in obj) {
              const val = obj[key];
              const newKey = prefix ? `${prefix}.${key}` : key;
              if (val && typeof val === 'object' && !Array.isArray(val)) {
                  recurse(val, newKey);
              } else {
                  result[newKey] = val;
              }
          }
      };
      recurse(this.config);
      return result;
  }

  enqueueCommand(cmd, metadata = {}) {
    this.commandQueue.push({ cmd, ...metadata });
    this.eventBus.emit('commandEnqueued', { cmd, ...metadata });
  }

  pause() {
    this.isPaused = true;
    this.eventBus.emit('paused');
  }

  resume() {
    this.isPaused = false;
    this.eventBus.emit('resumed');
  }
}

export const globals = new Globals();
globals.loadConfig();
