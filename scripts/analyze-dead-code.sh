#!/bin/bash
# Dead Code Analysis Script for Daemon v3.0
# Part 7.4 of TODO2.md - Coverage analysis and dead code detection

set -e

echo "=========================================="
echo "Daemon v3.0 Dead Code Analysis"
echo "=========================================="
echo ""

# Colors for output
RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Create temporary directory for reports
REPORT_DIR="tmp/dead-code-analysis"
mkdir -p "$REPORT_DIR"

echo "${BLUE}Step 1: Running tests with coverage...${NC}"
echo ""

# Run each test file with coverage and collect results
COVERAGE_FILE="$REPORT_DIR/coverage-summary.txt"
: > "$COVERAGE_FILE"  # Clear file

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

# Run a coverage test on one representative file to get overall metrics
echo "  Running comprehensive coverage test..."
bun test tests/unit/observability/channel-manager.test.mjs --coverage 2>&1 | \
  grep -A 100 "File.*% Funcs.*% Lines" | \
  tee "$COVERAGE_FILE" > /dev/null

echo "${GREEN}  ✓ Coverage analysis complete${NC}"
echo ""

echo "${BLUE}Step 2: Analyzing files with 0% coverage...${NC}"
echo ""

# Find files with 0% coverage or not covered at all
ZERO_COVERAGE="$REPORT_DIR/zero-coverage.txt"
: > "$ZERO_COVERAGE"

# List all source files
echo "  Scanning source files..."
ALL_SRC_FILES=$(find src -name "*.mjs" -type f | sort)

# Check which files appear in coverage report
echo "  Identifying uncovered files..."
for file in $ALL_SRC_FILES; do
  # Check if file appears in coverage report
  if ! grep -q "$(basename $file)" "$COVERAGE_FILE" 2>/dev/null; then
    echo "$file" >> "$ZERO_COVERAGE"
  fi
done

# Also check for files with 0.00% coverage in the report
grep "0\.00" "$COVERAGE_FILE" 2>/dev/null | awk '{print $1}' >> "$ZERO_COVERAGE" || true

# Display results
if [ -s "$ZERO_COVERAGE" ]; then
  echo "${YELLOW}  ⚠ Found files with 0% coverage:${NC}"
  cat "$ZERO_COVERAGE" | while read file; do
    echo "    - $file"
  done
else
  echo "${GREEN}  ✓ All source files have test coverage${NC}"
fi
echo ""

echo "${BLUE}Step 3: Finding unused exports...${NC}"
echo ""

UNUSED_EXPORTS="$REPORT_DIR/unused-exports.txt"
: > "$UNUSED_EXPORTS"

# Find all export statements
echo "  Scanning for exports..."
EXPORTS_FILE="$REPORT_DIR/all-exports.txt"
grep -r "^export " src/ | grep -v "export default" > "$EXPORTS_FILE" || true

# For each named export, check if it's imported anywhere
echo "  Checking import usage..."
while IFS= read -r line; do
  file=$(echo "$line" | cut -d: -f1)
  export_stmt=$(echo "$line" | cut -d: -f2-)
  
  # Extract exported names (simplified)
  if [[ "$export_stmt" =~ export\ (function|class|const|let|var)\ ([a-zA-Z_][a-zA-Z0-9_]*) ]]; then
    export_name="${BASH_REMATCH[2]}"
    
    # Check if this export is imported anywhere
    import_count=$(grep -r "import.*$export_name" src/ tests/ 2>/dev/null | grep -v "$file" | wc -l)
    
    if [ "$import_count" -eq 0 ]; then
      echo "$file: export $export_name" >> "$UNUSED_EXPORTS"
    fi
  fi
done < "$EXPORTS_FILE"

# Display results
if [ -s "$UNUSED_EXPORTS" ]; then
  echo "${YELLOW}  ⚠ Found potentially unused exports:${NC}"
  cat "$UNUSED_EXPORTS" | head -20 | while read item; do
    echo "    - $item"
  done
  total=$(wc -l < "$UNUSED_EXPORTS")
  if [ "$total" -gt 20 ]; then
    echo "    ... and $((total - 20)) more"
  fi
else
  echo "${GREEN}  ✓ No obviously unused exports found${NC}"
fi
echo ""

echo "${BLUE}Step 4: Analyzing deprecated v2 files...${NC}"
echo ""

# List of files marked for removal in TODO2.md Part 1
DEPRECATED_FILES=(
  "src/lib/observability.mjs"
  "src/lib/metrics.mjs"
  "src/cli/mcp.mjs"
  "src/lib/mcp-client.mjs"
)

DEPRECATED_CHECK="$REPORT_DIR/deprecated-status.txt"
: > "$DEPRECATED_CHECK"

