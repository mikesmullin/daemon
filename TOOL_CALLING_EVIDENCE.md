# Tool Calling Bug Evidence

**Date:** October 4, 2025  
**Issue:** Vercel AI SDK `@ai-sdk/openai-compatible` provider fails to extract tool call arguments from GitHub Copilot API responses

---

## Executive Summary

After extensive testing with 10+ test files, we have **definitively identified a bug** in the Vercel AI SDK's `@ai-sdk/openai-compatible` provider (version 1.0.19).

**The Bug:** When the GitHub Copilot API returns tool calls with arguments, the `@ai-sdk/openai-compatible` provider fails to extract those arguments, resulting in empty objects `{}` being passed to tool execution functions.

**Impact:** Tool calling is completely broken when using Vercel AI SDK with GitHub Copilot API, despite working correctly with the OpenAI SDK.

---

## Evidence

### 1. Raw API Response (Ground Truth)

**Test File:** `examples/4-tools-raw-response.js`

**What We Did:** Made a direct `fetch()` call to the Copilot API to inspect the raw JSON response.

**Result:** The API returns **CORRECT** tool call arguments:

```json
{
  "choices": [
    {
      "finish_reason": "tool_calls",
      "message": {
        "role": "assistant",
        "tool_calls": [
          {
            "function": {
              "arguments": "{\"command\":\"node --version\"}",  ← CORRECT
              "name": "executeCommand"
            },
            "id": "toolu_vrtx_01BAmZTiYC47NiMHUw7oirj7",
            "type": "function"
          }
        ]
      }
    }
  ],
  "model": "claude-sonnet-4.5"
}
```

**Key Fields:**
- `arguments`: `"{\"command\":\"node --version\"}"` (JSON string)
- Type: `string`
- When parsed: `{"command": "node --version"}` ✅

**Conclusion:** GitHub Copilot API is working correctly.

---

### 2. OpenAI SDK Extraction (Works Correctly)

**Test File:** `examples/4-tools-openai-params.js`

**What We Did:** Used the official OpenAI SDK to call the same API and inspect how it parses the response.

**Result:** OpenAI SDK **CORRECTLY** extracts arguments:

```javascript
const response = await client.chat.completions.create({
  model: 'claude-sonnet-4.5',
  messages: messages,
  tools: toolDefinitions,
  max_tokens: 1000,
});

const toolCall = response.choices[0].message.tool_calls[0];
console.log('Arguments (raw):', toolCall.function.arguments);
// Output: {"command":"node --version"}

const args = JSON.parse(toolCall.function.arguments);
console.log('args.command:', args.command);
// Output: node --version ✅
```

**Console Output:**
```
Arguments (raw): {"command":"node --version"}
Arguments (parsed): {
  "command": "node --version"
}
Arguments type: object
Arguments keys: [ 'command' ]
args.command: node --version
```

**Conclusion:** OpenAI SDK correctly parses the API response.

---

### 3. Vercel AI SDK Extraction (BROKEN)

**Test File:** `examples/4-tools-deep-inspect.js`

**What We Did:** Used the Vercel AI SDK with detailed logging in the `execute()` function and `onStepFinish` callback.

**Result:** Vercel AI SDK passes **EMPTY** arguments:

```javascript
const result = await streamText({
  model: provider('claude-sonnet-4.5'),
  messages: messages,
  tools: {
    executeCommand: {
      description: 'Execute a shell command and return its output',
      parameters: z.object({
        command: z.string()
      }),
      execute: async function(args) {
        console.log('args:', args);
        // Output: {} ❌ EMPTY OBJECT
        console.log('args.command:', args.command);
        // Output: undefined ❌
      }
    }
  },
  onStepFinish: (step) => {
    console.log('toolCalls:', step.toolCalls);
  }
});
```

**Console Output from execute():**
```
=== EXECUTE FUNCTION CALLED ===
typeof args: object
args: {}                    ← EMPTY
args constructor: Object
args keys: []               ← NO KEYS
args.command: undefined     ← MISSING
JSON.stringify(args): {}
```

**Console Output from onStepFinish():**
```json
{
  "toolCalls": [
    {
      "type": "tool-call",
      "toolCallId": "toolu_vrtx_014wRGzGeEZuUhotWfuX7Fmy",
      "toolName": "executeCommand",
      "input": {}    ← BUG: Should contain {"command": "node --version"}
    }
  ]
}
```

