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
};