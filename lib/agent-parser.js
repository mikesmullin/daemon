/**
 * lib/agent-parser.js
 * 
 * Parse and manipulate agent chat log files (*.agent.md)
 * Each agent file contains:
 * - Metadata (type, created timestamp)
 * - System prompt
 * - Conversation history with timestamps
 * - Tool calls and results
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import yaml from 'js-yaml';

/**
 * Parse an agent file into structured data
 * @param {string} filePath - Path to *.agent.md file
 * @returns {Object} Parsed agent data
 */
export function parseAgentFile(filePath) {
  if (!existsSync(filePath)) {
    throw new Error(`Agent file not found: ${filePath}`);
  }

  const content = readFileSync(filePath, 'utf8');
  const lines = content.split('\n').map(line => line.replace(/\r$/, '')); // Remove \r from Windows line endings

  const agent = {
    id: null,
    type: null,
    created: null,
    systemPrompt: '',
    messages: [],
    metadata: {}
  };

  let section = 'header';
  let currentMessage = null;
  let multilineContent = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Parse header: # Agent: planner-001
    if (line.startsWith('# Agent: ')) {
      agent.id = line.substring('# Agent: '.length).trim();
      continue;
    }

    // Detect sections (check BEFORE parsing metadata)
    if (line === '## System Prompt') {
      section = 'system';
      multilineContent = [];
      continue;
    }

    if (line === '## Conversation') {
      section = 'conversation';
      if (multilineContent.length > 0) {
        agent.systemPrompt = multilineContent.join('\n').trim();
        multilineContent = [];
      }
      continue;
    }

    // Parse metadata (YAML front matter style)
    if (section === 'header' && line.includes(': ')) {
      const [key, ...valueParts] = line.split(': ');
      const value = valueParts.join(': ').trim();
      agent.metadata[key.trim()] = value;

      if (key.trim() === 'type') agent.type = value;
      if (key.trim() === 'created') agent.created = new Date(value);
      continue;
    }

    // Parse system prompt
    if (section === 'system') {
      // Skip first empty line after section header
      if (line.trim() !== '' || multilineContent.length > 0) {
        multilineContent.push(line);
      }
      continue;
    }

    // Parse conversation messages
    if (section === 'conversation') {
      // Message header: ### 2025-10-04 10:05:23 | user
      const messageMatch = line.match(/^### (.+?) \| (user|assistant|tool_call|tool_result)$/);
      if (messageMatch) {
        // Save previous message
        if (currentMessage) {
          currentMessage.content = multilineContent.join('\n').trim();
          agent.messages.push(currentMessage);
        }

        // Start new message
        currentMessage = {
          timestamp: new Date(messageMatch[1]),
          role: messageMatch[2],
          content: ''
        };
        multilineContent = [];
        continue;
      }

      // Accumulate message content
      if (currentMessage) {
        multilineContent.push(line);
      }
    }
  }

  // Save last message
  if (currentMessage && multilineContent.length > 0) {
    currentMessage.content = multilineContent.join('\n').trim();
    agent.messages.push(currentMessage);
  }

  // Save last system prompt if conversation section not found
  if (section === 'system' && multilineContent.length > 0) {
    agent.systemPrompt = multilineContent.join('\n').trim();
  }

  return agent;
}

/**
 * Convert agent data back to *.agent.md format
 * @param {Object} agent - Agent data structure
 * @returns {string} Formatted Markdown content
 */
