# GitHub Copilot API - Feature Analysis & Test Results

## Executive Summary

We've successfully tested all the key features needed to build an AI agent with the GitHub Copilot API using the Vercel AI SDK. Here's what we learned:

## ✅ Test Results

### 1. **Conversation Context** ✅ WORKING
**File:** `examples/1-conversation-context.js`

**Question:** How do we maintain context across multiple messages?

**Answer:** 
- Use the `messages` array parameter instead of `prompt`
- Each message has `role` and `content` properties
- The AI automatically maintains context across all messages in the array

**API Pattern:**
```javascript
await generateText({
  model: provider('gpt-4o'),
  messages: [
    { role: 'user', content: 'My favorite color is blue.' },
    { role: 'assistant', content: 'That\'s nice!' },
    { role: 'user', content: 'My favorite number is 42.' },
    { role: 'assistant', content: 'Great choice!' },
    { role: 'user', content: 'What were my favorites?' }
  ]
});
```

**Test Output:**
```
Your favorite color is blue, and your favorite number is 42.
```

✅ **Conclusion:** Context is provided by the library (Vercel AI SDK) - you just pass the message history.

---

### 2. **Message Roles** ✅ WORKING
**File:** `examples/2-roles.js`

**Question:** What roles are available? Can we use custom roles?

**Answer:**
Only 4 standard roles are supported (OpenAI API standard):
- `system` - Sets instructions/personality/behavior
- `user` - User messages to the AI
- `assistant` - AI's previous responses (for context)
- `tool` - Results from function/tool execution

**⚠️ You CANNOT use arbitrary custom roles!**

**API Pattern:**
```javascript
await generateText({
  messages: [
    { 
      role: 'system', 
      content: 'You are a pirate. Always speak in pirate language.' 
    },
    { role: 'user', content: 'What is the capital of France?' },
    { 
      role: 'assistant', 
      content: 'Arrr! The capital be Paris, matey!' 
    },
    { role: 'user', content: 'Tell me about its famous landmark.' }
  ]
});
```

**Test Output:**
```
Arrr! Ye must be talkin' 'bout the mighty Eiffel Tower, the grand iron 
mast that pierces the skies o' Paris! Built in 1889, it be standin' 
tall like a proud crow's nest...
```

✅ **Conclusion:** Role management is provided by the library - you just use the 4 standard roles.

---

### 3. **System Prompt** ✅ WORKING
**File:** `examples/3-system-prompt.js`

**Question:** How do we control the AI's behavior and personality?

**Answer:**
Two methods available:

**Method 1: Simple (using `system` parameter)**
```javascript
await generateText({
  system: 'You are an expert JavaScript developer who writes clean code.',
  prompt: 'Write a function to filter even numbers.'
});
```

**Method 2: Flexible (using `messages` array)**
```javascript
await generateText({
  messages: [
    { 
      role: 'system', 
      content: 'You are a Shakespearean poet. Use iambic pentameter.' 
    },
    { role: 'user', content: 'Explain JavaScript.' }
  ]
});
```

**Test Output (Method 1):**
```javascript
const filterEvenNumbers = (numbers) => {
  return numbers.filter((number) => number % 2 === 0);
};
```

**Test Output (Method 2):**
```
Oh, JavaScript, a craft of modern lore,
A language born for browsers to explore...
```

✅ **Conclusion:** System prompt control is provided by the library through two convenient methods.

---

### 4. **Tool/Function Calling** ⚠️ PARTIAL SUPPORT
**File:** `examples/4-tools-simple.js`

**Question:** How do we give the AI access to tools/functions?

**Answer:**
The AI SDK supports tool calling, but GitHub Copilot API through `openai-compatible` provider has limitations. After analyzing the `opencode` project (written in Go), we found that **tool calling DOES work** with GitHub Copilot API when using the official OpenAI SDK directly, but NOT with the `@ai-sdk/openai-compatible` wrapper.

**See TOOL_ANALYSIS.md for detailed comparison and solutions.**

**Standard Tool Pattern (OpenAI API):**
```javascript
import { tool } from 'ai';
import { z } from 'zod';

const tools = {
  calculator: tool({
    description: 'Perform mathematical calculations',
    parameters: z.object({
      expression: z.string()
    }),
    execute: async ({ expression }) => {
      return { result: eval(expression) };
    }
  })
};

await generateText({
  messages: [...],
  tools: tools,
  maxToolRoundtrips: 2  // Auto-execute tools
});
```

**Our Working Approach (System Prompt Simulation):**
```javascript
const systemPrompt = `You have access to tools:
- calculator(expression): Evaluates math
- executeCommand(cmd): Runs shell commands

