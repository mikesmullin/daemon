import { _G } from './globals.mjs';
import utils, { log } from './utils.mjs';
import color from './colors.mjs';
import read from 'read';

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
            return {
              content: "The user refused to run the tool. You may try alternatives, or ask them to explain.",
              metadata: { rejected: true, reason: 'user_rejection' },
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
          
          // If approved, continue to execution
        }
        
        // If 'allow' or approved, proceed to execution
      }

      // 2. Execute the tool
      const result = await tool.execute(args, { sessionId });
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
    
    // Get tool-specific context for the approval prompt
    let toolContext = '';
    if (tool.metadata?.getApprovalPrompt) {
      toolContext = await tool.metadata.getApprovalPrompt(args, { sessionId });
    }

    // Display eye-catching approval prompt
    console.log('\\n' + color.red('🔧 TOOL APPROVAL REQUIRED 🔧'));
    console.log(color.yellow(`Tool: ${name}`));
    
    if (toolContext) {
      console.log(color.cyan(toolContext));
    }
    
    console.log('\\n' + color.white('Type APPROVE (exact case) to proceed'));
    console.log(color.white('Press R + ENTER to reject'));
    console.log(color.white('Press M + ENTER to modify'));
    console.log('');

    while (true) {
      try {
        const response = await new Promise((resolve, reject) => {
          read({ prompt: color.bold('Your choice: ') }, (err, result) => {
            if (err) reject(err);
            else resolve(result);
          });
        });

        const trimmed = response.trim();

        // Check for exact "APPROVE" (case-sensitive)
        if (trimmed === 'APPROVE') {
          console.log(color.green('✅ Approved by user'));
          return { action: 'approved' };
        }

        // Check for reject (R or r)
        if (trimmed.toLowerCase() === 'r') {
          console.log(color.red('❌ Rejected by user'));
          return { action: 'rejected' };
        }

        // Check for modify (M or m)
        if (trimmed.toLowerCase() === 'm') {
          console.log(color.yellow('📝 User wants to modify the request'));
          
          // Get alternative prompt from user
          const userPrompt = await new Promise((resolve, reject) => {
            read({ 
              prompt: color.bold('Enter your alternative request: ') 
            }, (err, result) => {
              if (err) reject(err);
              else resolve(result);
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
  }

  // =============================================================================
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
            log('warn', `🔧 Executing tool call ${color.bold(toolCall.function.name)} #${toolCall.id}`);

            try {
              // Parse arguments and execute the tool through our approval workflow
              const args = JSON.parse(toolCall.function.arguments);
              const result = await Tool.execute(toolCall.function.name, args, session_id);
              
              // Use the content field for API compatibility, but keep rich metadata
              const content = result.content || JSON.stringify(result, null, 2);

              // Add tool result message to session
              sessionContent.spec.messages.push({
                ts: new Date().toISOString(),
                role: 'tool',
                tool_call_id: toolCall.id,
                content,
              });

              // Log the result for human visibility
              if (content) {
                console.log(content);
              }
              
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

  /**
   * Filter tool definitions for Copilot API compatibility
   * 
   * Strips custom metadata from tool objects before sending to the API.
   * The Copilot/Claude API expects only the 'definition' field containing
   * the standard OpenAI tool schema. Custom metadata like 'requiresHumanApproval'
   * and lifecycle hooks must be filtered out to prevent API validation errors.
   * 
   * @param {Array} tools - Array of _G.tools values with metadata
   * @returns {Array} Array of API-compatible tool definition objects
   */
  static prepareToolsForAPI(tools) {
    return tools.map(tool => {
      // Only return the definition field, strip all metadata
      return tool.definition;
    });
  }
}