import { readFileSync } from 'fs';
import { join } from 'path';
import YAML from 'js-yaml';

const FIXTURES_DIR = join(import.meta.dir, '..', 'fixtures');

/**
 * Load a fixture file and return its parsed content
 */
export function loadFixture(category, filename) {
  const path = join(FIXTURES_DIR, category, filename);
  const content = readFileSync(path, 'utf-8');
  
  // Parse based on extension
  if (filename.endsWith('.yaml') || filename.endsWith('.yml')) {
    return YAML.parse(content);
  } else if (filename.endsWith('.json')) {
    return JSON.parse(content);
  }
  
  return content;
}

/**
 * Load a channel fixture
 */
export function loadChannelFixture(filename) {
  return loadFixture('channels', filename);
}

/**
 * Load a session fixture
 */
export function loadSessionFixture(filename) {
  return loadFixture('sessions', filename);
}

/**
 * Load a template fixture
 */
export function loadTemplateFixture(filename) {
  return loadFixture('templates', filename);
}

/**
 * Create a mock session object for testing
 */
export function createMockSession(overrides = {}) {
  return {
    id: 1,
    name: 'test-session',
    template: 'solo',
    state: 'created',
    channelName: 'test-channel',
    messages: [],
    metadata: {
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    },
    ...overrides
  };
}

/**
 * Create a mock channel object for testing
 */
export function createMockChannel(overrides = {}) {
  return {
    name: 'test-channel',
    agentSessions: [],
    metadata: {
      created_at: new Date().toISOString()
    },
    ...overrides
  };
}

/**
 * Create a mock event object for testing
 */
export function createMockEvent(type, data = {}) {
  return {
    type,
    timestamp: new Date().toISOString(),
    session_id: 1,
    ...data
  };
}
