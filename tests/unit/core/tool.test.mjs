import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { _G } from '../../../src/lib/globals.mjs';
import * as fs from 'fs/promises';
import path from 'path';
import os from 'os';

// Import Tool after setup to avoid plugin loading issues
let Tool;

describe('Tool', () => {
  let testDir;
  let originalTools;
  let originalCliFlags;
  let originalFsmState;
  let originalSignalHandler;

  beforeEach(async () => {
    // Import Tool lazily to ensure _G is set up first
    if (!Tool) {
      const toolModule = await import('../../../src/lib/tool.mjs');
      Tool = toolModule.Tool;
    }
    
    // Create temporary test directory
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'daemon-tool-test-'));
    
    // Store original state
    originalTools = { ..._G.tools };
    originalCliFlags = _G.cliFlags;
    originalFsmState = _G.fsmState;
    originalSignalHandler = _G.signalHandler;
    
    // Reset state
    _G.cliFlags = {};
    _G.fsmState = 'normal';
    _G.signalHandler = {
      interruptRequested: false,
      abortRequested: false,
      currentSessionId: null,
      currentToolCallId: null
    };
    
    // Register test tools
    _G.tools = {};
    
    // Simple test tool without approval
    _G.tools.test_simple = {
      definition: {
        type: 'function',
        function: {
          name: 'test_simple',
          description: 'A simple test tool',
          parameters: {
            type: 'object',
            properties: {
              message: {
                type: 'string',
                description: 'Test message'
              }
            },
            required: ['message']
          }
        }
      },
      metadata: {},
      execute: async (args) => {
        return {
          content: `Received: ${args.message}`,
          success: true
        };
      }
    };
    
    // Tool requiring human approval
    _G.tools.test_approval = {
      definition: {
        type: 'function',
        function: {
          name: 'test_approval',
          description: 'A tool requiring approval',
          parameters: {
            type: 'object',
            properties: {
              action: {
                type: 'string',
                description: 'Action to perform'
              }
            },
            required: ['action']
          }
        }
      },
      metadata: {
        requiresHumanApproval: true
      },
      execute: async (args) => {
        return {
          content: `Executed: ${args.action}`,
          success: true
        };
      }
    };
    
    // Tool with preToolUse hook
    _G.tools.test_hook = {
      definition: {
        type: 'function',
        function: {
          name: 'test_hook',
          description: 'A tool with preToolUse hook',
          parameters: {
            type: 'object',
            properties: {
              value: {
                type: 'string',
                description: 'Test value'
              }
            },
            required: ['value']
          }
        }
      },
      metadata: {
        preToolUse: async (args) => {
          if (args.value === 'deny') return 'deny';
          if (args.value === 'approve') return 'approve';
          return 'allow';
        }
      },
      execute: async (args) => {
        return {
          content: `Processed: ${args.value}`,
          success: true
        };
      }
    };
    
    // Tool that returns error
    _G.tools.test_error = {
      definition: {
        type: 'function',
        function: {
          name: 'test_error',
          description: 'A tool that throws errors',
          parameters: {
            type: 'object',
            properties: {},
            required: []
          }
        }
      },
      metadata: {},
      execute: async () => {
        throw new Error('Test error');
      }
    };
  });

  afterEach(async () => {
    // Restore original state
    _G.tools = originalTools;
    _G.cliFlags = originalCliFlags;
    _G.fsmState = originalFsmState;
    _G.signalHandler = originalSignalHandler;
    
    // Clean up test directory
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('tool execution', () => {
    test('executes simple tool without approval', async () => {
      const result = await Tool.execute('test_simple', { message: 'hello' });
      
      expect(result).toBeDefined();
      expect(result.content).toBe('Received: hello');
      expect(result.success).toBe(true);
    });

    test('rejects execution for unknown tool', async () => {
      await expect(Tool.execute('unknown_tool', {})).rejects.toThrow();
    });

    test('validates required fields', async () => {
      const result = await Tool.execute('test_simple', {});
      
      expect(result).toBeDefined();
      expect(result.success).toBe(false);
      expect(result.content).toContain('Required field');
      expect(result.metadata.validation_error).toBe(true);
    });

    test('handles tool execution errors gracefully', async () => {
      const result = await Tool.execute('test_error', {});
      
      expect(result).toBeDefined();
      expect(result.success).toBe(false);
      expect(result.content).toContain('Tool execution error');
      expect(result.metadata.error).toBe('Test error');
    });

    test('sets session context when provided', async () => {
      const result = await Tool.execute('test_simple', { message: 'test' }, 123);
      
      expect(result).toBeDefined();
      expect(_G.currentSessionId).toBe(123);
    });
  });

  describe('human approval workflow', () => {
    test('auto-rejects in --no-humans mode', async () => {
      _G.cliFlags.noHumans = true;
      
      const result = await Tool.execute('test_approval', { action: 'test' });
      
      expect(result).toBeDefined();
      expect(result.success).toBe(false);
      expect(result.metadata.rejected).toBe(true);
      expect(result.metadata.reason).toBe('auto_rejection_no_humans');
    });

    test('uses preToolUse hook for deny decision', async () => {
      const result = await Tool.execute('test_hook', { value: 'deny' });
      
      expect(result).toBeDefined();
      expect(result.success).toBe(false);
      expect(result.content).toContain('denied by security policy');
      expect(result.metadata.denied).toBe(true);
    });

    test('uses preToolUse hook for allow decision', async () => {
      const result = await Tool.execute('test_hook', { value: 'allow' });
      
      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(result.content).toBe('Processed: allow');
    });

    // Note: Interactive approval tests would require mocking readline
    // which is complex. We test the non-interactive paths here.
  });

  describe('field validation', () => {
    test('validates required fields are present', () => {
      const toolDef = {
        parameters: {
          required: ['field1', 'field2'],
          properties: {
            field1: { type: 'string' },
            field2: { type: 'string' }
          }
        }
      };
      
      const result = Tool.validateRequiredFields(
        { field1: 'value1', field2: 'value2' },
        toolDef
      );
      
      expect(result.success).toBe(true);
    });

    test('detects missing required fields', () => {
      const toolDef = {
        parameters: {
          required: ['field1'],
          properties: {
            field1: { type: 'string' }
          }
        }
      };
      
      const result = Tool.validateRequiredFields({}, toolDef);
      
      expect(result.success).toBe(false);
      expect(result.field).toBe('field1');
      expect(result.error).toContain('missing or null');
    });

    test('detects null required fields', () => {
      const toolDef = {
        parameters: {
          required: ['field1'],
          properties: {
            field1: { type: 'string' }
          }
        }
      };
      
      const result = Tool.validateRequiredFields({ field1: null }, toolDef);
      
      expect(result.success).toBe(false);
      expect(result.field).toBe('field1');
    });

    test('detects empty string fields', () => {
      const toolDef = {
        parameters: {
          required: ['field1'],
          properties: {
            field1: { type: 'string' }
          }
        }
      };
      
      const result = Tool.validateRequiredFields({ field1: '' }, toolDef);
      
      expect(result.success).toBe(false);
      expect(result.field).toBe('field1');
      expect(result.error).toContain('empty or contains only whitespace');
    });

    test('detects whitespace-only string fields', () => {
      const toolDef = {
        parameters: {
          required: ['field1'],
          properties: {
            field1: { type: 'string' }
          }
        }
      };
      
      const result = Tool.validateRequiredFields({ field1: '   ' }, toolDef);
      
      expect(result.success).toBe(false);
      expect(result.field).toBe('field1');
    });

    test('allows non-string fields with value 0', () => {
      const toolDef = {
        parameters: {
          required: ['field1'],
          properties: {
            field1: { type: 'number' }
          }
        }
      };
      
      const result = Tool.validateRequiredFields({ field1: 0 }, toolDef);
      
      expect(result.success).toBe(true);
    });
  });

  describe('API compatibility', () => {
    test('prepares tools for API by stripping metadata', () => {
      const tools = [_G.tools.test_simple, _G.tools.test_approval];
      const prepared = Tool.prepareToolsForAPI(tools);
      
      expect(prepared).toBeDefined();
      expect(Array.isArray(prepared)).toBe(true);
      expect(prepared.length).toBe(2);
      
      // Should only have 'type' and 'function' fields
      expect(prepared[0].type).toBe('function');
      expect(prepared[0].function).toBeDefined();
      expect(prepared[0].metadata).toBeUndefined();
    });

    test('ensures all tools have parameters field', () => {
      const toolWithoutParams = {
        definition: {
          type: 'function',
          function: {
            name: 'no_params',
            description: 'Tool without parameters'
          }
        }
      };
      
      const prepared = Tool.prepareToolsForAPI([toolWithoutParams]);
      
      expect(prepared[0].function.parameters).toBeDefined();
      expect(prepared[0].function.parameters.type).toBe('object');
      expect(prepared[0].function.parameters.properties).toEqual({});
      expect(prepared[0].function.parameters.required).toEqual([]);
    });

    test('preserves existing parameters', () => {
      const prepared = Tool.prepareToolsForAPI([_G.tools.test_simple]);
      
      expect(prepared[0].function.parameters.type).toBe('object');
      expect(prepared[0].function.parameters.properties.message).toBeDefined();
      expect(prepared[0].function.parameters.required).toContain('message');
    });
  });

  describe('pending tool calls processing', () => {
    test('returns false for empty messages', async () => {
      const sessionContent = { spec: { messages: [] } };
      const result = await Tool.processPendingCalls(sessionContent);
      
      expect(result).toBe(false);
    });

    test('returns false when no spec.messages', async () => {
      const sessionContent = { spec: {} };
      const result = await Tool.processPendingCalls(sessionContent);
      
      expect(result).toBe(false);
    });

    test('processes tool calls without results', async () => {
      const sessionContent = {
        spec: {
          messages: [
            {
              role: 'assistant',
              tool_calls: [
                {
                  id: 'call_123',
                  type: 'function',
                  function: {
                    name: 'test_simple',
                    arguments: JSON.stringify({ message: 'test' })
                  }
                }
              ]
            }
          ]
        }
      };
      
      const result = await Tool.processPendingCalls(sessionContent, 'test-session');
      
      expect(result).toBe(true);
      expect(sessionContent.spec.messages.length).toBe(2);
      expect(sessionContent.spec.messages[1].role).toBe('tool');
      expect(sessionContent.spec.messages[1].tool_call_id).toBe('call_123');
    });

    test('skips tool calls that already have results', async () => {
      const sessionContent = {
        spec: {
          messages: [
            {
              role: 'assistant',
              tool_calls: [
                {
                  id: 'call_123',
                  type: 'function',
                  function: {
                    name: 'test_simple',
                    arguments: JSON.stringify({ message: 'test' })
                  }
                }
              ]
            },
            {
              role: 'tool',
              tool_call_id: 'call_123',
              content: 'Already executed'
            }
          ]
        }
      };
      
      const result = await Tool.processPendingCalls(sessionContent, 'test-session');
      
      expect(result).toBe(false);
      expect(sessionContent.spec.messages.length).toBe(2);
    });

    test('handles tool execution errors in pending calls', async () => {
      const sessionContent = {
        spec: {
          messages: [
            {
              role: 'assistant',
              tool_calls: [
                {
                  id: 'call_error',
                  type: 'function',
                  function: {
                    name: 'test_error',
                    arguments: '{}'
                  }
                }
              ]
            }
          ]
        }
      };
      
      const result = await Tool.processPendingCalls(sessionContent, 'test-session');
      
      expect(result).toBe(true);
      expect(sessionContent.spec.messages.length).toBe(2);
      expect(sessionContent.spec.messages[1].role).toBe('tool');
      
      const content = JSON.parse(sessionContent.spec.messages[1].content);
      expect(content.success).toBe(false);
      expect(content.error).toBe('Test error');
    });

    test('handles abort during tool execution', async () => {
      _G.signalHandler.abortRequested = false;
      
      // Create a tool that sets abort flag
      _G.tools.test_abort = {
        definition: {
          type: 'function',
          function: {
            name: 'test_abort',
            description: 'Tool that triggers abort',
            parameters: {
              type: 'object',
              properties: {},
              required: []
            }
          }
        },
        metadata: {},
        execute: async () => {
          _G.signalHandler.abortRequested = true;
          return { content: 'Should be aborted', success: true };
        }
      };
      
      const sessionContent = {
        spec: {
          messages: [
            {
              role: 'assistant',
              tool_calls: [
                {
                  id: 'call_abort',
                  type: 'function',
                  function: {
                    name: 'test_abort',
                    arguments: '{}'
                  }
                }
              ]
            }
          ]
        }
      };
      
      const result = await Tool.processPendingCalls(sessionContent, 'test-session');
      
      expect(result).toBe(true);
      expect(sessionContent.spec.messages.length).toBe(2);
      expect(sessionContent.spec.messages[1].content).toContain('aborted by user');
      expect(_G.signalHandler.abortRequested).toBe(false); // Reset after abort
    });
  });

  describe('FSM state management', () => {
    test('sets FSM state during tool execution', async () => {
      const sessionContent = {
        spec: {
          messages: [
            {
              role: 'assistant',
              tool_calls: [
                {
                  id: 'call_fsm',
                  type: 'function',
                  function: {
                    name: 'test_simple',
                    arguments: JSON.stringify({ message: 'fsm test' })
                  }
                }
              ]
            }
          ]
        }
      };
      
      // Verify initial state
      expect(_G.fsmState).toBe('normal');
      
      await Tool.processPendingCalls(sessionContent, 'test-session');
      
      // FSM state should be reset to normal after execution
      expect(_G.fsmState).toBe('normal');
    });
  });
});