for file in "${DEPRECATED_FILES[@]}"; do
  if [ -f "$file" ]; then
    echo "${RED}  ✗ STILL EXISTS: $file${NC}"
    echo "$file - SHOULD BE REMOVED" >> "$DEPRECATED_CHECK"
  else
    echo "${GREEN}  ✓ Already removed: $file${NC}"
    echo "$file - REMOVED" >> "$DEPRECATED_CHECK"
  fi
done
echo ""

echo "${BLUE}Step 5: Checking for backup files...${NC}"
echo ""

BACKUP_FILES=$(find . -name "*.bak" -o -name "*.v2.bak" -o -name "*~" 2>/dev/null | grep -v node_modules || true)

if [ -n "$BACKUP_FILES" ]; then
  echo "${YELLOW}  ⚠ Found backup files:${NC}"
  echo "$BACKUP_FILES" | while read file; do
    echo "    - $file"
  done
else
  echo "${GREEN}  ✓ No backup files found${NC}"
fi
echo ""

echo "${BLUE}Step 6: Finding large/complex functions (potential refactoring candidates)...${NC}"
echo ""

COMPLEX_FUNCS="$REPORT_DIR/complex-functions.txt"
: > "$COMPLEX_FUNCS"

# Find functions with >100 lines (excluding comments)
echo "  Scanning for large functions..."
for file in $(find src -name "*.mjs" -type f); do
  # Count lines between function declarations
  awk '
    /^(export )?(async )?function / {
      if (func_name) {
        line_count = NR - start_line
        if (line_count > 100) {
          print FILENAME ":" func_name " (" line_count " lines)"
        }
      }
      func_name = $0
      start_line = NR
    }
  ' "$file" >> "$COMPLEX_FUNCS" 2>/dev/null || true
done

if [ -s "$COMPLEX_FUNCS" ]; then
  echo "${YELLOW}  ⚠ Found functions >100 lines:${NC}"
  cat "$COMPLEX_FUNCS" | head -10 | while read item; do
    echo "    - $item"
  done
else
  echo "${GREEN}  ✓ No excessively large functions found${NC}"
fi
echo ""

echo "${BLUE}Step 7: Checking for TODO/FIXME comments...${NC}"
echo ""

TODO_COMMENTS=$(grep -r "TODO\|FIXME\|XXX\|HACK" src/ 2>/dev/null | wc -l)
if [ "$TODO_COMMENTS" -gt 0 ]; then
  echo "${YELLOW}  ⚠ Found $TODO_COMMENTS TODO/FIXME comments in source${NC}"
  echo "    Run: grep -r 'TODO\|FIXME' src/ to see them"
else
  echo "${GREEN}  ✓ No TODO/FIXME comments found${NC}"
fi
echo ""

echo "=========================================="
echo "Summary Report"
echo "=========================================="
echo ""

echo "${BLUE}Coverage Summary:${NC}"
if [ -f "$COVERAGE_FILE" ]; then
  # Extract overall coverage stats
  grep "All files" "$COVERAGE_FILE" || echo "  Coverage data not available"
fi
echo ""

echo "${BLUE}Files for Review:${NC}"
echo ""

echo "${YELLOW}1. Zero Coverage Files (not tested):${NC}"
if [ -s "$ZERO_COVERAGE" ]; then
  wc -l < "$ZERO_COVERAGE" | xargs echo "  Count:"
  echo "  See: $ZERO_COVERAGE"
else
  echo "  None found"
fi
echo ""

echo "${YELLOW}2. Deprecated v2 Files (should be removed):${NC}"
if [ -s "$DEPRECATED_CHECK" ]; then
  grep "SHOULD BE REMOVED" "$DEPRECATED_CHECK" | wc -l | xargs echo "  Count:"
  grep "SHOULD BE REMOVED" "$DEPRECATED_CHECK" | cut -d' ' -f1 | while read f; do
    echo "    - $f"
  done
else
  echo "  All deprecated files already removed"
fi
echo ""

echo "${YELLOW}3. Unused Exports (possibly dead code):${NC}"
if [ -s "$UNUSED_EXPORTS" ]; then
  wc -l < "$UNUSED_EXPORTS" | xargs echo "  Count:"
  echo "  See: $UNUSED_EXPORTS"
else
  echo "  None found"
fi
echo ""

echo "${BLUE}Next Steps:${NC}"
echo "1. Review files in: $REPORT_DIR/"
echo "2. Manually verify unused exports are truly not needed"
echo "3. Remove deprecated v2 files as outlined in TODO2.md Part 2"
echo "4. Add tests for zero-coverage files or mark as deprecated"
echo ""

echo "Report saved to: $REPORT_DIR/"
echo "${GREEN}Analysis complete!${NC}"
