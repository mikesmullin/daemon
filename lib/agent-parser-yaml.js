/**
 * lib/agent-parser-yaml.js
 * 
 * Parse and manipulate agent YAML files
 * Two types of files:
 * - Agent templates (templates/*.agent.yaml): Base configurations for instantiating agents
 * - Chat sessions (sessions/*.session.yaml): Active conversation instances
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import yaml from 'js-yaml';
import { join } from 'path';

const TEMPLATES_DIR = 'templates';
const SESSIONS_DIR = 'sessions';

/**
 * Ensure required directories exist
 */
export function ensureAgentDirs() {
  if (!existsSync(TEMPLATES_DIR)) {
    mkdirSync(TEMPLATES_DIR, { recursive: true });
  }
  if (!existsSync(SESSIONS_DIR)) {
    mkdirSync(SESSIONS_DIR, { recursive: true });
  }
}

/**
 * Parse an agent template file
 * @param {string} filePath - Path to *.agent.yaml file
 * @returns {Object} Agent template data
 */
export function parseAgentTemplate(filePath) {
  if (!existsSync(filePath)) {
    throw new Error(`Agent template not found: ${filePath}`);
  }

  const content = readFileSync(filePath, 'utf8');
  const data = yaml.load(content);

  return {
    id: data.id,
    type: data.type,
    model: data.model || 'claude-sonnet-4.5',
    systemPrompt: data.system_prompt || '',
    capabilities: data.capabilities || [],
    metadata: data.metadata || {}
  };
}

/**
 * Parse a chat session file
 * @param {string} filePath - Path to *.session.yaml file
 * @returns {Object} Session data
 */
export function parseSession(filePath) {
  if (!existsSync(filePath)) {
    throw new Error(`Session file not found: ${filePath}`);
  }

  const content = readFileSync(filePath, 'utf8');
  const data = yaml.load(content);

  return {
    sessionId: data.session_id,
    agentId: data.agent_id,
    agentType: data.agent_type,
    model: data.model || 'claude-sonnet-4.5',
    systemPrompt: data.system_prompt || '',
    created: new Date(data.created),
    updated: new Date(data.updated || data.created),
    status: data.status || 'active',
    messages: (data.messages || []).map(msg => ({
      timestamp: new Date(msg.timestamp),
      role: msg.role,
      content: msg.content || '',
      toolCalls: msg.tool_calls || null,
      toolCallId: msg.tool_call_id || null
    })),
    metadata: data.metadata || {}
  };
}

/**
 * Serialize agent template to YAML
 * @param {Object} template - Agent template data
 * @returns {string} YAML content
 */
export function serializeAgentTemplate(template) {
  const data = {
    id: template.id,
    type: template.type,
    model: template.model || 'claude-sonnet-4.5',
    system_prompt: template.systemPrompt,
    capabilities: template.capabilities || [],
    metadata: template.metadata || {}
  };

  return yaml.dump(data, {
    indent: 2,
    lineWidth: 120,
    noRefs: true
  });
}

/**
 * Serialize session to YAML
 * @param {Object} session - Session data
 * @returns {string} YAML content
 */
export function serializeSession(session) {
  const data = {
    session_id: session.sessionId,
    agent_id: session.agentId,
    agent_type: session.agentType,
    model: session.model || 'claude-sonnet-4.5',
    system_prompt: session.systemPrompt,
    created: session.created.toISOString(),
    updated: session.updated.toISOString(),
    status: session.status || 'active',
    messages: session.messages.map(msg => {
      const msgData = {
        timestamp: msg.timestamp.toISOString(),
        role: msg.role,
        content: msg.content
      };
      if (msg.toolCalls) {
        // Convert tool call arguments from JSON string to YAML object for readability
        msgData.tool_calls = msg.toolCalls.map(tc => ({
          ...tc,
          function: {
            ...tc.function,
            // Parse JSON string to object for YAML display
            arguments: typeof tc.function.arguments === 'string'
              ? JSON.parse(tc.function.arguments)
              : tc.function.arguments
          }
        }));
      }
      if (msg.toolCallId) {
        msgData.tool_call_id = msg.toolCallId;
      }
      return msgData;
    }),
    metadata: session.metadata || {}
  };

  return yaml.dump(data, {
    indent: 2,
    lineWidth: -1,  // Disable line wrapping to preserve literal blocks
    noRefs: true,
    quotingType: '"',
    forceQuotes: false
  });
}

/**
 * Create a new agent template
 * @param {string} agentId - Agent identifier
 * @param {Object} config - Template configuration
 * @returns {string} Path to created template
 */
export function createAgentTemplate(agentId, config) {
  ensureAgentDirs();

  const template = {
    id: agentId,
    type: config.type,
    model: config.model || 'claude-sonnet-4.5',
    systemPrompt: config.systemPrompt || '',
    capabilities: config.capabilities || [],
    metadata: config.metadata || {}
  };

  const filePath = join(TEMPLATES_DIR, `${agentId}.agent.yaml`);
  const content = serializeAgentTemplate(template);
  writeFileSync(filePath, content, 'utf8');

  return filePath;
}

