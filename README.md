# Minimal GitHub Copilot CLI

A minimalist Node.js CLI tool that authenticates with GitHub Copilot API and allows you to interact with AI models via the Copilot API.

**🚀 Now using YAML-based agent architecture!** - Clean, structured, and easy to parse.

## Features

- ✅ GitHub OAuth device flow authentication
- ✅ Automatic token caching and renewal in `.tokens.yaml`
- ✅ Token refresh handling
- ✅ Uses OpenAI SDK for maximum compatibility
- ✅ Tool calling support (function execution)
- ✅ **Security allowlist for terminal commands** 🔒
- ✅ Multi-turn conversations
- ✅ **YAML-based agent templates and sessions** 📄
- ✅ **Separate agent templates from chat instances** 🔄
- ✅ System prompt control
- ✅ Clean ES6 module syntax
- ✅ Multiple AI models supported (GPT-4o, Claude Sonnet 4.5, etc.)

## Architecture

The system uses a **two-tier YAML architecture** with **task-based approvals**:

### Agent Templates (`templates/*.agent.yaml`)
Base configurations for instantiating agents. Think of these as "classes" or "blueprints":
- Define agent capabilities and system prompts
- Reusable across multiple sessions
- Version-controlled and easy to review

### Chat Sessions (`sessions/*.session.yaml`)
Active conversation instances. Think of these as "objects" or "instances":
- Contain full conversation history
- Track session state (active, sleeping, completed)
- Can have multiple sessions per agent template
- Support long-running tasks with state preservation

### Approval System (`tasks/approvals.task.md`)
Human approvals use the **todo CLI task format** (from tmp6-todo project):
- All approval requests tracked as tasks in `tasks/approvals.task.md`
- Approve by changing `[_]` to `[x]` and adding `approved_by: your-name`
- Reject by changing `[_]` to `[-]` and adding `rejection_reason: ...`
- Risk levels automatically assessed (HIGH, MEDIUM, LOW)
- Clean, structured format that's easy to audit

## Installation

```bash
npm install
```

## Available Commands

```bash
npm start           # Start the multi-agent daemon (YAML mode)
npm run start:legacy # Start daemon in legacy Markdown mode
npm run pump        # Run daemon in pump mode (one iteration, then exit)
npm run migrate     # Migrate old *.agent.md files to YAML format
npm run demo        # Run the original demo scenario
npm run demo:pump   # Run interactive demo using pump mode (step-by-step)
npm test            # Run all tests (unit + integration)
npm run test:pump   # Run automated pump mode tests
npm run clean       # Clean up temporary files from tests and demos
```

## Examples

The `examples/` directory contains demonstrations of key features:

### 1. System Prompt, Roles, Context (`examples/1-ask.js`)
```bash
node examples/1-ask.js
```
Demonstrates controlling AI behavior with system prompts.
Shows how to use different message roles (system, user, assistant, tool).
Demonstrates multi-turn conversations where the AI remembers previous messages.

### 2. Secure Tool Calling w/ Terminal Allowlist (`examples/2-secure-agent.js`)
```bash
node examples/2-secure-agent.js
```
Shows how to execute terminal commands via AI tool calling (function execution).
Demonstrates terminal command execution with security controls using the command allowlist.
Shows how to automatically approve safe commands and block dangerous ones.

## How It Works

### Pump Mode (New!)

The daemon now supports **pump mode** for testing and debugging:

```bash
node daemon.js --pump
```

In pump mode, the daemon:
- Processes **exactly one iteration** of the event loop
- Handles all pending agent messages
- Processes all pending approvals
- Exits immediately after completion

This is useful for:
- **Testing**: Deterministic, reproducible test scenarios
- **Debugging**: Step through the workflow manually
- **Learning**: Understand the processing flow
- **CI/CD**: Automated testing without long-running processes

See [TESTING.md](TESTING.md) for detailed testing documentation.

### Authentication Flow

1. **Device Flow**: Initiates GitHub OAuth device flow
2. **Browser Auth**: Opens browser for user to authorize with GitHub
3. **Token Exchange**: Exchanges device code for GitHub OAuth token
4. **Copilot Token**: Uses OAuth token to get Copilot API token
5. **Token Caching**: Saves tokens to `.tokens.yaml` for reuse
6. **Auto Renewal**: Automatically refreshes tokens when expired

### API Integration

Uses the official **OpenAI SDK** with GitHub Copilot's API:
- Base URL: Dynamic (from token response, e.g., `https://api.individual.githubcopilot.com`)
- Models: Multiple models supported (GPT-4o, Claude Sonnet 4.5, o1-preview, etc.)
- Authentication: Bearer token from Copilot API
- Required Headers:
  - `Editor-Version`: vscode/1.99.3
  - `Editor-Plugin-Version`: copilot-chat/0.26.7
  - `User-Agent`: GitHubCopilotChat/0.26.7
  - `Copilot-Integration-Id`: vscode-chat
  - `OpenAI-Intent`: conversation-panel

## Token Storage

Tokens are stored in `.tokens.yaml` in the project directory:

```yaml
github_token: ghp_xxxxx...
copilot_token: cop_xxxxx...
expires_at: 1234567890
api_url: https://api.githubcopilot.com
```

**Note**: Add `.tokens.yaml` to `.gitignore` to keep tokens secure.
