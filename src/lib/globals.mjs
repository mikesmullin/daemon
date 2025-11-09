// global state
export let _G = {
  // when the daemon process started
  // (used to calculate elapsed run time)
  startedAt: Date.now(),

  // first message timestamp in current session (for relative message timing)
  sessionFirstMessageTime: null,

  // mode of daemon operation
  // - pump: run once and exit
  // - watch: run continuously, checking in at intervals
  mode: 'pump',

  // agent tool registry
  tools: {},

  // MCP server instances (lazy-loaded)
  mcpServers: {},

  // Track if MCP tools have been initialized
  mcpInitialized: false,

  // FSM state for ctrl+c handling
  // States: 'normal', 'tool_executing', 'ask_human'
  fsmState: 'normal',

  // Track running child processes for cleanup
  childProcesses: new Set(),

  // Signal handling state
  signalHandler: {
    abortRequested: false,  // Set to true when ctrl+c is pressed during tool execution
    pendingToolCalls: [],   // Tool calls that are currently being executed
    currentSessionId: null, // Session currently being processed
  }
};