import { _G } from './globals.mjs';
import utils, { log } from './utils.mjs';
import color from './colors.mjs';
import readline from 'readline';
import * as observability from './observability.mjs';

/**
 * Tool Management Class
 * 
 * Handles tool execution, human approval workflows, and API compatibility.
 * Provides a secure and consistent interface for all tool operations.
 */
export class Tool {

  // =============================================================================
  // MAIN TOOL EXECUTION
  // =============================================================================

  /**
   * Main tool execution entry point with approval workflow
   * 
   * @param {string} name - Tool name (key in _G.tools)
   * @param {Object} args - Tool arguments from Copilot
   * @param {string} sessionId - Session ID for context
   * @returns {Object} Rich result object { content, metadata, success }
   */
  static async execute(name, args, sessionId) {
    const tool = _G.tools[name];
    utils.assert(tool, `Unknown tool: ${name}`);

    // Validate required fields before any processing
    const validation = Tool.validateRequiredFields(args, tool.definition.function);
    if (!validation.success) {
      return {
        content: validation.error,
        metadata: { validation_error: true, missing_field: validation.field },
        success: false
      };
    }

    try {
      // Set session context if available
      if (sessionId !== undefined) {
        _G.currentSessionId = sessionId;
      }

      // 1. Run preToolUse hook if it exists
      if (tool.metadata?.preToolUse) {
        const decision = await tool.metadata.preToolUse(args, { sessionId });

        if (decision === 'deny') {
          return {
            content: "Tool execution denied by security policy",
            metadata: { denied: true, reason: 'security_policy' },
            success: false
          };
        }

        if (decision === 'approve') {
          const approval = await Tool.askHuman(name, args, sessionId);

          if (approval.action === 'rejected') {
            // Use custom message if auto-rejected (--no-humans mode)
            const message = approval.autoRejected && approval.message
              ? approval.message
              : "The user refused to run the tool. You may try alternatives, or ask them to explain.";

            return {
              content: message,
              metadata: {
                rejected: true,
                reason: approval.autoRejected ? 'auto_rejection_no_humans' : 'user_rejection'
              },
              success: false
            };
          }

          if (approval.action === 'modified') {
            return {
              content: `The user refused to run the tool. Try this instead: ${approval.prompt}`,
              metadata: { modified: true, user_prompt: approval.prompt },
              success: false
            };
          }

          if (approval.action === 'approved') {
            // User approved, continue to execution (logging handled by askHuman)
          } else {
            // Unknown approval action, treat as rejection for safety
            console.log(color.red(`❌ Unknown approval action: ${approval.action}`));
            return {
              content: "Unknown approval response. Tool execution cancelled for safety.",
              metadata: { error: 'unknown_approval_action', action: approval.action },
              success: false
            };
          }
        }

        // If 'allow' or approved, proceed to execution
      }

      // 2. Execute the tool
      const result = await tool.execute(args, { sessionId });
      
      // Emit tool response event
      if (sessionId) {
        const session = await import('./session.mjs').then(m => m.Session.load(sessionId)).catch(() => null);
        observability.emitToolResponse(
          sessionId,
          session?.metadata?.name || 'unknown',
          name,
          result.content,
          result.success !== false
        );
      }
      
      return result;

    } catch (error) {
      return {
        content: `Tool execution error: ${error.message}`,
        metadata: { error: error.message },
        success: false
      };
    }
  }

  // =============================================================================
  // HUMAN APPROVAL INTERFACE
  // =============================================================================

