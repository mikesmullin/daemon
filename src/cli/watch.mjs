/**
 * Watch CLI Command
 * 
 * Handles the `d watch` subcommand for continuous session monitoring
 */

import { _G } from '../lib/globals.mjs';
import { Agent } from '../lib/agents.mjs';
import { log } from '../lib/utils.mjs';
import color from '../lib/colors.mjs';
import * as metrics from '../lib/metrics.mjs';

export async function handleWatchCommand(args) {
  const subcommand = args[1];

  // Check for help
  if (subcommand === 'help') {
    showHelp();
    process.exit(0);
  }

  // Watch mode (continuous monitoring)

  const sessionInfo = _G.cliFlags.session ? ` session ${_G.cliFlags.session}` : '';
  const labelsInfo = _G.cliFlags.labels && _G.cliFlags.labels.length > 0 ? ` --labels ${_G.cliFlags.labels.join(',')}` : '';
  const notLabelsInfo = _G.cliFlags.notLabels && _G.cliFlags.notLabels.length > 0 ? ` --not-labels ${_G.cliFlags.notLabels.join(',')}` : '';
  log('debug', `👀 ${color.bold('WATCH MODE:')} Will run continuously and pump${sessionInfo}${labelsInfo}${notLabelsInfo} every ${_G.CONFIG.daemon.watch_poll_interval} seconds`);

  // Start periodic metric collection if observability is enabled
  if (_G.observePort) {
    metrics.start();
  }

  const watchIntervalMs = _G.CONFIG.daemon.watch_poll_interval * 1000;
  let lastIterationStart = 0;

  // Define the watch pump function with serial execution
  const performWatchPump = async () => {
    try {
      const iterationStart = Date.now();
      const sessionInfo = _G.cliFlags.session ? ` session ${_G.cliFlags.session}` : '';
      const labelsInfo = _G.cliFlags.labels && _G.cliFlags.labels.length > 0 ? ` --labels ${_G.cliFlags.labels.join(',')}` : '';
      const notLabelsInfo = _G.cliFlags.notLabels && _G.cliFlags.notLabels.length > 0 ? ` --not-labels ${_G.cliFlags.notLabels.join(',')}` : '';
      log('debug', `👀 Checking for pending${sessionInfo}${labelsInfo}${notLabelsInfo}...`);
      const result = await Agent.pump();

      if (result.processed > 0) {
        log('debug', `👀 Pump completed. Processed ${result.processed}/${result.total}${sessionInfo}${labelsInfo}${notLabelsInfo}.`);
      } else {
        // If watching a specific session, check if it's completed
        if (_G.cliFlags.session) {
          const sessions = await Agent.list();
          const targetSession = sessions.find(s => s.session_id === _G.cliFlags.session);
          if (targetSession && ['success', 'fail'].includes(targetSession.state)) {
            log('debug', `✅ Session ${_G.cliFlags.session} completed with state: ${targetSession.state}`);
            log('debug', `👀 Watch will continue monitoring for any state changes...`);
          } else if (!targetSession) {
            log('warn', `⚠️  Session ${_G.cliFlags.session} not found. Continuing to monitor...`);
          }
        }
        log('debug', `👀 No pending${sessionInfo}${labelsInfo}${notLabelsInfo} to process.`);
      }

      // Calculate elapsed time for this iteration
      const iterationEnd = Date.now();
      const iterationDuration = iterationEnd - iterationStart;

      // Calculate how long since the last iteration started
      const timeSinceLastStart = lastIterationStart ? iterationStart - lastIterationStart : 0;
      lastIterationStart = iterationStart;

      // Calculate remaining time until next interval
      // If iteration took longer than interval, run immediately (delay = 0)
      // Otherwise, wait for the remaining time to maintain the interval
      const remainingDelay = Math.max(0, watchIntervalMs - timeSinceLastStart);

      log('debug', `⏱️ Iteration took ${iterationDuration}ms, next run in ${remainingDelay}ms`);

      // Schedule next pump iteration (serial execution ensures no overlapping)
      setTimeout(performWatchPump, remainingDelay);

    } catch (error) {
      log('error', `❌ Pump failed: ${error.message}`);
      // Still schedule next iteration even if this one failed
      setTimeout(performWatchPump, watchIntervalMs);
    }
  };

  // Run initial pump
  await performWatchPump();

  const concurrencyInfo = _G.cliFlags.concurrency 
    ? ` with concurrency limit of ${_G.cliFlags.concurrency}` 
    : ' with parallel execution (no limit)';
  log('info', `👀 Watch mode started${concurrencyInfo}. Press Ctrl+C to stop.`);

  // Keep the process alive - the watch loop will exit via process.exit() when done
  await new Promise(() => { }); // Never resolves
}

function showHelp() {
  console.log(`${color.bold('d watch')} - Run continuously, monitoring sessions

Usage: d watch [options]

Description:
  Continuously monitors and processes pending agent sessions at regular intervals.
  Runs in an infinite loop until interrupted with Ctrl+C. Useful for background
  operation and continuous delegation workflows.

  Sessions are processed in parallel by default. Use -c to limit concurrency.

  The watch interval is configured in config.yaml (daemon.watch_poll_interval).

Options:
  -c, --concurrency <n>   Limit concurrent session processing (default: unlimited)
  --session <id>          Only process the specified session
  --labels <a,b,c>        Only process sessions with ALL specified labels (comma-separated)
  --not-labels <x,y,z>    Exclude sessions with ANY of the specified labels (comma-separated)
  --no-humans             Auto-reject tool requests not on allowlist (unattended mode)

Examples:
  d watch                         # Watch all sessions (parallel, no limit)
  d watch -c 3                    # Watch all sessions (max 3 concurrent)
  d watch --session 5             # Watch only session 5
  d watch --labels subagent       # Watch only subagent sessions
  d watch --labels a,b --no-humans # Watch sessions with labels 'a' AND 'b', unattended
  d watch -c 5 --labels subagent  # Watch subagent sessions (max 5 concurrent)
  d watch --labels subagent --not-labels tty # Watch subagent sessions but exclude those with 'tty' label
`);
}
