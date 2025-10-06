#!/usr/bin/env bash

set -x

node src/daemon.mjs tool

# tools/file.mjs

node src/daemon.mjs tool read_file '{"path":"memory/system-config.md"}'

node src/daemon.mjs tool write_file '{"path":"memory/system-config2.md", "content": "whats up?"}'

node src/daemon.mjs --format json tool list_directory '{"path":"memory/"}'

node src/daemon.mjs tool create_directory '{"path":"memory/tmp123/"}'


# tools/tasks.mjs

node src/daemon.mjs tool create_task '{"title":"Check Redis status","priority":"B","stakeholders":["@sarah"],"tags":["#redis"],"id":"test-1234"}'

node src/daemon.mjs tool --format yaml query_tasks '{"query":"SELECT * FROM tasks/approvals.task.md"}'

node src/daemon.mjs tool query_tasks '{"query":"UPDATE tasks/approvals.task.md SET completed = true WHERE id = \"test-1234\""}'


# tools/shell.mjs

node src/daemon.mjs tool execute_shell '{"command":"ls"}'

# tools/agent.mjs

node src/daemon.mjs tool new_session '{"agent":"planner","prompt":"What is 2+2?"}'

node src/daemon.mjs --format yaml tool list_sessions '{}'

node src/daemon.mjs tool append_prompt '{"session_id":0,"prompt":"What is 3+3?"}'

node src/daemon.mjs tool fork_session '{"session_id":0,"prompt":"What is 4+4?"}'

node src/daemon.mjs tool kill_session '{"session_id":0}'


# special

node src/daemon.mjs clean

node src/daemon.mjs tool new_session '{"agent":"solo","prompt":"run the terminal command `whoami`"}'

node src/daemon.mjs eval 0
