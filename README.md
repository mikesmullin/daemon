# Minimal GitHub Copilot CLI

A minimalist Node.js CLI tool that authenticates with GitHub Copilot API and allows you to interact with Claude Sonnet 4 via the Copilot API.

## Features

- ✅ GitHub OAuth device flow authentication
- ✅ Automatic token caching in `.tokens.yaml`
- ✅ Token refresh handling
- ✅ Interactive prompt for user input
- ✅ Uses GPT-4o (or other models) via GitHub Copilot API
- ✅ Clean ES6 module syntax

## Installation

```bash
npm install
```

## Usage

```bash
npm start
```

The tool will:
1. Check for cached tokens in `.tokens.yaml`
2. If no valid token exists, open your browser for GitHub authentication
3. Display a device code for you to authorize
4. Wait for authorization and obtain Copilot API token
5. Prompt you for an LLM prompt
6. Send the prompt to Claude Sonnet 4 via Copilot API
7. Display the response

## How It Works

### Authentication Flow

1. **Device Flow**: Initiates GitHub OAuth device flow
2. **Browser Auth**: Opens browser for user to authorize with GitHub
3. **Token Exchange**: Exchanges device code for GitHub OAuth token
4. **Copilot Token**: Uses OAuth token to get Copilot API token
5. **Token Caching**: Saves tokens to `.tokens.yaml` for reuse

### API Integration

Uses Vercel AI SDK's `@ai-sdk/openai` package with GitHub Copilot's OpenAI-compatible endpoint:
- Base URL: Dynamic (from token response, e.g., `https://api.individual.githubcopilot.com`)
- Model: `gpt-4o` (can be changed to other available models)
- Authentication: Bearer token from Copilot API
- Required Headers:
  - `Editor-Version`: vscode/1.99.3
  - `Editor-Plugin-Version`: copilot-chat/0.26.7
  - `User-Agent`: GitHubCopilotChat/0.26.7

## Token Storage

Tokens are stored in `.tokens.yaml` in the project directory:

```yaml
github_token: ghp_xxxxx...
copilot_token: cop_xxxxx...
expires_at: 1234567890
api_url: https://api.githubcopilot.com
```

**Note**: Add `.tokens.yaml` to `.gitignore` to keep tokens secure.

## Requirements

- Node.js 18+ (ES6 modules support)
- Active GitHub Copilot subscription
- Internet connection for authentication and API calls

## Example Session

```
🚀 Minimal GitHub Copilot CLI

🔐 Starting GitHub authentication...

📋 Please visit: https://github.com/login/device
🔑 Enter code: ABCD-1234

⏳ Waiting for authorization.....
✓ GitHub authenticated!
✓ Copilot token obtained!
✓ Tokens saved to /path/to/.tokens.yaml

💬 Enter your prompt for Copilot: Write a haiku about coding

🤖 Calling Copilot API...

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📝 Copilot Response:

Code flows like water,
Bugs dance in morning debug,
Coffee saves the day.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

## Based On

This implementation is inspired by the authentication mechanism used in [sst/opencode](https://github.com/sst/opencode), specifically their GitHub Copilot provider integration.

## License

MIT