**Conclusion:** The bug occurs BEFORE `execute()` is called. The Vercel AI SDK is extracting an empty `input: {}` object when parsing the API response.

---

## Proof of Bug Location

Comparing the three tests:

| Source | Arguments Value | Status |
|--------|----------------|--------|
| **Raw API** | `"{\"command\":\"node --version\"}"` | ✅ Correct |
| **OpenAI SDK** | `{"command": "node --version"}` | ✅ Correct |
| **Vercel AI SDK** | `{}` (empty) | ❌ **BUG** |

The transformation chain:
1. ✅ Copilot API sends: `arguments: "{\"command\":\"node --version\"}"`
2. ✅ OpenAI SDK receives and parses correctly
3. ❌ Vercel AI SDK transforms to: `input: {}`
4. ❌ `execute()` function receives: `args = {}`

**Bug Location:** The `@ai-sdk/openai-compatible` provider's response parser is failing to extract the `arguments` field from `tool_calls[].function.arguments`.

---

## Additional Testing

### Test: Different Schema Types

**Files Tested:**
- `4-tools-params.js` - With zod schema ❌ Broken
- `4-tools-nozod.js` - With plain JSON schema ❌ Broken

**Result:** Schema type makes no difference. The bug exists in the response parsing, not schema validation.

---

### Test: Different API Modes

**File:** `4-tools-compat.js`

**What We Did:** Tested both `"strict"` and `"compatible"` compatibility modes.

**Result:** Both modes fail identically:

```
[strict] Tool called with args: {}     ❌
[compatible] Tool called with args: {} ❌
```

**Conclusion:** Compatibility mode setting has no effect on this bug.

---

### Test: Different Generation Methods

**Files Tested:**
- `4-tools-vercel.js` - Using `generateText()` ❌ Broken
- `4-tools-stream.js` - Using `streamText()` ❌ Broken

**Result:** Both generation methods exhibit the same bug.

---

### Test: Alternative Provider

**File:** `4-tools-openai-provider.js`

**What We Did:** Tried using `@ai-sdk/openai` provider instead of `@ai-sdk/openai-compatible`.

**Result:** Wrong API endpoint error:

```
Error: model claude-sonnet-4.5 is not supported via Responses API.
URL: https://api.individual.githubcopilot.com/responses
statusCode: 400
```

**Conclusion:** The `@ai-sdk/openai` provider uses the `/responses` endpoint instead of `/chat/completions`. GitHub Copilot API requires the `/chat/completions` endpoint for Claude models. Therefore, we **must** use `@ai-sdk/openai-compatible`, which has the bug.

---

## Test Files Summary

| File | Purpose | Result |
|------|---------|--------|
| `4-tools-openai.js` | Baseline with OpenAI SDK | ✅ Works |
| `4-tools-openai-params.js` | OpenAI SDK parameter inspection | ✅ Receives args correctly |
| `4-tools-raw-response.js` | Raw API response inspection | ✅ API sends args correctly |
| `4-tools-vercel.js` | Vercel AI SDK with generateText | ❌ Empty args |
| `4-tools-vercel-debug.js` | Detailed debugging | ❌ Empty args |
| `4-tools-stream.js` | Vercel AI SDK with streamText | ❌ Empty args |
| `4-tools-params.js` | Parameter debugging | ❌ Empty args |
| `4-tools-nozod.js` | Without zod schemas | ❌ Empty args |
| `4-tools-compat.js` | Compatibility mode testing | ❌ Empty args (both modes) |
| `4-tools-openai-provider.js` | Alternative provider | ❌ Wrong API endpoint |
| `4-tools-deep-inspect.js` | Deep inspection of SDK internals | ❌ Shows bug in `input` field |

---

## Technical Analysis

### Expected Behavior

When the Copilot API returns:
```json
{
  "function": {
    "arguments": "{\"command\":\"node --version\"}",
    "name": "executeCommand"
  }
}
```

The SDK should:
1. Extract the `arguments` string: `"{\"command\":\"node --version\"}"`
2. Parse it as JSON: `{"command": "node --version"}`
3. Pass it to `execute()`: `args = {command: "node --version"}`

### Actual Behavior

The SDK currently:
1. ❓ Fails to extract or loses the `arguments` field
2. Creates an empty object: `{}`
3. Passes empty object to `execute()`: `args = {}`

### Where the Bug Occurs

Based on the `onStepFinish` output showing `"input": {}`, the bug occurs in the response transformation layer of `@ai-sdk/openai-compatible`, specifically:

