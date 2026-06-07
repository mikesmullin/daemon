# Roles

A cluster consists of three node types (a.k.a. `roles`):

- **Hub**: Central routing node (1 per cluster) - commands route through it, can also execute hub-only commands
- **Term**: Terminal/client nodes (1-3 per cluster) - users issue commands here, receive responses. A thin-client; input is routed to hub -> workers and output is routed back. This way all the work happens remotely, and `term` simply accepts input and prints output to stdout. Very similar to a reverse shell.
- **Worker**: Command execution nodes (many, ~90% of cluster) - processes commands dispatched by the hub

Commands always flow from source to destination through the hub. **All responses also route back through the hub** to ensure centralized message tracking and delivery. Workers can run on bare metal (sensitive/hardware-intensive operations) or in containers (majority of commands, safe isolation).

# Names

The `d4` CLI provides a `--name <name>` parameter which specifies the globally unique (within a cluster) name for each node on startup.

**NOTE TO AI:** The `--name` param was incorrectly implemented as `-name`. When you see this note, if you can correct that (change it in code, update references) and remove this note, it would be great! Thank you.

## Informal Naming Convention

### Legend

#### First Character (Scope)
- `p`: personal
- `w`: work

#### Second Character (Hardware)
- `b`: bare-metal
- `c`: container

#### Third Character (OS)
- `w`: windows
- `m`: macos
- `l`: linux

## Example Names

Example names a cluster might have include:
- `pcl2`: personal container linux machine 2 (armbian router) (hub)
- `pbl1`: personal bare-metal linux machine 1 (arch linux pc) (worker)
- `pcl1`: personal container linux machine 1 (podman on arch linux pc) (worker)
- `wbm1`: work bare-metal macos machine 1 (macbook) (worker)
- `wcm1`: work container macos machine 1 (podman on macbook) (worker)
- `wbw1`: work bare-metal windows machine 1 (hp laptop w/ gpu) (worker)

**NOTE:** Terminal (`term`) names don't follow a convention. They might eb:
- `pixel`: mintty on Android (Google Pixel 6) (term)
- `kindle`: mintty on Android (Android Kindle Fire HD) (term)

Of course, `term` nodes can not execute tool_calls. The only command they can run (locally) is the `help` command, which prints help text to stdout. (and `term` are the only nodes that process `help` commands).