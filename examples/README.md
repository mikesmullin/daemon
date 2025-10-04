# GitHub Copilot API Examples

This directory contains examples demonstrating key features of the AI SDK and GitHub Copilot API.

## Prerequisites

1. Run the main authentication script first to get tokens:
   ```bash
   node index.js --prompt "test"
   ```

2. This will create `.tokens.yaml` which these examples use.

## Examples

### 1. Conversation Context (`1-conversation-context.js`)

**What it demonstrates:**
- How to maintain context across multiple messages
- Using the `messages` array instead of simple `prompt`
- The AI can reference previous messages in the conversation

**Run it:**
```bash
node examples/1-conversation-context.js
```

**Key API pattern:**
```javascript
await generateText({
  model: provider('gpt-4o'),
  messages: [
    { role: 'user', content: 'My favorite color is blue.' },
    { role: 'assistant', content: 'That\'s nice!' },
    { role: 'user', content: 'What was my favorite color?' }
  ]
});
```

### 2. Message Roles (`2-roles.js`)

**What it demonstrates:**
- The four standard message roles: `system`, `user`, `assistant`, `tool`
- How to use the `system` role to set AI behavior/personality
- You cannot use arbitrary/custom roles

**Run it:**
```bash
node examples/2-roles.js
```

**Key takeaway:**
- `system`: Sets instructions/personality
- `user`: Your messages
- `assistant`: AI's previous responses
- `tool`: Function/tool execution results

### 3. System Prompt (`3-system-prompt.js`)

**What it demonstrates:**
- Two ways to set system instructions
- Using system prompts to control AI behavior, tone, and expertise
- Combining system prompts with conversation history

**Run it:**
```bash
node examples/3-system-prompt.js
```

**Key API patterns:**
```javascript
// Method 1: Simple
await generateText({
  system: 'You are an expert JavaScript developer.',
  prompt: 'Write a function...'
});

// Method 2: Flexible
await generateText({
  messages: [
    { role: 'system', content: 'You are...' },
    { role: 'user', content: '...' }
  ]
});
```

### 4. Tool/Function Calling (`4-tools.js`)

**What it demonstrates:**
- How to define tools the AI can call
- Tool execution (weather API, calculator, terminal commands)
- Automatic tool execution with `maxToolRoundtrips`
- JSON Schema for tool parameters

**Run it:**
```bash
node examples/4-tools.js
```

**Key API pattern:**
```javascript
const tools = {
  myTool: {
    description: 'What this tool does',
    parameters: {
      type: 'object',
      properties: {
        param1: { type: 'string', description: '...' }
      },
      required: ['param1']
    },
    execute: async ({ param1 }) => {
      // Your implementation
      return { result: 'something' };
    }
  }
};

await generateText({
  messages: [...],
  tools: tools,
  maxToolRoundtrips: 2 // AI can call tools automatically
});
```

## Summary of Answers

### Q1: How do we control context?
**Answer:** Use the `messages` array instead of `prompt`. The AI SDK maintains context automatically when you include the full conversation history in the `messages` array.

### Q2: How do we control roles?
**Answer:** Use the `role` property in each message. Only 4 roles are supported:
- `system` - Instructions/personality
- `user` - User messages
- `assistant` - AI responses
- `tool` - Tool execution results

You **cannot** use arbitrary custom roles.

### Q3: How do we control the system prompt?
**Answer:** Two ways:
1. Use the `system` parameter in `generateText()`
2. Use a message with `role: 'system'` in the `messages` array

### Q4: How do we implement tool execution?
**Answer:** Define tools with:
- `description` - What the tool does
- `parameters` - JSON Schema for parameters
- `execute` - Async function that runs the tool

Pass tools to `generateText()` and set `maxToolRoundtrips` to allow automatic execution.

## API Features Provided by Vercel AI SDK

✅ **Provided by the library:**
- Message formatting and role management
- Tool/function calling schema and execution
- Streaming responses
- Token counting
- Error handling
- Multi-model support

✅ **Provided by GitHub Copilot API:**
- Multiple AI models (GPT-4o, Claude, O1, etc.)
- Conversation understanding
- Tool execution capabilities
- Context window management

## Further Reading

- [Vercel AI SDK Documentation](https://sdk.vercel.ai/docs)
- [OpenAI Function Calling](https://platform.openai.com/docs/guides/function-calling)
- [GitHub Copilot API](https://docs.github.com/en/copilot)
