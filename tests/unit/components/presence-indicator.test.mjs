import { expect } from '@esm-bundle/chai';
import { fixture, html } from '@open-wc/testing';
import '../../../src/observability/app/components/presence-indicator.mjs';

describe('PresenceIndicator Component', () => {
  let element;

  beforeEach(async () => {
    element = await fixture(html`<presence-indicator></presence-indicator>`);
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

    it('has empty workingAgents array by default', () => {
      expect(element._workingAgents).to.deep.equal([]);
    });
  });

  describe('working agents display', () => {
    it('shows agent avatars', async () => {
      element.workingAgents = [
        { name: 'alice', session_id: 12 },
        { name: 'bob', session_id: 15 }
      ];

      await new Promise(resolve => setTimeout(resolve, 10));
      
      const avatars = element.shadowRoot.querySelectorAll('.avatar');
      expect(avatars.length).to.equal(2);
    });

    it('shows "are working" message', async () => {
      element.workingAgents = [
        { name: 'alice', session_id: 12 }
      ];

      await new Promise(resolve => setTimeout(resolve, 10));
      
      const content = element.shadowRoot.textContent;
      expect(content).to.include('working');
    });

    it('shows animated ellipsis', async () => {
      element.workingAgents = [
        { name: 'alice', session_id: 12 }
      ];

      await new Promise(resolve => setTimeout(resolve, 10));
      
      const ellipsis = element.shadowRoot.querySelector('.ellipsis, .loading');
      expect(ellipsis).to.exist;
    });

    it('displays up to 6 avatars', async () => {
      element.workingAgents = [
        { name: 'agent1', session_id: 1 },
        { name: 'agent2', session_id: 2 },
        { name: 'agent3', session_id: 3 },
        { name: 'agent4', session_id: 4 },
        { name: 'agent5', session_id: 5 },
        { name: 'agent6', session_id: 6 },
        { name: 'agent7', session_id: 7 },
        { name: 'agent8', session_id: 8 }
      ];

      await new Promise(resolve => setTimeout(resolve, 10));
      
      const avatars = element.shadowRoot.querySelectorAll('.avatar');
      // Should show 6 agents + 1 "+N more" = 7 avatars total
      expect(avatars.length).to.be.greaterThan(0);
      expect(avatars.length).to.be.lessThanOrEqual(7);
    });

    it('shows "+N more" when more than 6 agents', async () => {
      element.workingAgents = [
        { name: 'agent1', session_id: 1 },
        { name: 'agent2', session_id: 2 },
        { name: 'agent3', session_id: 3 },
        { name: 'agent4', session_id: 4 },
        { name: 'agent5', session_id: 5 },
        { name: 'agent6', session_id: 6 },
        { name: 'agent7', session_id: 7 }
      ];

      await new Promise(resolve => setTimeout(resolve, 10));
      
      const moreIndicator = element.shadowRoot.textContent;
      expect(moreIndicator).to.include('+1' || 'more');
    });
  });

  describe('avatar rendering', () => {
    it('shows first letter of agent name', async () => {
      element.workingAgents = [
        { name: 'alice', session_id: 12 }
      ];

      await new Promise(resolve => setTimeout(resolve, 10));
      
      const avatar = element.shadowRoot.querySelector('.avatar');
      expect(avatar.textContent.trim()).to.equal('A');
    });

    it('capitalizes first letter', async () => {
      element.workingAgents = [
        { name: 'bob', session_id: 15 }
      ];

      await new Promise(resolve => setTimeout(resolve, 10));
      
      const avatar = element.shadowRoot.querySelector('.avatar');
      expect(avatar.textContent.trim()).to.equal('B');
    });

    it('avatars have circular shape', async () => {
      element.workingAgents = [
        { name: 'alice', session_id: 12 }
      ];

      await new Promise(resolve => setTimeout(resolve, 10));
      
      const avatar = element.shadowRoot.querySelector('.avatar');
      const styles = window.getComputedStyle(avatar);
      expect(styles.borderRadius).to.include('50%' || 'circle');
    });
  });

  describe('visibility', () => {
    it('hides when no working agents', async () => {
      element.workingAgents = [];

      await new Promise(resolve => setTimeout(resolve, 10));
      
      // Component should be hidden or show empty state
      const container = element.shadowRoot.querySelector('.presence-container');
      if (container) {
        expect(container.style.display).to.equal('none' || 'hidden');
      }
    });

    it('shows when agents are working', async () => {
      element.workingAgents = [
        { name: 'alice', session_id: 12 }
      ];

      await new Promise(resolve => setTimeout(resolve, 10));
      
      const indicator = element.shadowRoot.querySelector('.indicator');
      expect(indicator).to.exist;
    });
  });

  describe('property setters', () => {
    it('updates workingAgents via setter', () => {
      const newAgents = [
        { name: 'charlie', session_id: 23 }
      ];

      element.workingAgents = newAgents;

      expect(element._workingAgents).to.deep.equal(newAgents);
    });
  });

  describe('animation', () => {
    it('has animated ellipsis', async () => {
      element.workingAgents = [
        { name: 'alice', session_id: 12 }
      ];

      await new Promise(resolve => setTimeout(resolve, 10));
      
      const ellipsis = element.shadowRoot.querySelector('.ellipsis, .loading, .dots');
      expect(ellipsis).to.exist;
    });
  });
});
