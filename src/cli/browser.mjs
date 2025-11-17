import open from 'open';
import { log } from '../lib/utils.mjs';
import color from '../lib/colors.mjs';

export async function handleBrowserCommand(args) {
  // Parse port from args
  let port = 3002; // default port
  
  // Check if first arg (after 'browser') is a number
  if (args.length > 1 && !isNaN(parseInt(args[1]))) {
    port = parseInt(args[1]);
  }
  
  // Check for help flag
  if (args.includes('help') || args.includes('--help') || args.includes('-h')) {
    showHelp();
    process.exit(0);
  }

  log('info', `🌐 Starting browser mode on port ${port}...`);

  // Import and start observability server
  const { default: ObservabilityServer } = await import('../observability/daemon-browser.mjs');
  const server = new ObservabilityServer(port);
  server.start();

  // Auto-open browser
  try {
    await open(`http://localhost:${port}`);
    log('info', `🚀 Browser opened at http://localhost:${port}`);
  } catch (err) {
    log('warn', `⚠️  Could not auto-open browser: ${err.message}`);
    log('info', `📋 Manual: Open http://localhost:${port} in your browser`);
  }

  // Show help
  console.log(`
${color.bold('Daemon v3.0 - Browser Mode')}

Server running at: ${color.cyan(`http://localhost:${port}`)}

Commands:
  Ctrl+C          Stop server and exit

Features:
  - Multi-channel management
  - Real-time agent orchestration
  - PTY integration
  - Lucene filtering
  - @mention autocomplete
  `);

  // Block until interrupted (server handles its own lifecycle)
  await new Promise(() => {}); // Infinite wait
}

function showHelp() {
  console.log(`${color.bold('d browser')} - Start browser-based orchestration interface

Usage: d browser [port] [options]

Arguments:
  port                Port number (default: 3002)

Options:
  help, --help, -h    Show this help message

Description:
  Starts the v3.0 browser-first daemon interface with:
  - WebSocket-based real-time updates
  - Channel management
  - Multi-agent orchestration
  - PTY terminal integration
  - Lucene-based event filtering

Examples:
  d browser           # Start on default port 3002
  d browser 8080      # Start on custom port
  d browser help      # Show this help message
  `);
}
