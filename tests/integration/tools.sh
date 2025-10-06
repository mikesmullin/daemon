#!/usr/bin/env bash

set -x

node src/daemon.mjs tool

# tools/file.mjs

node src/daemon.mjs tool read_file '{"path":"memory/system-config.md"}'

node src/daemon.mjs tool write_file '{"path":"memory/system-config2.md", "content": "whats up?"}'

node src/daemon.mjs --format json tool list_directory '{"path":"memory/"}'

node src/daemon.mjs tool create_directory '{"path":"memory/tmp123/"}'


# tools/tasks.mjs

node src/daemon.mjs tool create_task '{"title":"Check Redis status","priority":"B","stakeholders":["@sarah"],"tags":["#redis"]}'

node src/daemon.mjs tool query_tasks '{"status":"open"}'

node src/daemon.mjs tool update_task '{"id":"task_id","status":"completed"}'

# tools/shell.mjs

node src/daemon.mjs tool execute_shell '{"command":"ls"}'
