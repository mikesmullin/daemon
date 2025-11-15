#!/bin/bash
# Install dependencies for all plugins

# Get script directory and project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
PLUGINS_DIR="$PROJECT_ROOT/plugins"

echo "🔌 Installing plugin dependencies..."
echo ""

# Track installation results
installed_count=0
skipped_count=0
failed_count=0

# Find all plugins with package.json
for plugin_dir in "$PLUGINS_DIR"/*; do
  if [ -d "$plugin_dir" ]; then
    plugin_name=$(basename "$plugin_dir")
    package_json="$plugin_dir/package.json"
    
    if [ -f "$package_json" ]; then
      echo "📦 Installing dependencies for plugin: $plugin_name"
      
      if (cd "$plugin_dir" && bun install); then
        # Check if package.json has sharp as a dependency
        if grep -q '"sharp"' "$package_json"; then
          echo "🔨 Rebuilding sharp native bindings for $plugin_name..."
          (cd "$plugin_dir" && npm rebuild sharp 2>/dev/null || true)
        fi
        echo "✅ $plugin_name - installed successfully"
        ((installed_count++))
      else
        echo "❌ $plugin_name - installation failed"
        ((failed_count++))
      fi
      echo ""
    else
      echo "⏭️  Skipping $plugin_name (no package.json)"
      ((skipped_count++))
      echo ""
    fi
  fi
done

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Summary:"
echo "  ✅ Installed: $installed_count"
echo "  ⏭️  Skipped:   $skipped_count"
echo "  ❌ Failed:    $failed_count"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [ $failed_count -gt 0 ]; then
  exit 1
fi

exit 0