  /**
   * CRITICAL: Human approval interface using terminal prompts
   * 
   * This is the security boundary for human approval. It must:
   * - Display clear, eye-catching prompts using log*() functions
   * - Use secure input validation to prevent accidental approvals
   * - Handle all three response types (approve/reject/modify) correctly
   * - Never allow preToolUse hooks to bypass approval requirements
   * 
   * The approval flow requires explicit confirmation to prevent accidents:
   * - APPROVE: Must type exact "APPROVE" (case-sensitive)
   * - REJECT: Just "R" or "r" + ENTER
   * - MODIFY: Just "M" or "m" + ENTER, then prompt for alternative
   * 
   * @param {string} name - Tool name
   * @param {Object} args - Tool arguments 
   * @param {string} sessionId - Session ID
   * @returns {Object} { action: 'approved'|'rejected'|'modified', prompt?: string }
   */
  static async askHuman(name, args, sessionId) {
    const tool = _G.tools[name];

    // Check if --no-humans flag is set (unattended mode)
    if (_G.cliFlags?.noHumans) {
      console.log(color.yellow('🤖 --no-humans mode: Auto-rejecting tool request'));
      utils.logHumanApproval(name, 'Auto-rejected (--no-humans)', false);
      return {
        action: 'rejected',
        autoRejected: true,
        message: 'The human is not present at the console, and your tool request did not match the allowlist, so it was automatically rejected. Use simpler and safer tools that are more likely to be on the allowlist.'
      };
    }

    // Get tool-specific context for the approval prompt
    let toolContext = '';
    if (tool.metadata?.getApprovalPrompt) {
      toolContext = await tool.metadata.getApprovalPrompt(args, { sessionId });
    }

    // Display approval prompt using new cleaner format
    utils.logHumanApproval(name, toolContext);

    console.log(color.white('Type APPROVE (exact case) to proceed'));
    console.log(color.white('Press R + ENTER to reject'));
    console.log(color.white('Press M + ENTER to modify'));
    console.log('');

    while (true) {
      try {
        // Use readline instead of read module for better reliability
        const rl = readline.createInterface({
          input: process.stdin,
          output: process.stdout
        });

        const response = await new Promise((resolve) => {
          rl.question(color.bold('Your choice: '), (answer) => {
            rl.close();
            resolve(answer);
          });
        });

        const trimmed = response.trim();

        // Check for exact "APPROVE" (case-sensitive)
        if (trimmed === 'APPROVE') {
          utils.logHumanApproval(name, '', true);
          return { action: 'approved' };
        }

        // Check for reject (R or r)
        if (trimmed.toLowerCase() === 'r') {
          utils.logHumanApproval(name, '', false);
          return { action: 'rejected' };
        }

        // Check for modify (M or m)
        if (trimmed.toLowerCase() === 'm') {
          console.log(color.yellow('📝 User wants to modify the request'));

          // Get alternative prompt from user using readline
          const rl2 = readline.createInterface({
            input: process.stdin,
            output: process.stdout
          });

          const userPrompt = await new Promise((resolve, reject) => {
            rl2.question(color.bold('Enter your alternative request: '), (answer) => {
              rl2.close();
              resolve(answer);
            });
          });

          console.log(color.yellow(`📝 User provided alternative: ${userPrompt}`));
          return { action: 'modified', prompt: userPrompt.trim() };
        }

        // Invalid input - re-prompt
        console.log(color.red('❌ Invalid input. Please type APPROVE, R, or M'));

      } catch (error) {
        console.log(color.red(`Error reading input: ${error.message}`));
        return { action: 'rejected' };
      }
    }
  }  // =============================================================================
  // PENDING TOOL CALLS PROCESSING
  // =============================================================================

