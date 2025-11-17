/**
 * Mock Data Fixtures for Component Testing
 * 
 * This file provides realistic test data for web components
 */

export const mockChannels = [
  {
    metadata: {
      name: 'development',
      created_at: '2025-11-16T10:00:00Z',
      updated_at: '2025-11-16T12:00:00Z'
    },
    spec: {
      description: 'Development channel',
      labels: ['dev', 'team-a'],
      agent_sessions: [12, 15, 23],
      unread_count: 3,
      muted: false
    }
  },
  {
    metadata: {
      name: 'testing',
      created_at: '2025-11-16T09:00:00Z',
      updated_at: '2025-11-16T11:30:00Z'
    },
    spec: {
      description: 'Testing channel',
      labels: ['test', 'qa'],
      agent_sessions: [7],
      unread_count: 0,
      muted: false
    }
  },
  {
    metadata: {
      name: 'production',
      created_at: '2025-11-15T14:00:00Z',
      updated_at: '2025-11-16T08:00:00Z'
    },
    spec: {
      description: 'Production monitoring',
      labels: ['prod', 'ops'],
      agent_sessions: [45, 46],
      unread_count: 12,
      muted: true
    }
  }
];

export const mockSessions = [
  {
    metadata: {
      name: 'alice',
      session_id: 12,
      created_at: '2025-11-16T10:05:00Z',
      model: 'claude-sonnet-4',
      labels: ['subagent', 'dev']
    },
    spec: {
      state: 'running',
      messages: [
        {
          role: 'user',
          content: 'Analyze the codebase for issues',
          timestamp: '2025-11-16T10:05:00Z'
        },
        {
          role: 'assistant',
          content: 'I will analyze the codebase...',
          timestamp: '2025-11-16T10:05:15Z'
        }
      ],
      ptySessions: [
        {
          id: 'pty-1',
          name: 'dev-shell',
          command: 'npm install',
          status: 'running'
        }
      ]
    }
  },
  {
    metadata: {
      name: 'bob',
      session_id: 15,
      created_at: '2025-11-16T10:10:00Z',
      model: 'gpt-4o',
      labels: ['subagent', 'dev']
    },
    spec: {
      state: 'tool_exec',
      messages: [
        {
          role: 'user',
          content: 'Run tests',
          timestamp: '2025-11-16T10:10:00Z'
        }
      ],
      ptySessions: [
        {
          id: 'pty-2',
          name: 'test-runner',
          command: 'bun test',
          status: 'running'
        }
      ]
    }
  },
  {
    metadata: {
      name: 'charlie',
      session_id: 23,
      created_at: '2025-11-16T10:15:00Z',
      model: 'gemini-2.0-flash-exp',
      labels: ['subagent', 'dev']
    },
    spec: {
      state: 'idle',
      messages: [],
      ptySessions: []
    }
  }
];

export const mockAgents = [
  {
    name: 'alice',
    session_id: 12,
    state: 'running',
    model: 'claude-sonnet-4',
    ptySessions: [
      {
        id: 'pty-1',
        name: 'dev-shell',
        command: 'npm install --save-dev @playwright/test',
        status: 'running'
      }
    ]
  },
  {
    name: 'bob',
    session_id: 15,
    state: 'tool_exec',
    model: 'gpt-4o',
    ptySessions: [
      {
        id: 'pty-2',
        name: 'test-runner',
        command: 'bun test --coverage',
        status: 'running'
      },
      {
        id: 'pty-3',
        name: 'watch',
        command: 'bun test --watch',
        status: 'running'
      }
    ]
  },
  {
    name: 'charlie',
    session_id: 23,
    state: 'paused',
    model: 'gemini-2.0-flash-exp',
    ptySessions: []
  }
];