/**
 * Create a new session from a template
 * @param {string} agentId - Agent identifier (references template)
 * @param {string} sessionId - Unique session identifier (optional, auto-generated if not provided)
 * @returns {string} Path to created session
 */
export function createSession(agentId, sessionId = null) {
  ensureAgentDirs();

  // Load template
  const templatePath = join(TEMPLATES_DIR, `${agentId}.agent.yaml`);
  const template = parseAgentTemplate(templatePath);

  // Generate session ID if not provided
  if (!sessionId) {
    sessionId = `${agentId}-${Date.now()}`;
  }

  const session = {
    sessionId,
    agentId: template.id,
    agentType: template.type,
    model: template.model,
    systemPrompt: template.systemPrompt,
    created: new Date(),
    updated: new Date(),
    status: 'active',
    messages: [],
    metadata: { ...template.metadata }
  };

  const filePath = join(SESSIONS_DIR, `${sessionId}.session.yaml`);
  const content = serializeSession(session);
  writeFileSync(filePath, content, 'utf8');

  return filePath;
}

/**
 * Append a message to a session
 * @param {string} filePath - Path to *.session.yaml file
 * @param {Object} message - Message object
 */
export function appendMessage(filePath, message) {
  const session = parseSession(filePath);

  session.messages.push({
    timestamp: message.timestamp || new Date(),
    role: message.role,
    content: message.content || '',
    toolCalls: message.toolCalls || null,
    toolCallId: message.toolCallId || null
  });

  session.updated = new Date();

  const content = serializeSession(session);
  writeFileSync(filePath, content, 'utf8');
}

/**
 * Get messages formatted for Copilot API
 * @param {Object} session - Parsed session data
 * @returns {Array} Messages in OpenAI format
 */
export function getMessagesForAPI(session) {
  const messages = [];

  // System prompt first
  if (session.systemPrompt) {
    messages.push({
      role: 'system',
      content: session.systemPrompt
    });
  }

  // Convert session messages
  for (const msg of session.messages) {
    if (msg.role === 'tool_result') {
      // Tool results need special handling
      // Content might be an object (YAML) or string (legacy JSON)
      const content = typeof msg.content === 'string'
        ? msg.content
        : JSON.stringify(msg.content, null, 2);

      messages.push({
        role: 'tool',
        content: content,
        tool_call_id: msg.toolCallId
      });
    } else if (msg.toolCalls) {
      // Assistant message with tool calls
      // Convert arguments back to JSON strings for API
      const toolCalls = msg.toolCalls.map(tc => ({
        ...tc,
        function: {
          ...tc.function,
          arguments: typeof tc.function.arguments === 'string'
            ? tc.function.arguments
            : JSON.stringify(tc.function.arguments)
        }
      }));

      messages.push({
        role: 'assistant',
        content: msg.content || null,
        tool_calls: toolCalls
      });
    } else {
      // Regular message
      messages.push({
        role: msg.role,
        content: msg.content
      });
    }
  }

  return messages;
}

/**
 * Get the last message from a session
 * @param {string} filePath - Path to session file
 * @returns {Object|null} Last message or null
 */
export function getLastMessage(filePath) {
  const session = parseSession(filePath);
  if (session.messages.length === 0) return null;
  return session.messages[session.messages.length - 1];
}

/**
 * Check if session is waiting for response (last message is 'user' or 'tool_result' role)
 * @param {string} filePath - Path to session file
 * @returns {boolean} True if waiting for response
 */
export function isWaitingForResponse(filePath) {
  const lastMsg = getLastMessage(filePath);
  if (!lastMsg) return false;
  // Agent should respond after user messages OR after tool results
  return lastMsg.role === 'user' || lastMsg.role === 'tool_result';
}

/**
 * Update session status
 * @param {string} filePath - Path to session file
 * @param {string} status - New status (active, sleeping, completed, error)
 */
export function updateSessionStatus(filePath, status) {
  const session = parseSession(filePath);
  session.status = status;
  session.updated = new Date();

  const content = serializeSession(session);
  writeFileSync(filePath, content, 'utf8');
}

/**
 * Save agent template to file
 * @param {string} filePath - Path to save template
 * @param {Object} template - Template data
 */
export function saveAgentTemplate(filePath, template) {
  const content = serializeAgentTemplate(template);
  writeFileSync(filePath, content, 'utf8');
}

/**
 * Save session to file
 * @param {string} filePath - Path to save session
 * @param {Object} session - Session data
 */
export function saveSession(filePath, session) {
  session.updated = new Date();
  const content = serializeSession(session);
  writeFileSync(filePath, content, 'utf8');
}
