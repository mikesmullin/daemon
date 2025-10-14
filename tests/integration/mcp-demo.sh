#!/usr/bin/env bash

set -e  # Exit on error
set -x  # Print commands

echo "🧪 Testing MCP integration"

# Clean state
node src/daemon.mjs clean

echo "📝 Test 1: List MCP servers (should be empty initially)"
node src/daemon.mjs mcp list

echo "📝 Test 2: Add a new MCP server"
node src/daemon.mjs mcp add test-server -- echo "test"

echo "📝 Test 3: List MCP servers (should show test-server)"
node src/daemon.mjs mcp list

echo "📝 Test 4: Verify config.yaml was updated"
grep -A 5 "test-server:" config.yaml

echo "✅ MCP CLI tests completed"
echo ""
echo "Note: To test with a real MCP server like Chrome DevTools:"
echo "  1. Start Chrome with remote debugging: chrome --remote-debugging-port=9222"
echo "  2. Add the server: d mcp add chrome-devtools -- npx -y chrome-devtools-mcp@latest -u http://localhost:9222"
echo "  3. Discover tools: d mcp discover chrome-devtools"
echo "  4. Use in agent: d agent @browser navigate to https://example.com"
