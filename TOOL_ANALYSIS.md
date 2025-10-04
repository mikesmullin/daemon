# Tool Calling Analysis: opencode vs Our Implementation

## Summary

After examining the `tmp/opencode` (Go) project, I found they **DO** have tool calling working with GitHub Copilot API, but they're using a different approach than us.

## Key Differences

### What opencode Uses:
- **SDK**: Official `openai-go` SDK from OpenAI
- **Package**: `github.com/openai/openai-go`
- **Provider**: Direct GitHub Copilot API integration
- **Result**: ✅ Tool calling works perfectly

### What We Use:
- **SDK**: Vercel AI SDK
- **Package**: `@ai-sdk/openai-compatible`
- **Provider**: Generic OpenAI-compatible wrapper
- **Result**: ⚠️ Tool calling not working (tools not being called)

## How opencode Implements Tools

### 1. Tool Definition (from `internal/llm/tools/tools.go`)

```go
type ToolInfo struct {
    Name        string
    Description string
    Parameters  map[string]any
    Required    []string
}

type BaseTool interface {
    Info() ToolInfo
    Run(ctx context.Context, params ToolCall) (ToolResponse, error)
}
```

### 2. Tool Conversion (from `internal/llm/provider/copilot.go`)

```go
func (c *copilotClient) convertTools(tools []toolsPkg.BaseTool) []openai.ChatCompletionToolParam {
    copilotTools := make([]openai.ChatCompletionToolParam, len(tools))

    for i, tool := range tools {
        info := tool.Info()
        copilotTools[i] = openai.ChatCompletionToolParam{
            Function: openai.FunctionDefinitionParam{
                Name:        info.Name,
                Description: openai.String(info.Description),
                Parameters: openai.FunctionParameters{
                    "type":       "object",
                    "properties": info.Parameters,
                    "required":   info.Required,
                },
            },
        }
    }

    return copilotTools
}
```

### 3. Message Handling with Tool Calls

```go
case message.Assistant:
    assistantMsg := openai.ChatCompletionAssistantMessageParam{
        Role: "assistant",
    }

    if len(msg.ToolCalls()) > 0 {
        assistantMsg.ToolCalls = make([]openai.ChatCompletionMessageToolCallParam, len(msg.ToolCalls()))
        for i, call := range msg.ToolCalls() {
            assistantMsg.ToolCalls[i] = openai.ChatCompletionMessageToolCallParam{
                ID:   call.ID,
                Type: "function",
                Function: openai.ChatCompletionMessageToolCallFunctionParam{
                    Name:      call.Name,
                    Arguments: call.Input,
                },
            }
        }
    }

case message.Tool:
    for _, result := range msg.ToolResults() {
        copilotMessages = append(copilotMessages,
            openai.ToolMessage(result.Content, result.ToolCallID),
        )
    }
```

### 4. API Request

```go
params := openai.ChatCompletionNewParams{
    Model:    openai.ChatModel(c.providerOptions.model.APIModel),
    Messages: messages,
    Tools:    tools,  // Tools are passed here
}

copilotResponse, err := c.client.Chat.Completions.New(ctx, params)
```

### 5. Tool Response Handling

```go
toolCalls := c.toolCalls(*copilotResponse)
finishReason := c.finishReason(string(copilotResponse.Choices[0].FinishReason))

if len(toolCalls) > 0 {
    finishReason = message.FinishReasonToolUse
}
```

## Example Tools in opencode

The project has many working tools in `internal/llm/tools/`:

1. **bash.go** - Execute bash commands
2. **edit.go** - Edit files
3. **file.go** - Read/write files
4. **grep.go** - Search in files
5. **ls.go** - List directory contents
6. **diagnostics.go** - Code diagnostics
7. **shell/** - Shell command execution

All using the standard OpenAI function calling format.

## Why Our Implementation Doesn't Work

### The Problem

The `@ai-sdk/openai-compatible` provider from Vercel AI SDK appears to have issues with:
1. Converting Zod schemas to the format GitHub Copilot expects
2. Properly sending tool definitions to the API
3. Parsing tool call responses

### Evidence

From our debug output:
```
finishReason: "tool-calls"
toolCalls: []
```

The API is saying "I finished because I want to call tools" but no actual tool calls are being returned. This suggests a mismatch in the provider implementation.

## Solutions

### Option 1: Use Native OpenAI SDK (Recommended for Production)

Switch from Vercel AI SDK to the official OpenAI SDK:

```javascript
import OpenAI from 'openai';

const client = new OpenAI({
  apiKey: tokens.copilot_token,
  baseURL: 'https://api.githubcopilot.com',
  defaultHeaders: {
    'Editor-Version': 'vscode/1.99.3',
    'Editor-Plugin-Version': 'copilot-chat/0.26.7',
  }
});

const response = await client.chat.completions.create({
  model: 'claude-sonnet-4',
  messages: [...],
  tools: [
    {
      type: 'function',
      function: {
        name: 'calculator',
        description: 'Perform mathematical calculations',
        parameters: {
          type: 'object',
          properties: {
            expression: {
              type: 'string',
              description: 'Mathematical expression'
            }
          },
          required: ['expression']
        }
      }
    }
  ]
});

// Handle tool calls
if (response.choices[0].finish_reason === 'tool_calls') {
  for (const toolCall of response.choices[0].message.tool_calls) {
    // Execute tool
    const result = await executeTool(toolCall.function.name, 
                                     JSON.parse(toolCall.function.arguments));
    
    // Send result back
    // ... continue conversation with tool results
  }
}
```

### Option 2: System Prompt Workaround (Current Working Solution)

Continue using the system prompt approach we demonstrated in `4-tools-simple.js`:
- Define tools in system prompt
- AI responds with tool request in text
- Parse the request manually
- Execute tools
- Send results back

This works reliably but requires more manual handling.

### Option 3: Wait for Provider Fix

The `@ai-sdk/openai-compatible` provider may get updated to properly support GitHub Copilot's tool calling. Keep an eye on:
- https://github.com/vercel/ai
- https://github.com/vercel/ai/issues

## Recommendations

1. **For Learning/Experimentation**: Use the system prompt workaround (Option 2)
2. **For Production**: Use native OpenAI SDK (Option 1)
3. **For Full Features**: Consider the native SDK from the start

## Next Steps

If you want native tool calling working, I can:
1. Create an example using the official `openai` npm package
2. Show the conversion from Vercel AI SDK to OpenAI SDK
3. Implement a working tool execution loop

Let me know which direction you'd like to go!
