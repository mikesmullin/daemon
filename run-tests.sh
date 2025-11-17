#!/bin/bash
# Run all tests individually to work around bun test multi-file issue

set -e

echo "Running test suite..."
echo ""

TESTS=(
  "tests/unit/core/session.test.mjs"
  "tests/unit/core/utils.test.mjs"
  "tests/unit/core/agent.test.mjs"
  "tests/unit/core/tool.test.mjs"
  "tests/unit/observability/channel-manager.test.mjs"
  "tests/unit/observability/fsm-engine.test.mjs"
  "tests/unit/handlers/channel-handlers.test.mjs"
  "tests/unit/handlers/agent-handlers.test.mjs"
  "tests/unit/handlers/message-handlers.test.mjs"
  "tests/unit/handlers/pty-handlers.test.mjs"
  "tests/unit/handlers/session-handlers.test.mjs"
  "tests/unit/handlers/template-handlers.test.mjs"
  "tests/integration/channel-flow.test.mjs"
)

TOTAL_PASS=0
TOTAL_FAIL=0
FAILED_TESTS=()

for test_file in "${TESTS[@]}"; do
  echo "Running: $test_file"
  if bun test "$test_file" 2>&1 | tee /tmp/test-output.txt; then
    # Extract pass/fail counts
    PASS=$(grep -oP '\d+(?= pass)' /tmp/test-output.txt | tail -1 || echo "0")
    FAIL=$(grep -oP '\d+(?= fail)' /tmp/test-output.txt | tail -1 || echo "0")
    TOTAL_PASS=$((TOTAL_PASS + PASS))
    TOTAL_FAIL=$((TOTAL_FAIL + FAIL))
    echo "  ✓ Passed"
  else
    echo "  ✗ Failed"
    FAILED_TESTS+=("$test_file")
  fi
  echo ""
done

echo "========================================"
echo "Test Summary:"
echo "  Total Pass: $TOTAL_PASS"
echo "  Total Fail: $TOTAL_FAIL"
if [ ${#FAILED_TESTS[@]} -gt 0 ]; then
  echo "  Failed Tests:"
  for failed in "${FAILED_TESTS[@]}"; do
    echo "    - $failed"
  done
  exit 1
else
  echo "  All tests passed!"
  exit 0
fi
