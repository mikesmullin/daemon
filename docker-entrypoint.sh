#!/bin/bash
# Docker entrypoint: install deps (uses warm cache) then run

set -e

echo "[docker-entrypoint.sh] [TRACE] $(date -u +"%Y-%m-%dT%H:%M:%S.%3NZ") Starting entrypoint"

cd /app

# Quick install - cache is pre-warmed during image build
echo "[docker-entrypoint.sh] [TRACE] $(date -u +"%Y-%m-%dT%H:%M:%S.%3NZ") Restoring baked lockfile"
cp /home/user/bun.lock.baked /app/bun.lock

echo "[docker-entrypoint.sh] [TRACE] $(date -u +"%Y-%m-%dT%H:%M:%S.%3NZ") Restoring node_modules from cache-warm"
# Find all node_modules directories in /tmp/cache-warm and copy them to /app
# We use rsync to merge/overwrite, preserving structure
# Note: /tmp/cache-warm structure mirrors /app structure (package.json, plugins/...)
cd /tmp/cache-warm
find . -type d -name "node_modules" | while read dir; do
    # dir is like ./node_modules or ./plugins/agent/node_modules
    target_dir="/app/$dir"
    # Ensure parent dir exists
    mkdir -p "$(dirname "$target_dir")"
    # Copy contents
    echo "[docker-entrypoint.sh] [TRACE] Restoring $dir"
    cp -r "$dir" "$(dirname "$target_dir")/"
done
cd /app

# echo "[docker-entrypoint.sh] [TRACE] $(date -u +"%Y-%m-%dT%H:%M:%S.%3NZ") Running bun install"
# bun install --frozen-lockfile 2>/dev/null || bun install
# echo "[docker-entrypoint.sh] [TRACE] $(date -u +"%Y-%m-%dT%H:%M:%S.%3NZ") bun install completed"

# Run the app
echo "[docker-entrypoint.sh] [TRACE] $(date -u +"%Y-%m-%dT%H:%M:%S.%3NZ") Executing index.mjs"
exec bun run index.mjs "$@"
