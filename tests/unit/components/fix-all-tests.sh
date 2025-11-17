#!/bin/bash
# Quick fix script to replace common test patterns

echo "Fixing all component tests..."

# Replace updateComplete with setTimeout
find /workspace/daemon/tests/unit/components -name "*.test.mjs" -exec sed -i \
  's/await element\.updateComplete;/await new Promise(resolve => setTimeout(resolve, 10));/g' {} \;

echo "✓ Fixed async waiting patterns"
echo "Done! Run: bun run test:unit"
