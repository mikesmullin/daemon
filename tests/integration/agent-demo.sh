#!/usr/bin/env bash

set -x

node src/daemon.mjs clean

input=$(cat <<EOF
Use podman cli to check if the Redis container is running locally.
EOF
)

node src/daemon.mjs new solo "$input"

node src/daemon.mjs sessions
node src/daemon.mjs eval 0

