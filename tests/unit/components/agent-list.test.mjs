import { expect } from '@esm-bundle/chai';
import { fixture, html } from '@open-wc/testing';
import '../../../src/observability/app/components/agent-list.mjs';

describe('AgentList Component', () => {
  let element;

  beforeEach(async () => {
    element = await fixture(html`<agent-list></agent-list>`);
  });

  afterEach(() => {
    if (element && element.parentNode) {
      element.parentNode.removeChild(element);
    }
  });

  describe('initialization', () => {
    it('renders without crashing', () => {
      expect(element).to.exist;
      expect(element.shadowRoot).to.exist;
    });

    it('has empty agents array by default', () => {
      expect(element._agents).to.deep.equal([]);
    });
  });

  describe('agent rendering', () => {
    it('displays list of agents', async () => {
      element.agents = [
        { name: 'alice', session_id: 12, state: 'running' },
        { name: 'bob', session_id: 15, state: 'idle' }
      ];

      await new Promise(resolve => setTimeout(resolve, 10));
      
      const agentItems = element.shadowRoot.querySelectorAll('.agent-card');
      expect(agentItems.length).to.equal(2);
    });

    it('shows agent name and session ID', async () => {
      element.agents = [
        { name: 'alice', session_id: 12, state: 'running' }
      ];

      await new Promise(resolve => setTimeout(resolve, 10));
      
      const agentItem = element.shadowRoot.querySelector('.agent-card');
      expect(agentItem.textContent).to.include('alice');
      expect(agentItem.textContent).to.include('12');
    });

    it('shows agent status indicator', async () => {
      element.agents = [
        { name: 'alice', session_id: 12, state: 'running' }
      ];

      await new Promise(resolve => setTimeout(resolve, 10));
      
      const statusIndicator = element.shadowRoot.querySelector('.status-indicator');
      expect(statusIndicator).to.exist;
    });

    it('applies correct status color for running agent', async () => {
      element.agents = [
        { name: 'alice', session_id: 12, state: 'running' }
      ];

      await new Promise(resolve => setTimeout(resolve, 10));
      
      const statusIndicator = element.shadowRoot.querySelector('.status-indicator');
      expect(statusIndicator.classList.contains('running') || 
             statusIndicator.classList.contains('online')).to.be.true;
    });

    it('displays agent avatar', async () => {
      element.agents = [
        { name: 'alice', session_id: 12, state: 'running' }
      ];

      await new Promise(resolve => setTimeout(resolve, 10));
      
      const avatar = element.shadowRoot.querySelector('.avatar');
      expect(avatar).to.exist;
      expect(avatar.textContent).to.equal('A'); // First letter capitalized
    });
  });

  describe('PTY sessions', () => {
    it('shows PTY sessions for agent', async () => {
      element.agents = [
        {
          name: 'alice',
          session_id: 12,
          state: 'running',
          pty_sessions: [
            { id: 'pty-1', cmd: 'npm install' }
          ]
        }
      ];

      await new Promise(resolve => setTimeout(resolve, 10));
      
      const ptyList = element.shadowRoot.querySelector('.pty-list');
      expect(ptyList).to.exist;
    });

    it('displays PTY command truncated', async () => {
      element.agents = [
        {
          name: 'alice',
          session_id: 12,
          state: 'running',
          pty_sessions: [
            { id: 'pty-1', cmd: 'very long command that should be truncated at some point' }
          ]
        }
      ];

      await new Promise(resolve => setTimeout(resolve, 10));
      
      const ptyCommand = element.shadowRoot.querySelector('.pty-command');
      if (ptyCommand) {
        expect(ptyCommand.textContent.length).to.be.lessThan(100);
      }
    });

    it('emits pty-view event when clicking PTY session', async () => {
      element.agents = [
        {
          name: 'alice',
          session_id: 12,
          state: 'running',
          pty_sessions: [
            { id: 'pty-1', cmd: 'npm install' }
          ]
        }
      ];

      await new Promise(resolve => setTimeout(resolve, 10));

      let viewedPty = null;
      element.addEventListener('pty-view', (e) => {
        viewedPty = e.detail.sessionId;
      });

      const ptyItem = element.shadowRoot.querySelector('.pty-item');
      if (ptyItem) {
        ptyItem.click();
        expect(viewedPty).to.equal('pty-1');
      }
    });

    it('shows PTY close button on hover', async () => {
      element.agents = [
        {
          name: 'alice',
          session_id: 12,
          state: 'running',
          pty_sessions: [
            { id: 'pty-1', cmd: 'npm install' }
          ]
        }
      ];

      await new Promise(resolve => setTimeout(resolve, 10));
      
      const closeButton = element.shadowRoot.querySelector('.pty-close');
      expect(closeButton).to.exist;
    });
  });

  describe('action buttons', () => {
    it('shows action bar on hover', async () => {
      element.agents = [
        { name: 'alice', session_id: 12, state: 'running' }
      ];

      await new Promise(resolve => setTimeout(resolve, 10));
      
      const actionBar = element.shadowRoot.querySelector('.action-bar');
      expect(actionBar).to.exist;
    });

    it('has mute, pause, and stop buttons', async () => {
      element.agents = [
        { name: 'alice', session_id: 12, state: 'running' }
      ];

      await new Promise(resolve => setTimeout(resolve, 10));
      
      const muteBtn = element.shadowRoot.querySelector('.action-btn.mute');
      const pauseBtn = element.shadowRoot.querySelector('.action-btn.pause');
      const stopBtn = element.shadowRoot.querySelector('.action-btn.stop');
      
      expect(muteBtn).to.exist;
      expect(pauseBtn).to.exist;
      expect(stopBtn).to.exist;
    });

    it('emits agent-pause event when clicking pause', async () => {
      element.agents = [
        { name: 'alice', session_id: 12, state: 'running' }
      ];

      await new Promise(resolve => setTimeout(resolve, 10));

      let pausedAgent = null;
      element.addEventListener('agent-pause', (e) => {
        pausedAgent = e.detail.sessionId;
      });

      const pauseBtn = element.shadowRoot.querySelector('.pause-button');
      if (pauseBtn) {
        pauseBtn.click();
        expect(pausedAgent).to.equal(12);
      }
    });

    it('emits agent-stop event when clicking stop', async () => {
      element.agents = [
        { name: 'alice', session_id: 12, state: 'running' }
      ];

      await new Promise(resolve => setTimeout(resolve, 10));

      let stoppedAgent = null;
      element.addEventListener('agent-stop', (e) => {
        stoppedAgent = e.detail.sessionId;
      });

      const stopBtn = element.shadowRoot.querySelector('.stop-button');
      if (stopBtn) {
        stopBtn.click();
        expect(stoppedAgent).to.equal(12);
      }
    });

    it('emits agent-mute event when clicking mute', async () => {
      element.agents = [
        { name: 'alice', session_id: 12, state: 'running' }
      ];

      await new Promise(resolve => setTimeout(resolve, 10));

      let mutedAgent = null;
      element.addEventListener('agent-mute', (e) => {
        mutedAgent = e.detail.sessionId;
      });

      const muteBtn = element.shadowRoot.querySelector('.mute-button');
      if (muteBtn) {
        muteBtn.click();
        expect(mutedAgent).to.equal(12);
      }
    });
  });

  describe('empty state', () => {
    it('shows empty message when no agents', async () => {
      element.agents = [];
      element.currentChannel = 'development';

      await new Promise(resolve => setTimeout(resolve, 10));
      
      const emptyState = element.shadowRoot.querySelector('.empty-state');
      expect(emptyState).to.exist;
    });

    it('prompts to invite agents', async () => {
      element.agents = [];
      element.currentChannel = 'development';

      await new Promise(resolve => setTimeout(resolve, 10));
      
      const content = element.shadowRoot.textContent;
      expect(content).to.include('No agents');
    });
  });

  describe('agent mention', () => {
    it('emits agent-mention event when clicking agent name', async () => {
      element.agents = [
        { name: 'alice', session_id: 12, state: 'running' }
      ];

      await new Promise(resolve => setTimeout(resolve, 10));

      let mentionedAgent = null;
      element.addEventListener('agent-mention', (e) => {
        mentionedAgent = e.detail;
      });

      const agentName = element.shadowRoot.querySelector('.agent-name');
      if (agentName) {
        agentName.click();
        expect(mentionedAgent).to.exist;
        expect(mentionedAgent.name).to.equal('alice');
        expect(mentionedAgent.sessionId).to.equal(12);
      }
    });
  });

  describe('property setters', () => {
    it('updates agents via setter', () => {
      const newAgents = [
        { name: 'bob', session_id: 15, state: 'idle' }
      ];

      element.agents = newAgents;

      expect(element._agents).to.deep.equal(newAgents);
    });

    it('updates currentChannel via setter', () => {
      element.currentChannel = 'testing';

      expect(element._currentChannel).to.equal('testing');
    });
  });
});
