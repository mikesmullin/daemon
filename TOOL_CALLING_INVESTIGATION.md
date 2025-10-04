# Tool Calling Investigation Results

## Summary

After extensive testing, I've identified a **BUG in the `@ai-sdk/openai-compatible` provider** that prevents tool arguments from being passed correctly when used with the GitHub Copilot API.

---

## Test Results

### ✅ OpenAI SDK (Works Correctly)

**File:** `4-tools-openai.js`

**Status:** WORKING  
**Arguments Received:** `{"command": "node --version"}` ✅  
**Tool Execution:** SUCCESS ✅

**Evidence:**
```
Tool Call:
  Arguments (raw): {"command":"node --version"}
  Arguments (parsed): {
    "command": "node --version"
  }
  Arguments keys: [ 'command' ]

Tool execute() called with:
  Args: {
    "command": "node --version"
  }
```

---

### ❌ Vercel AI SDK with openai-compatible (Broken)

**Files Tested:**
- `4-tools-vercel.js`
- `4-tools-vercel-debug.js`
- `4-tools-stream.js`
- `4-tools-params.js`
- `4-tools-nozod.js`
- `4-tools-compat.js`

**Status:** BROKEN  
**Arguments Received:** `{}` (empty object) ❌  
**Tool Execution:** Fails (no arguments)

**Evidence:**
```
Tool execute() called!
  Args: {}
  Args keys: []
  args.command: undefined
```

**Findings:**
1. ❌ Tool IS being detected (`finishReason: "tool-calls"`)
2. ❌ Tool execute() IS being called
3. ❌ Arguments are NOT being passed (always `{}`)
4. ❌ This occurs with BOTH `generateText` and `streamText`
5. ❌ This occurs with BOTH `zod` schemas and plain JSON schemas
6. ❌ This occurs with BOTH `"strict"` and `"compatible"` modes

---

### ❌ Vercel AI SDK with @ai-sdk/openai (Wrong API)

**File:** `4-tools-openai-provider.js`

**Status:** INCOMPATIBLE  
**Error:** `model claude-sonnet-4.5 is not supported via Responses API`

**Findings:**
- The `@ai-sdk/openai` provider uses `/responses` API endpoint
- GitHub Copilot API requires `/chat/completions` endpoint
- Claude models are only supported via `/chat/completions`
- This provider CANNOT be used with Copilot API

---

## Root Cause Analysis

### What the Copilot API Sends

From OpenAI SDK test, we know the API correctly sends:
```json
{
  "id": "toolu_vrtx_01PHKCszCamKFPnjyzsjGm2u",
  "type": "function",
  "function": {
    "name": "executeCommand",
    "arguments": "{\"command\":\"node --version\"}"
  }
}
```

### What Vercel AI SDK Receives

The `@ai-sdk/openai-compatible` provider is receiving the tool call from the API, but when it passes the arguments to the `execute()` function, it's passing an empty object `{}`.

### The Bug

There's a bug in how `@ai-sdk/openai-compatible` (version 1.0.19) extracts/parses tool call arguments from the API response. The arguments string is being lost somewhere in the transformation pipeline.

---

## Why This Matters

### For Examples 1-3 (No Tools)
✅ Vercel AI SDK works perfectly  
✅ Can use `generateText` and `streamText`  
✅ All features work correctly

### For Example 4 (With Tools)
❌ Vercel AI SDK is BROKEN  
✅ OpenAI SDK works correctly  
🔧 MUST use OpenAI SDK for tool calling

---

## Attempted Solutions (All Failed)

1. ❌ Using `generateText` instead of `streamText`
2. ❌ Using `streamText` instead of `generateText`
3. ❌ Using zod schemas
4. ❌ Using plain JSON schemas
5. ❌ Using `compatibility: "strict"` mode
6. ❌ Using `compatibility: "compatible"` mode
7. ❌ Different parameter structures
8. ❌ Different model names
9. ❌ Using `@ai-sdk/openai` provider (incompatible API)
10. ❌ More explicit prompts

---

## Workaround

Since the tool IS being called (just with empty arguments), a HACK would be to hardcode the command:

```javascript
execute: async (args) => {
  // HACK: args.command is always undefined due to SDK bug
  const command = args.command || 'node --version';  // fallback
  // execute command...
}
```

But this defeats the purpose of tool calling.

---

## Recommendation

### Current State: MUST Keep Both SDKs

**Vercel AI SDK:**
- ✅ Use for examples 1-3 (no tools)
- ✅ Cleaner API
- ✅ Better abstractions
- ❌ Broken for tool calling

**OpenAI SDK:**
- ❌ More verbose
- ❌ Manual message loop
- ✅ Tool calling works correctly
- ✅ Required for example 4

### Dependency List

```json
{
  "dependencies": {
    "@ai-sdk/openai-compatible": "^1.0.19",  // For examples 1-3
    "ai": "^5.0.60",                          // For examples 1-3
    "openai": "^6.1.0",                       // For example 4 (tools)
    "js-yaml": "^4.1.0",                      // lib/session.js
    "open": "^10.1.0",                        // lib/session.js
    "readline": "^1.3.0",                     // index.js
    "zod": "^4.1.11"                          // Example 4 (optional)
  }
}
```

### Can NOT Remove:
- ❌ `openai` - Required for working tool calls
- ✅ `@ai-sdk/openai` - Already not used, can remove
- ✅ `zod` - Optional, only used if you want typed parameters

---

## Future Options

### Option 1: Wait for Bug Fix
- Monitor `@ai-sdk/openai-compatible` for updates
- Test with newer versions when available
- Switch example 4 to Vercel AI SDK when fixed

### Option 2: Report the Bug
- File issue with Vercel AI SDK team
- Provide reproduction case
- Link to this investigation

### Option 3: Accept Mixed SDKs
- Use Vercel AI SDK for non-tool examples
- Use OpenAI SDK for tool examples
- Keep both dependencies

---

## Test Files Created

All test files are in `examples/`:

1. `4-tools-openai.js` - Working OpenAI SDK version ✅
2. `4-tools-openai-params.js` - OpenAI SDK parameter debugging ✅
3. `4-tools-vercel.js` - Broken Vercel AI SDK version ❌
4. `4-tools-vercel-debug.js` - Detailed debugging ❌
5. `4-tools-stream.js` - streamText attempt ❌
6. `4-tools-params.js` - Parameter debugging ❌
7. `4-tools-nozod.js` - Without zod attempt ❌
8. `4-tools-compat.js` - Compatibility mode testing ❌
9. `4-tools-openai-provider.js` - @ai-sdk/openai attempt ❌
10. `4-tools-raw-inspect.js` - Raw API inspection attempt

---

## Conclusion

**The Vercel AI SDK `@ai-sdk/openai-compatible` provider has a bug that prevents tool arguments from being passed correctly when calling tools.**

Until this is fixed, we MUST use the OpenAI SDK for any tool-calling functionality.

**Final Answer:** We CANNOT use only Vercel AI SDK. We must keep both SDKs.
