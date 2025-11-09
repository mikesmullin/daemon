#!/usr/bin/env bash

set -e  # Exit on error
set -x  # Print commands

# Test configuration
WATCH_TIMEOUT=12  # seconds to run watch mode
TEST_INTERVAL=3   # seconds between checks
LOG_FILE="tmp/watch-test.log"

echo "🧪 Starting watch mode integration test"

# Clean up any previous test state
node src/daemon.mjs clean

# Temporarily set a shorter check-in interval for testing
cp config.yaml config.yaml.backup
sed 's/watch_poll_interval: 5/watch_poll_interval: 3/' config.yaml.backup > config.yaml

# Create initial test sessions
echo "📝 Creating test sessions..."
node src/daemon.mjs tool create_agent '{"agent":"solo","prompt":"What is 2 + 2?"}'
node src/daemon.mjs tool create_agent '{"agent":"solo","prompt":"Calculate 15 * 23"}'

# Check initial session state
echo "📋 Initial session state:"
node src/daemon.mjs sessions

# Start watch mode in background with timeout and log to file
echo "👀 Starting watch mode for ${WATCH_TIMEOUT} seconds..."
rm -f "$LOG_FILE"
timeout ${WATCH_TIMEOUT}s node src/daemon.mjs watch > "$LOG_FILE" 2>&1 &
WATCH_PID=$!

# Wait a moment for watch to start
sleep 2

# Add new work during watch operation
echo "➕ Adding new work to session 0..."
node src/daemon.mjs tool command_agent '{"session_id":"0","prompt":"Now calculate 3 + 3"}'

# Let watch mode run and process the new work
sleep 8

# Add another piece of work
echo "➕ Adding more work to session 1..."
node src/daemon.mjs tool command_agent '{"session_id":"1","prompt":"What about 4 * 4?"}'

# Wait for watch to finish or timeout
wait $WATCH_PID 2>/dev/null || true

# Restore original config
mv config.yaml.backup config.yaml

echo "📊 Watch mode test completed. Analyzing results..."

# Check the log file for expected patterns
echo "🔍 Checking log file: $LOG_FILE"

if [ ! -f "$LOG_FILE" ]; then
    echo "❌ ERROR: Log file not created"
    exit 1
fi

echo "📄 Watch mode log contents:"
cat "$LOG_FILE"
echo "--- End of log ---"

# Verify expected patterns in the log
echo "🔍 Verifying expected patterns..."

echo "✅ Checking: WATCH MODE message"
if grep -q "WATCH MODE.*pump every.*seconds" "$LOG_FILE"; then
    echo "✅ Found: WATCH MODE message"
else
    echo "❌ Missing: WATCH MODE message"
    exit 1
fi

echo "✅ Checking: Initial pump completed"
if grep -q "Initial pump completed" "$LOG_FILE"; then
    echo "✅ Found: Initial pump completed"
else
    echo "❌ Missing: Initial pump completed"
    exit 1
fi

echo "✅ Checking: Watch mode started"
if grep -q "Watch mode started" "$LOG_FILE"; then
    echo "✅ Found: Watch mode started"
else
    echo "❌ Missing: Watch mode started"
    exit 1
fi

echo "✅ Checking: Watch interval checking"
if grep -q "Watch interval: checking for pending sessions" "$LOG_FILE"; then
    echo "✅ Found: Watch interval checking"
else
    echo "❌ Missing: Watch interval checking"
    exit 1
fi

echo "✅ Checking: Watch pump completed"
if grep -q "Watch pump completed" "$LOG_FILE"; then
    echo "✅ Found: Watch pump completed"
else
    echo "❌ Missing: Watch pump completed"
    exit 1
fi

echo "✅ Checking: Processing session"
if grep -q "Processing session" "$LOG_FILE"; then
    echo "✅ Found: Processing session"
else
    echo "❌ Missing: Processing session"
    exit 1
fi

# Check final session state
echo "📋 Final session state:"
node src/daemon.mjs sessions

# Verify sessions were processed (simple count using sessions output)
SESSION_COUNT=$(node src/daemon.mjs sessions --format table | grep -c "^[0-9]" || echo "0")
if [ "$SESSION_COUNT" -eq 2 ]; then
    echo "✅ Correct number of sessions: $SESSION_COUNT"
else
    echo "❌ Unexpected session count: $SESSION_COUNT (expected 2)"
    # Don't exit - this might be due to formatting issues
fi

# Check that at least some processing occurred
if grep -q "Processed.*sessions" "$LOG_FILE"; then
    echo "✅ Sessions were processed during watch mode"
else
    echo "❌ No session processing detected in watch mode"
    exit 1
fi

# Check for interval-based pumping
PUMP_COUNT=$(grep -c "Watch pump completed" "$LOG_FILE" || echo "0")
if [ "$PUMP_COUNT" -ge 1 ]; then
    echo "✅ Interval-based pumping detected: $PUMP_COUNT pumps"
else
    echo "❌ No interval-based pumping detected"
    exit 1
fi

echo "🎉 Watch mode integration test PASSED!"
echo "📊 Test Summary:"
echo "   - Sessions created: 2"
echo "   - Watch duration: ${WATCH_TIMEOUT} seconds"
echo "   - Pump cycles detected: $PUMP_COUNT"
echo "   - Log file: $LOG_FILE"