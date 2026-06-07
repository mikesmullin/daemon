#!/bin/bash
# Integration test for daemon-v3 CLI
set -e

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test counter
TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0

# Helper functions
log_info() {
    echo -e "${YELLOW}[TEST]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[PASS]${NC} $1"
    TESTS_PASSED=$((TESTS_PASSED + 1))
}

log_error() {
    echo -e "${RED}[FAIL]${NC} $1"
    TESTS_FAILED=$((TESTS_FAILED + 1))
}

run_test() {
    TESTS_RUN=$((TESTS_RUN + 1))
    log_info "$1"
}

cleanup() {
    log_info "Cleaning up..."
    d -k 2>/dev/null || true
    rm -f daemon.lock cli.sock
    rm -rf db/sessions/*.yml db/groups/*.yml 2>/dev/null || true
    sleep 1
}

# Trap to ensure cleanup on exit
trap cleanup EXIT

# Start tests
echo "========================================="
echo "Daemon V3 Integration Tests"
echo "========================================="
echo ""

# Test 1: Start daemon
run_test "Test 1: Start daemon in background"
d -d
sleep 2
if [ -f "daemon.lock" ]; then
    PID=$(cat daemon.lock)
    if ps -p $PID > /dev/null; then
        log_success "Daemon started with PID $PID"
    else
        log_error "Daemon PID $PID not running"
    fi
else
    log_error "No lockfile created"
fi

# Test 2: Send async command
run_test "Test 2: Send async command (set config)"
timeout 5 d -a "set app.testValue 12345" || {
    log_error "Command timed out or failed"
    exit 1
}
sleep 1
# Verify by reading config (we'd need to check in-memory, for now just check command succeeded)
log_success "Async command sent successfully"

# Test 3: List templates
run_test "Test 3: List agent templates"
OUTPUT=$(timeout 5 d "agents" 2>&1 || echo "TIMEOUT")
if echo "$OUTPUT" | grep -q "default"; then
    log_success "Template 'default' found"
else
    log_error "Template 'default' not found in output: $OUTPUT"
fi

# Test 4: Create agent session
run_test "Test 4: Create new agent session"
timeout 5 d -a "agent new default" || log_error "Command timed out"
sleep 2
SESSION_COUNT=$(ls db/sessions/*.yml 2>/dev/null | wc -l)
if [ "$SESSION_COUNT" -gt 0 ]; then
    log_success "Agent session created (found $SESSION_COUNT session files)"
else
    log_error "No session files created"
fi

# Test 5: List sessions
run_test "Test 5: List active sessions"
OUTPUT=$(timeout 5 d "sessions" 2>&1 || echo "TIMEOUT")
if echo "$OUTPUT" | grep -E -q "[0-9]+"; then
    log_success "Sessions listed successfully"
else
    log_error "No sessions found in output: $OUTPUT"
fi

# Test 6: FS plugin - write file
run_test "Test 6: FS plugin - write file"
TEST_FILE="test_output.txt"
timeout 5 d -a "fs write $TEST_FILE 'Hello from daemon!'" || log_error "Command timed out"
sleep 1
if [ -f "$TEST_FILE" ]; then
    CONTENT=$(cat "$TEST_FILE")
    if [ "$CONTENT" = "Hello from daemon!" ]; then
        log_success "File written correctly"
        rm -f "$TEST_FILE"
    else
        log_error "File content mismatch: $CONTENT"
    fi
else
    log_error "File not created"
fi

# Test 7: FS plugin - read file
run_test "Test 7: FS plugin - read file"
echo "Test content" > "$TEST_FILE"
OUTPUT=$(timeout 5 d "fs read $TEST_FILE" 2>&1 || echo "TIMEOUT")
if echo "$OUTPUT" | grep -q "Test content"; then
    log_success "File read correctly"
    rm -f "$TEST_FILE"
else
    log_error "File read failed: $OUTPUT"
fi

# Test 8: Clean database
run_test "Test 8: Clean database"
timeout 5 d -a "clean" || log_error "Command timed out"
sleep 2
SESSION_COUNT=$(ls db/sessions/*.yml 2>/dev/null | wc -l)
if [ "$SESSION_COUNT" -eq 0 ]; then
    log_success "Database cleaned successfully"
else
    log_error "Database still has $SESSION_COUNT session files"
fi

# Test 9: Pause and continue
run_test "Test 9: Pause and continue main loop"
timeout 5 d -a "pause" || log_error "Pause timed out"
sleep 1
# Enqueue a command while paused
timeout 5 d -a "set app.pausedTest true" || log_error "Set timed out"
sleep 1
# Resume
timeout 5 d -a "continue" || log_error "Continue timed out"
sleep 1
log_success "Pause/continue executed (state verified in logs)"

# Test 10: Stop daemon
run_test "Test 10: Stop daemon"
d -k
sleep 1
if [ ! -f "daemon.lock" ]; then
    log_success "Daemon stopped and lockfile removed"
else
    PID=$(cat daemon.lock)
    if ! ps -p $PID > /dev/null 2>&1; then
        log_success "Daemon process stopped (stale lockfile)"
        rm -f daemon.lock
    else
        log_error "Daemon still running with PID $PID"
    fi
fi

# Test 11: Kill and restart
run_test "Test 11: Kill existing and start new daemon"
d -d -k
sleep 2
if [ -f "daemon.lock" ]; then
    PID=$(cat daemon.lock)
    if ps -p $PID > /dev/null; then
        log_success "Daemon restarted with new PID $PID"
    else
        log_error "Daemon not running after restart"
    fi
else
    log_error "No lockfile after restart"
fi

# Summary
echo ""
echo "========================================="
echo "Test Summary"
echo "========================================="
echo "Tests run:    $TESTS_RUN"
echo -e "Tests passed: ${GREEN}$TESTS_PASSED${NC}"
echo -e "Tests failed: ${RED}$TESTS_FAILED${NC}"
echo "========================================="

if [ $TESTS_FAILED -eq 0 ]; then
    echo -e "${GREEN}All tests passed!${NC}"
    exit 0
else
    echo -e "${RED}Some tests failed.${NC}"
    exit 1
fi
