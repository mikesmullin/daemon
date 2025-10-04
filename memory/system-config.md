# System Configuration

## Environment

**Operating System:** Windows 11 with WSL2 (Ubuntu 22.04)

**Container Runtime:** Docker Desktop
- Version: 24.0.6
- WSL2 Backend enabled
- Docker Compose available

**Development Tools:**
- Node.js v20.10.0
- npm v10.2.3
- Git 2.42.0

## Running Services

**Redis:**
- Container name: `redis-local`
- Port: 6379
- Status: Usually running during development
- Check command: `docker ps --filter "name=redis"`

**PostgreSQL:**
- Container name: `postgres-dev`
- Port: 5432
- Status: Running
- Check command: `docker ps --filter "name=postgres"`

## File Locations

**Project Root:** `/mnt/z/tmp7-opencode`

**Agent Files:** `agents/*.agent.md`

**Task Files:** `tasks/*.task.md`

**Memory/Knowledge:** `memory/*.md`

## Network

**Slack Integration:**
- Workspace: `dev-team`
- Bot token: Stored in `.env` (SLACK_BOT_TOKEN)
- Incoming webhook: For posting messages
- Event subscriptions: Enabled for direct messages
