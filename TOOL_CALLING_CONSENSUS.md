### Is This a Known Issue?

Yes, the issue you've described—tool calls being detected and executed but with empty arguments (`{}`) passed to the `execute` function in the `@ai-sdk/openai-compatible` provider—is a **known bug** in the Vercel AI SDK. It's specifically tied to how the provider handles tool call argument parsing in OpenAI-compatible APIs (like GitHub Copilot's `/chat/completions` endpoint). This has been documented in recent GitHub issues and aligns closely with your Copilot analysis.

#### Key Matching Issue: GitHub Issue #6687
- **Title**: "Tool Calls Fail with Empty Arguments in OpenAI-Compatible Provider"
- **Opened**: June 9, 2025 (recent, post-dating your SDK versions)
- **Status**: Open (as of current data)
- **Description**: 
  - Tool calls are detected (`finishReason: "tool-calls"`), and the `execute()` function is invoked, but arguments arrive as an empty object `{}` or fail parsing entirely.
  - Root cause: The provider's JSON parsing logic (in `openai-compatible-chat-language-model.ts`, around line 600) checks `if (isParsableJson(toolCall.function.arguments))`. When the API returns an empty string `""` for arguments (common with parameterless tools or certain models like Claude via compatible endpoints), it fails to parse and enqueues an incomplete tool call, leading to empty args.
  - This matches your findings: Raw API sends valid JSON like `{"command": "node --version"}`, but the SDK loses it during transformation.
- **Affected Components**:
  - `@ai-sdk/openai-compatible` (v1.0.19 and similar).
  - Both `generateText` and `streamText`.
  - Zod or plain JSON schemas.
  - "strict" or "compatible" modes.
  - Models via `/chat/completions` (e.g., GitHub Copilot, Claude).
- **Reproduction**: The issue includes a minimal repro similar to your `4-tools-vercel.js`:
  ```javascript:disable-run
  import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
  import { streamText, tool } from 'ai';
  import { z } from 'zod';

  const model = createOpenAICompatible({ baseURL: 'https://api.githubcopilot.com' }); // Or your endpoint
  const result = await streamText({
    model,
    tools: {
      executeCommand: tool({
        description: 'Execute a command',
        parameters: z.object({ command: z.string() }),
        execute: async ({ command }) => { /* Always gets {} */ }
      })
    },
    prompt: 'Run node --version'
  });
  ```
- **Impact**: Silent failure—no error, just no args. Works fine with direct OpenAI SDK (as in your `4-tools-openai.js`).
- **Link**: [GitHub Issue #6687](https://github.com/vercel/ai/issues/6687)

#### Related Issues (Similar Symptoms)
These highlight broader parsing/compatibility problems in the same provider:
- **Issue #2103** (June 25, 2024): "Incorrect `args` format in `tool-call` messages when calling functions with no parameters." Tool calls use `args: ""` (empty string) instead of `args: {}`, causing JSON parse errors in the SDK. Affects Anthropic/Claude ports but overlaps with compatible providers.
- **Issue #1512** (May 7, 2024): Tool calls not accessible in streamed responses, with args sometimes dropped in multi-step loops.
- **Discussion #1905** (Ongoing): Handling invalid tool calls (e.g., parse failures), with users reporting empty args as a common repair trigger.

No exact matches for GitHub Copilot specifically, but the compatible provider is designed for endpoints like it, so this fits.

#### Why It Happens (Root Cause Recap)
- OpenAI-compatible APIs (e.g., Copilot) return tool calls in OpenAI format: `{"arguments": "{\"command\":\"node --version\"}"}`.
- The SDK's `isParsableJson` fails on edge cases like empty strings or malformed JSON from non-OpenAI providers.
- Your workaround (hardcoding args) is a common temp fix mentioned in threads, but as you noted, it breaks the tool's purpose.
- Not a Vercel *API* issue (e.g., deployment/hosting), but the AI SDK's provider layer—hence why direct OpenAI SDK bypasses it.

#### Status and Workarounds
- **Open/Unresolved**: No fix merged yet (as of Oct 2025). Vercel team is active; #6687 has repro code and is labeled "bug/provider/openai-compatible".
- **Your Recommendations Hold**:
  - **Mixed SDKs**: Use Vercel AI SDK for non-tool flows (examples 1-3); OpenAI SDK for tools (example 4). This is the consensus in issues.
  - **Monitor Updates**: Watch `@ai-sdk/openai-compatible` releases. AI SDK 5.x improved tool repair (e.g., `experimental_toToolCallRepair` for auto-fixing parses), but doesn't fully resolve this.
  - **Report It**: If #6687 doesn't cover your exact Copilot setup, add a comment with your repro files—Vercel encourages this.
- **Quick Fixes to Try**:
  - Upgrade to latest (`@ai-sdk/openai-compatible@^1.x` or AI SDK 5+).
  - Use `experimental_toolCallRepair` in `streamText` to auto-reparse args with a stronger model.
  - For Copilot: Test with `compatibility: "strict"` and explicit `jsonSchema` (no Zod) as a last resort, though your tests showed it fails.

#### Community Chatter
Sparse on X (formerly Twitter), but one recent post notes SDK docs issues with Zod imports for tools (`import { z } from 'zod/v4'`), which could compound parsing bugs. Reddit threads echo silent failures in tool execution.

If this doesn't match your exact setup or you share more code/logs, I can dig deeper (e.g., browse your repro files if public). Otherwise, your Copilot analysis is spot-on—stick with the dual-SDK approach until fixed!