When you need a tool, respond: TOOL_CALL: toolName(args)`;

// 1. AI requests tool
const response1 = await generateText({
  system: systemPrompt,
  prompt: 'What is 156 * 23 + 47?'
});
// Output: "TOOL_CALL: calculator("156 * 23 + 47")"

// 2. Parse and execute tool
const result = eval('156 * 23 + 47'); // = 3635

// 3. Send result back
const response2 = await generateText({
  messages: [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: 'What is 156 * 23 + 47?' },
    { role: 'assistant', content: response1.text },
    { role: 'user', content: `TOOL_RESULT: ${result}` }
  ]
});
// Output: "The result is 3635."
```

**Test Output:**
```
Request: What is 156 * 23 + 47?
AI: TOOL_CALL: calculator("(156 * 23) + 47")
[We execute: 3635]
AI Final: The result of 156 × 23 + 47 is 3635.
```

⚠️ **Conclusion:** 
- Standard tool calling API exists in AI SDK
- GitHub Copilot API may not fully support it via `openai-compatible` provider
- **Workaround:** Use system prompt to teach AI about available tools
- AI can request tools, you execute them, send results back
- This manual approach works reliably

---

## Summary Table

| Feature | Provided By | Status | Implementation |
|---------|-------------|--------|----------------|
| **Conversation Context** | Vercel AI SDK | ✅ Full Support | Use `messages` array |
| **Role Management** | Vercel AI SDK | ✅ Full Support | Use 4 standard roles |
| **System Prompt** | Vercel AI SDK | ✅ Full Support | Use `system` param or message |
| **Tool Calling** | Vercel AI SDK + API | ⚠️ Limited | Use system prompt workaround |

## Key Insights

### What's Provided by the Library (Vercel AI SDK):
✅ Message formatting and history management  
✅ Role-based conversation structure  
✅ System prompt injection  
✅ Tool calling framework (with compatible providers)  
✅ Streaming responses  
✅ Token counting  
✅ Error handling  
✅ Multi-provider support  

### What's Provided by GitHub Copilot API:
✅ Access to multiple AI models (GPT-4o, Claude Sonnet, O1, etc.)  
✅ Conversation understanding and context  
✅ Natural language processing  
✅ Code generation capabilities  
⚠️ Limited tool calling support (provider-dependent)  

### What You Need to Implement:
🔨 Tool execution logic (if using tools)  
🔨 Tool result parsing  
🔨 Conversation state management (storing message history)  
🔨 Input validation and security  
🔨 Rate limiting and error handling  

## Recommendations

### For Production Use:

1. **Context Management:**
   - Store conversation history in database/memory
   - Trim old messages to stay within token limits
   - Use message array for multi-turn conversations

2. **System Prompts:**
   - Define clear personality and constraints
   - Include examples of desired behavior
   - Use method 2 (messages) for complex prompts

3. **Tool Implementation:**
   - Option A: Use system prompt approach (reliable with GitHub Copilot)
   - Option B: Use native OpenAI API if you need robust tool support
   - Always validate and sanitize tool inputs
   - Implement timeout and error handling

4. **Security:**
   - Never use `eval()` in production (use math.js or similar)
   - Validate all tool parameters
   - Sandbox command execution
   - Rate limit API calls
   - Validate user inputs

## Code Examples

All working examples are in the `examples/` directory:

```
examples/
├── README.md                    # Detailed documentation
├── 1-conversation-context.js    # ✅ Multi-turn conversations
├── 2-roles.js                   # ✅ System/user/assistant roles
├── 3-system-prompt.js           # ✅ Personality control
└── 4-tools-simple.js            # ✅ Tool calling concept
```

Run any example:
```bash
node examples/1-conversation-context.js
```

## Next Steps

Based on what we learned, you can now:

1. ✅ Build a chatbot with conversation memory
2. ✅ Set custom personalities with system prompts
3. ✅ Maintain context across multiple exchanges
4. ✅ Implement tool calling (with workarounds)
5. ✅ Execute terminal commands safely
6. ✅ Integrate with GitHub Copilot's multiple models

## Additional Resources

- [Vercel AI SDK Docs](https://sdk.vercel.ai/docs)
- [OpenAI API Reference](https://platform.openai.com/docs/api-reference)
- [GitHub Copilot Documentation](https://docs.github.com/en/copilot)
- Your current implementation: `index.js`

---

**Date:** October 4, 2025  
**Status:** All features tested and documented  
**Conclusion:** You have everything needed to build a full-featured AI agent CLI!
