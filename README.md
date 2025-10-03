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

### Interactive Mode

```bash
npm start
```

The tool will:
1. Check for cached tokens in `.tokens.yaml`
2. If no valid token exists, open your browser for GitHub authentication
3. Display a device code for you to authorize
4. Wait for authorization and obtain Copilot API token
5. Prompt you for an LLM prompt
6. Send the prompt to the selected model via Copilot API
7. Display the response

### CLI Mode

You can also pass prompts and model selection directly via command-line arguments:

```bash
# Use default model (gpt-4o)
node index.js --prompt "Explain async/await"

# Specify a model
node index.js --model claude-sonnet-4 --prompt "Write a haiku about coding"

# Show help
node index.js --help
```

**Available options:**
- `--prompt <text>` - Send this prompt directly (skip interactive input)
- `--model <name>` - Model to use (default: gpt-4o)
- `--help, -h` - Show help message

**Supported models:**
- `gpt-4o` - GPT-4 Omni (default)
- `claude-sonnet-4` - Claude Sonnet 4
- `o1-preview` - OpenAI o1 Preview
- `gpt-4` - GPT-4
- And other models available through your GitHub Copilot subscription

## How It Works

### Authentication Flow

1. **Device Flow**: Initiates GitHub OAuth device flow
2. **Browser Auth**: Opens browser for user to authorize with GitHub
3. **Token Exchange**: Exchanges device code for GitHub OAuth token
4. **Copilot Token**: Uses OAuth token to get Copilot API token
5. **Token Caching**: Saves tokens to `.tokens.yaml` for reuse

### API Integration

Uses Vercel AI SDK's `@ai-sdk/openai-compatible` package with GitHub Copilot's API:
- Base URL: Dynamic (from token response, e.g., `https://api.individual.githubcopilot.com`)
- Models: Multiple models supported (GPT-4o, Claude Sonnet 4, o1-preview, etc.)
- Authentication: Bearer token from Copilot API
- Required Headers:
  - `Editor-Version`: vscode/1.99.3
  - `Editor-Plugin-Version`: copilot-chat/0.26.7
  - `User-Agent`: GitHubCopilotChat/0.26.7
- Uses `openai-compatible` provider for maximum compatibility across different model types

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

### Interactive Mode

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
🎯 Using model: gpt-4o

🤖 Calling Copilot API...

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📝 Copilot Response:

Code flows like water,
Bugs dance in morning debug,
Coffee saves the day.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### CLI Mode

```bash
$ node index.js --model claude-sonnet-4 --prompt "Write a haiku about coding"

🚀 Minimal GitHub Copilot CLI

✓ Using cached Copilot token

💬 Using prompt: "Write a haiku about coding"
🎯 Using model: claude-sonnet-4

🤖 Calling Copilot API...

🔗 Using API endpoint: https://api.individual.githubcopilot.com
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📝 Copilot Response:

Lines of logic flow,
Debugging through endless nights—
Code compiles at last.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

## Based On

This implementation is inspired by the authentication mechanism used in [sst/opencode](https://github.com/sst/opencode), specifically their GitHub Copilot provider integration.

## License

MIT
