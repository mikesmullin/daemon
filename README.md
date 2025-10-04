# Minimal GitHub Copilot CLI

A minimalist Node.js CLI tool that authenticates with GitHub Copilot API and allows you to interact with AI models via the Copilot API.

**🚀 Now using OpenAI SDK exclusively!** - Simpler, more reliable, better tool support.

## Features

- ✅ GitHub OAuth device flow authentication
- ✅ Automatic token caching and renewal in `.tokens.yaml`
- ✅ Token refresh handling
- ✅ Uses OpenAI SDK for maximum compatibility
- ✅ Tool calling support (function execution)
- ✅ **Security allowlist for terminal commands** 🔒
- ✅ Multi-turn conversations
- ✅ System prompt control
- ✅ Clean ES6 module syntax
- ✅ Multiple AI models supported (GPT-4o, Claude Sonnet 4.5, etc.)

## Installation

```bash
npm install
```

## Available Commands

```bash
npm start        # Start the multi-agent daemon (file watcher)
npm run demo     # Run the demo scenario (Slack → Redis check → response)
npm test         # Run all tests (unit + integration)
npm run clean    # Clean up temporary files from tests and demos
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