export function serializeAgentFile(agent) {
  const lines = [];

  // Header
  lines.push(`# Agent: ${agent.id}`);
  lines.push(`type: ${agent.type}`);
  lines.push(`created: ${agent.created.toISOString()}`);

  // Additional metadata
  for (const [key, value] of Object.entries(agent.metadata)) {
    if (key !== 'type' && key !== 'created') {
      lines.push(`${key}: ${value}`);
    }
  }

  lines.push('');

  // System prompt
  lines.push('## System Prompt');
  lines.push(agent.systemPrompt);
  lines.push('');

  // Conversation
  lines.push('## Conversation');
  lines.push('');

  for (const msg of agent.messages) {
    const timestamp = msg.timestamp.toISOString().replace('T', ' ').substring(0, 19);
    lines.push(`### ${timestamp} | ${msg.role}`);
    lines.push(msg.content);
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Append a message to an agent's chat log
 * @param {string} filePath - Path to *.agent.md file
 * @param {Object} message - Message object with role and content
 */
export function appendMessage(filePath, message) {
  const agent = parseAgentFile(filePath);

  agent.messages.push({
    timestamp: message.timestamp || new Date(),
    role: message.role,
    content: message.content
  });

  const serialized = serializeAgentFile(agent);
  writeFileSync(filePath, serialized, 'utf8');
}

/**
 * Get messages for Copilot API (convert to OpenAI format)
 * @param {Object} agent - Parsed agent data
 * @returns {Array} Array of messages in OpenAI format
 */
export function getMessagesForAPI(agent) {
  const messages = [];

  // Add system prompt as first message
  if (agent.systemPrompt) {
    messages.push({
      role: 'system',
      content: agent.systemPrompt
    });
  }

  // Convert agent messages to API format
  for (const msg of agent.messages) {
    // Map roles
    let role = msg.role;
    if (role === 'tool_result') {
      role = 'tool';  // OpenAI expects 'tool' role for results
    }
    if (role === 'tool_call') {
      // Tool calls are embedded in assistant messages
      continue;
    }

    // Parse tool calls and results if present
    if (msg.content.includes('name:') && msg.content.includes('arguments:')) {
      // This is a tool call message
      try {
        const toolCall = parseToolCall(msg.content);
        messages.push({
          role: 'assistant',
          content: null,
          tool_calls: [toolCall]
        });
      } catch (e) {
        // If parsing fails, treat as regular message
        messages.push({ role, content: msg.content });
      }
    } else {
      messages.push({ role, content: msg.content });
    }
  }

  return messages;
}

/**
 * Parse tool call from message content
 * @param {string} content - Message content with tool call
 * @returns {Object} Tool call object
 */
function parseToolCall(content) {
  const lines = content.split('\n');
  let name = '';
  let args = {};
  let inArgs = false;
  let argsYaml = [];

  for (const line of lines) {
    if (line.startsWith('name: ')) {
      name = line.substring(6).trim();
    } else if (line.startsWith('arguments:')) {
      inArgs = true;
    } else if (inArgs) {
      argsYaml.push(line);
    }
  }

  if (argsYaml.length > 0) {
    args = yaml.load(argsYaml.join('\n')) || {};
  }

  return {
    id: `call_${Date.now()}`,
    type: 'function',
    function: {
      name,
      arguments: JSON.stringify(args)
    }
  };
}

/**
 * Create a new agent file
 * @param {string} filePath - Path where to create the file
 * @param {Object} config - Agent configuration
 */
export function createAgentFile(filePath, config) {
  const agent = {
    id: config.id,
    type: config.type,
    created: new Date(),
    systemPrompt: config.systemPrompt || '',
    messages: [],
    metadata: config.metadata || {}
  };

  const serialized = serializeAgentFile(agent);
  writeFileSync(filePath, serialized, 'utf8');

  return agent;
}

/**
 * Get the last message from an agent
 * @param {string} filePath - Path to agent file
 * @returns {Object|null} Last message or null if no messages
 */
export function getLastMessage(filePath) {
  const agent = parseAgentFile(filePath);
  if (agent.messages.length === 0) return null;
  return agent.messages[agent.messages.length - 1];
}

/**
 * Check if agent is waiting for a response (last message is 'user' role)
 * @param {string} filePath - Path to agent file
 * @returns {boolean} True if waiting for response
 */
export function isWaitingForResponse(filePath) {
  const lastMsg = getLastMessage(filePath);
  return lastMsg && lastMsg.role === 'user';
}
