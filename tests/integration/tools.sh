#!/usr/bin/env bash

set -x

node src/daemon.mjs tool

node src/daemon.mjs tool read_file '{"path":"memory/system-config.md"}'

node src/daemon.mjs tool write_file '{"path":"memory/system-config2.md", "content": "whats up?"}'

node src/daemon.mjs tool --format yaml list_directory '{"path":"memory/"}'