1. **Response Parser:** The function that reads the API response and extracts tool calls
2. **Arguments Extractor:** The function that extracts `tool_calls[].function.arguments`
3. **JSON Parser:** The function that parses the arguments string into an object

One of these steps is failing silently, resulting in an empty object.

---

## Workaround Options

### Option 1: Use OpenAI SDK for Tool Calling ✅ RECOMMENDED

**Current Implementation:** `examples/4-tools.js`

```javascript
import OpenAI from 'openai';
import { getSession, getOpenAIConfig } from '../lib/session.js';

const session = await getSession();
const client = new OpenAI(getOpenAIConfig(session));

// Tool calling works correctly ✅
```

**Pros:**
- ✅ Works correctly
- ✅ No code changes needed
- ✅ Can migrate later when SDK is fixed

**Cons:**
- ❌ Mixed SDKs in project
- ❌ Two dependencies

---

### Option 2: Hardcode Commands (HACK)

```javascript
execute: async (args) => {
  // HACK: args.command is always undefined due to SDK bug
  const command = args.command || 'node --version';
  // ...
}
```

**Pros:**
- ✅ Uses Vercel AI SDK

**Cons:**
- ❌ Defeats purpose of tool calling
- ❌ Not a real solution
- ❌ Unmaintainable

---

### Option 3: Wait for SDK Fix

**Pros:**
- ✅ Eventually will work

**Cons:**
- ❌ Unknown timeline
- ❌ Blocks current work
- ❌ No guarantee of fix

---

## Recommendation

**Use OpenAI SDK for tool calling** (examples/4-tools.js) until the Vercel AI SDK bug is fixed.

**For non-tool examples** (1-3), continue using Vercel AI SDK as it works perfectly for standard chat completions.

---

## Dependencies Strategy

### Current Dependencies (Optimized)

```json
{
  "dependencies": {
    "@ai-sdk/openai-compatible": "^1.0.19",  // For examples 1-3 (no tools)
    "ai": "^5.0.60",                          // For examples 1-3 (no tools)
    "openai": "^6.1.0",                       // For example 4 (tools) ✅
    "js-yaml": "^4.1.0",                      // lib/session.js
    "open": "^10.1.0",                        // lib/session.js (OAuth flow)
    "zod": "^4.1.11"                          // Optional: Type-safe parameters
  }
}
```

### Can Remove

- ❌ `@ai-sdk/openai` - Was never used, already removed
- ❌ `readline` - Only used in index.js (not in examples)

### Cannot Remove

- ✅ `@ai-sdk/openai-compatible` - Examples 1-3 work perfectly
- ✅ `ai` - Examples 1-3 work perfectly
- ✅ `openai` - Required for example 4 until SDK bug is fixed

---

## Bug Report Information

If filing a bug with the Vercel AI SDK team, include:

**Environment:**
- `ai`: `5.0.60`
- `@ai-sdk/openai-compatible`: `1.0.19`
- Node.js: `v22.20.0`
- API: GitHub Copilot API (`https://api.individual.githubcopilot.com`)

**Issue:**
Tool call arguments are not extracted from API responses. The `execute()` function receives an empty object `{}` instead of the parsed arguments.

**Expected:**
```javascript
execute: async (args) => {
  console.log(args); // Should be: {command: "node --version"}
}
```

**Actual:**
```javascript
execute: async (args) => {
  console.log(args); // Is: {}
}
```

**API Response (Confirmed Correct):**
```json
{
  "tool_calls": [
    {
      "function": {
        "arguments": "{\"command\":\"node --version\"}",
        "name": "executeCommand"
      }
    }
  ]
}
```

**SDK Transformation (BUG):**
```json
{
  "toolCalls": [
    {
      "toolName": "executeCommand",
      "input": {}  // ← Should be {command: "node --version"}
    }
  ]
}
```

**Reproduction:**
See test files in this repository: `examples/4-tools-deep-inspect.js`

---

## Conclusion

This is a **confirmed bug** in `@ai-sdk/openai-compatible@1.0.19` that prevents tool calling from working with GitHub Copilot API.

**Workaround:** Use the official OpenAI SDK for tool calling until the Vercel AI SDK is fixed.

**Status:** Examples 1-3 use Vercel AI SDK (working), Example 4 uses OpenAI SDK (working).

---

**Last Updated:** October 4, 2025  
**Investigation Time:** ~15 test iterations  
**Test Files Created:** 10+  
**Bug Status:** Confirmed, reproducible, documented