  /**
   * Process pending tool calls from session messages
   * 
   * Refactored from Agent.processPendingToolCalls() to be more modular.
   * Finds tool_calls in session messages that don't have corresponding tool results,
   * executes them through the approval workflow, and adds results to the session.
   * 
   * @param {Object} sessionContent - Session data with messages
   * @param {string} session_id - Session ID for context
   * @returns {boolean} True if session was updated with new tool results
   */
  static async processPendingCalls(sessionContent, session_id = null) {
    if (!sessionContent.spec?.messages) {
      return false;
    }

    let sessionUpdated = false;

    // Find tool_calls messages and process pending calls
    for (const message of sessionContent.spec.messages) {
      if (message.role === 'assistant' && message.tool_calls) {
        for (const toolCall of message.tool_calls) {
          // Check if this tool call needs to be executed
          let shouldExecute = true;

          // Look for existing tool result for this call
          for (const message2 of sessionContent.spec.messages) {
            if (message2.role == 'tool' && message2.tool_call_id == toolCall.id) {
              shouldExecute = false;
              break;
            }
          }

          if (shouldExecute) {
            log('debug', `Now executing tool call ${color.bold(toolCall.function.name)} #${toolCall.id}`);

            // Set FSM state to tool_executing
            _G.fsmState = 'tool_executing';
            _G.signalHandler.currentSessionId = session_id;
            _G.signalHandler.currentToolCallId = toolCall.id;

            try {
              // Parse arguments and execute the tool through our approval workflow
              const args = JSON.parse(toolCall.function.arguments);
              const result = await Tool.execute(toolCall.function.name, args, session_id);

              // Check if abort was requested during execution
              if (_G.signalHandler.abortRequested) {
                log('warn', `⚠️  User aborted tool call ${color.bold(toolCall.function.name)} #${toolCall.id}`);

                // Add tool result message indicating abortion
                sessionContent.spec.messages.push({
                  ts: new Date().toISOString(),
                  role: 'tool',
                  tool_call_id: toolCall.id,
                  content: 'Tool execution was aborted by user (Ctrl+C)',
                });

                // Reset abort flag - only abort the current tool, not all pending ones
                _G.signalHandler.abortRequested = false;
                _G.signalHandler.currentToolCallId = null;

                sessionUpdated = true;

                // Reset FSM state so we can continue with next tool
                _G.fsmState = 'normal';
                _G.signalHandler.currentSessionId = null;

                // Continue to next tool (don't skip remaining tools)
                continue;
              }

              // Use the content field for API compatibility, but keep rich metadata
              const content = result.content || JSON.stringify(result, null, 2);

              // Add tool result message to session
              sessionContent.spec.messages.push({
                ts: new Date().toISOString(),
                role: 'tool',
                tool_call_id: toolCall.id,
                content,
              });

              if (result.success) {
                log('info', `✅ Tool ${color.bold(toolCall.function.name)} succeeded. #${toolCall.id}`);
              } else {
                log('error', `❌ Tool ${color.bold(toolCall.function.name)} failed. #${toolCall.id} Error: ${content}`);
              }

            } catch (error) {
              // Add error result message to session
              sessionContent.spec.messages.push({
                ts: new Date().toISOString(),
                role: 'tool',
                tool_call_id: toolCall.id,
                content: JSON.stringify({
                  success: false,
                  error: error.message
                }, null, 2)
              });

              log('error', `Error during Tool call ${color.bold(toolCall.function.name)}: ${error.message}`);
            } finally {
              // Reset FSM state
              _G.fsmState = 'normal';
              _G.signalHandler.currentSessionId = null;
              _G.signalHandler.currentToolCallId = null;
            }

            sessionUpdated = true;
          }
        }
      }
    }

    return sessionUpdated;
  }

  // =============================================================================
  // API COMPATIBILITY UTILITIES
  // =============================================================================

  // =============================================================================
  // VALIDATION HELPERS
  // =============================================================================

  /**
   * Validate required fields according to tool definition
   * 
   * @param {Object} args - Tool arguments from Copilot
   * @param {Object} toolDefinition - Tool function definition with parameters schema
   * @returns {Object} { success: boolean, error?: string, field?: string }
   */
  static validateRequiredFields(args, toolDefinition) {
    const required = toolDefinition.parameters?.required || [];
    const properties = toolDefinition.parameters?.properties || {};

    for (const fieldName of required) {
      const value = args[fieldName];

      // Check if field is missing
      if (value === undefined || value === null) {
        return {
          success: false,
          error: `Required field '${fieldName}' was missing or null`,
          field: fieldName
        };
      }

      // Check if string field is empty
      if (properties[fieldName]?.type === 'string' && (value === '' || (typeof value === 'string' && value.trim() === ''))) {
        return {
          success: false,
          error: `Required field '${fieldName}' was empty or contains only whitespace`,
          field: fieldName
        };
      }
    }

    return { success: true };
  }

  // =============================================================================
  // TOOL API PREPARATION
  // =============================================================================

  /**
   * Filter tool definitions for Copilot API compatibility
  /**
   * Strips custom metadata from tool objects before sending to the API.
   * The Copilot/Claude API expects only the 'definition' field containing
   * the standard OpenAI tool schema. Custom metadata like 'requiresHumanApproval'
   * and lifecycle hooks must be filtered out to prevent API validation errors.
   * 
   * Also ensures all tool functions have a 'parameters' field, as required by
   * OpenAI-compatible APIs (including xAI). If a tool doesn't have parameters,
   * we add an empty object schema.
   * 
   * @param {Array} tools - Array of _G.tools values with metadata
   * @returns {Array} Array of API-compatible tool definition objects
   */
  static prepareToolsForAPI(tools) {
    return tools.map(tool => {
      // Clone the definition to avoid mutating the original
      const definition = JSON.parse(JSON.stringify(tool.definition));

      // Ensure function has parameters field (required by OpenAI-compatible APIs)
      if (definition.type === 'function' && definition.function) {
        if (!definition.function.parameters) {
          definition.function.parameters = {
            type: 'object',
            properties: {},
            required: []
          };
        }
      }

      return definition;
    });
  }
}