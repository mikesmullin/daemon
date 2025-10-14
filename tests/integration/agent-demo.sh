#!/usr/bin/env bash

set -e  # Exit on error
set -x  # Print commands

echo "🧪 Testing d agent command"

# Clean up any previous test state
node src/daemon.mjs clean

# Test the new agent command with whoami
echo "📝 Testing: d agent @solo run command: whoami"
echo "Expected: Should output 'user' (the result of whoami command)"
echo "Note: This test requires manual approval of the shell command"

# Run the agent command
node src/daemon.mjs agent "@solo run command: whoami"

echo "✅ Agent command test completed"

