#!/usr/bin/env bash

set -x

node src/daemon.mjs clean

input=$(cat <<EOF
New Slack message from @sarah: "Can you check if the Redis container is running locally?"

Context:
- User is the engineering manager (see memory/team-prefs.md)
- This is a status check request
- Response should be concise and include relevant metrics

Please decompose this into tasks for our multi-agent system.
EOF
)

node src/daemon.mjs new planner "$input"

node src/daemon.mjs list
node src/daemon.mjs eval 0

