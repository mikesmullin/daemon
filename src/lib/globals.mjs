// global state
export let _G = {
  // when the daemon process started
  // (used to calculate elapsed run time)
  startedAt: Date.now(),

  // mode of daemon operation
  // - pump: run once and exit
  // - watch: run continuously, checking in at intervals
  mode: 'pump',

  // agent tool registry
  tools: {},
};