export const mockEvents = [
  {
    type: 'USER_REQUEST',
    content: 'Can you analyze the test coverage?',
    timestamp: '2025-11-16T12:00:00.000Z',
    session_id: null,
    channel: 'development'
  },
  {
    type: 'RESPONSE',
    content: 'I will analyze the test coverage for you.',
    agent: 'alice',
    session_id: 12,
    timestamp: '2025-11-16T12:00:01.234Z',
    channel: 'development'
  },
  {
    type: 'THINKING',
    content: 'First, I need to check what test files exist...',
    agent: 'alice',
    session_id: 12,
    timestamp: '2025-11-16T12:00:02.567Z',
    channel: 'development'
  },
  {
    type: 'TOOL_CALL',
    tool_name: 'execute_shell',
    tool_call_id: 'call-123',
    args: {
      command: 'find tests -name "*.test.mjs" | wc -l'
    },
    agent: 'alice',
    session_id: 12,
    timestamp: '2025-11-16T12:00:03.890Z',
    channel: 'development',
    status: 'in_progress'
  },
  {
    type: 'TOOL_RESPONSE',
    tool_call_id: 'call-123',
    tool_name: 'execute_shell',
    result: {
      stdout: '32\n',
      stderr: '',
      exit_code: 0
    },
    success: true,
    agent: 'alice',
    session_id: 12,
    timestamp: '2025-11-16T12:00:04.123Z',
    channel: 'development'
  },
  {
    type: 'RESPONSE',
    content: 'Found 32 test files. Coverage looks good!',
    agent: 'alice',
    session_id: 12,
    timestamp: '2025-11-16T12:00:05.456Z',
    channel: 'development'
  },
  {
    type: 'TOOL_CALL',
    tool_name: 'ask_human',
    tool_call_id: 'call-456',
    args: {
      question: 'Should I proceed with running the full test suite?'
    },
    agent: 'bob',
    session_id: 15,
    timestamp: '2025-11-16T12:01:00.000Z',
    channel: 'development',
    status: 'waiting'
  }
];

export const mockTemplates = [
  {
    name: 'solo',
    description: 'General purpose agent',
    model: 'claude-sonnet-4',
    labels: ['general', 'subagent'],
    system_prompt: 'You are a helpful AI assistant.'
  },
  {
    name: 'ada-plan',
    description: 'Planning specialist',
    model: 'gpt-4o',
    labels: ['planner', 'orchestrator'],
    system_prompt: 'You are a planning specialist that breaks down complex tasks.'
  },
  {
    name: 'mini',
    description: 'Fast responses',
    model: 'gpt-4o-mini',
    labels: ['fast', 'subagent'],
    system_prompt: 'You provide quick, concise responses.'
  }
];

export const mockLuceneFilters = {
  sessionFilter: 'session:12',
  typeFilter: 'type:TOOL_CALL',
  agentFilter: 'agent:alice',
  notFilter: 'NOT session:15',
  combinedFilter: 'type:TOOL_CALL AND session:12',
  complexFilter: '(type:TOOL_CALL OR type:TOOL_RESPONSE) AND NOT session:23'
};

export const mockPTYOutput = `
\x1b[32m$ npm test\x1b[0m

> daemon@2.0.0 test
> ./run-tests.sh

Running integration tests...
\x1b[32m✓\x1b[0m WebSocket connection established
\x1b[32m✓\x1b[0m Channel creation works
\x1b[32m✓\x1b[0m Events are received

\x1b[1m3 passing\x1b[0m (234ms)

\x1b[32m$ \x1b[0m
`;

export const mockAudioFile = {
  filename: 'speak-output-123.ogg',
  path: '/audio/speak-output-123.ogg',
  duration: 3.5,
  text: 'Task completed successfully'
};

// Helper function to create a mock WebSocket message
export function createMockWSMessage(type, data) {
  return JSON.stringify({
    type,
    data,
    timestamp: new Date().toISOString()
  });
}

// Helper function to generate random events
export function generateMockEvents(count = 10, channelName = 'development') {
  const events = [];
  const types = ['USER_REQUEST', 'RESPONSE', 'THINKING', 'TOOL_CALL', 'TOOL_RESPONSE'];
  const agents = ['alice', 'bob', 'charlie'];
  
  for (let i = 0; i < count; i++) {
    const type = types[Math.floor(Math.random() * types.length)];
    const agent = agents[Math.floor(Math.random() * agents.length)];
    
    events.push({
      type,
      content: `Mock ${type} event ${i}`,
      agent: type !== 'USER_REQUEST' ? agent : undefined,
      session_id: type !== 'USER_REQUEST' ? Math.floor(Math.random() * 50) : null,
      timestamp: new Date(Date.now() - (count - i) * 1000).toISOString(),
      channel: channelName
    });
  }
  
  return events;
}

// Helper to create initial WebSocket data
export function createInitData() {
  return {
    channels: mockChannels,
    sessions: mockSessions,
    templates: mockTemplates,
    events: mockEvents
  };
}
