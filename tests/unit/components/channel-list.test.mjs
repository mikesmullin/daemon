import { expect } from '@esm-bundle/chai';
import { fixture, html } from '@open-wc/testing';
import '../../../src/observability/app/components/channel-list.mjs';

describe('ChannelList Component', () => {
  let element;

  beforeEach(async () => {
    element = await fixture(html`<channel-list></channel-list>`);
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

    it('has empty channels array by default', () => {
      // Component returns empty array from getter when _channels is undefined
      expect(element.channels).to.deep.equal([]);
    });

    it('has no current channel by default', () => {
      // Component returns undefined from getter when not set
      expect(element.currentChannel).to.not.exist;
    });
  });

  describe('channel rendering', () => {
    it('displays list of channels', async () => {
      element.channels = [
        { metadata: { name: 'development' }, spec: { unread_count: 0 } },
        { metadata: { name: 'testing' }, spec: { unread_count: 2 } }
      ];

      // No updateComplete needed - render() is called synchronously
      await new Promise(resolve => setTimeout(resolve, 10));
      
      const channelItems = element.shadowRoot.querySelectorAll('.channel');
      expect(channelItems.length).to.equal(2);
    });

    it('highlights current channel', async () => {
      element.channels = [
        { metadata: { name: 'development' }, spec: {} },
        { metadata: { name: 'testing' }, spec: {} }
      ];
      element.currentChannel = 'development';

      await new Promise(resolve => setTimeout(resolve, 10));
      
      const activeChannel = element.shadowRoot.querySelector('.channel.active');
      expect(activeChannel).to.exist;
      expect(activeChannel.textContent).to.include('development');
    });

    it('shows unread count badge', async () => {
      element.channels = [
        { metadata: { name: 'development' }, spec: {} }
      ];
      // Set unread count using component's method
      element.setUnreadCount('development', 5);

      await new Promise(resolve => setTimeout(resolve, 10));
      
      const badge = element.shadowRoot.querySelector('.unread-badge');
      expect(badge).to.exist;
      expect(badge.textContent).to.equal('5');
    });

    it('hides unread badge when count is 0', async () => {
      element.channels = [
        { metadata: { name: 'development' }, spec: {} }
      ];
      // Default unread count is 0

      await new Promise(resolve => setTimeout(resolve, 10));
      
      const badge = element.shadowRoot.querySelector('.unread-badge');
      expect(badge).to.not.exist;
    });
  });

  describe('channel interactions', () => {
    it('emits channel-select event on click', async () => {
      element.channels = [
        { metadata: { name: 'development' }, spec: {} }
      ];

      await new Promise(resolve => setTimeout(resolve, 10));

      let selectedChannel = null;
      element.addEventListener('channel-select', (e) => {
        selectedChannel = e.detail.channel;
      });

      const channelItem = element.shadowRoot.querySelector('.channel');
      channelItem.click();

      expect(selectedChannel).to.equal('development');
    });

    it('emits channel-create event when clicking add button', async () => {
      await new Promise(resolve => setTimeout(resolve, 10));

      let createdName = null;
      element.addEventListener('channel-create', (e) => {
        createdName = e.detail.name;
      });

      // Mock prompt to avoid blocking
      const originalPrompt = window.prompt;
      window.prompt = () => 'new-channel';

      const addButton = element.shadowRoot.querySelector('.add-btn');
      addButton.click();
      
      window.prompt = originalPrompt;
      expect(createdName).to.equal('new-channel');
    });

    it('emits channel-mute event when clicking mute button', async () => {
      element.channels = [
        { metadata: { name: 'development' }, spec: {} }
      ];

      await new Promise(resolve => setTimeout(resolve, 10));

      let mutedChannel = null;
      let mutedState = null;
      element.addEventListener('channel-mute', (e) => {
        mutedChannel = e.detail.channel;
        mutedState = e.detail.muted;
      });

      const muteButton = element.shadowRoot.querySelector('.mute-btn');
      muteButton.click();
      expect(mutedChannel).to.equal('development');
      expect(mutedState).to.be.true; // Should be muted after clicking
    });
  });

  describe('empty state', () => {
    it('shows empty state when no channels', async () => {
      element.channels = [];

      await new Promise(resolve => setTimeout(resolve, 10));
      
      const emptyState = element.shadowRoot.querySelector('.empty');
      expect(emptyState).to.exist;
    });

    it('shows message prompting to create channel', async () => {
      element.channels = [];

      await new Promise(resolve => setTimeout(resolve, 10));
      
      const emptyMessage = element.shadowRoot.textContent;
      expect(emptyMessage).to.include('channel');
    });
  });

  describe('settings menu', () => {
    it('has settings link', async () => {
      await new Promise(resolve => setTimeout(resolve, 10));
      
      const settingsLink = element.shadowRoot.querySelector('.settings-link');
      expect(settingsLink).to.exist;
    });

    it('emits settings-open event when clicking settings', async () => {
      await new Promise(resolve => setTimeout(resolve, 10));

      let settingsOpened = false;
      element.addEventListener('settings-open', () => {
        settingsOpened = true;
      });

      const settingsLink = element.shadowRoot.querySelector('.settings-link');
      settingsLink.click();
      expect(settingsOpened).to.be.true;
    });
  });

  describe('property setters', () => {
    it('updates channels via setter', () => {
      const newChannels = [
        { metadata: { name: 'new-channel' }, spec: {} }
      ];

      element.channels = newChannels;

      expect(element._channels).to.deep.equal(newChannels);
    });

    it('updates currentChannel via setter', () => {
      element.currentChannel = 'testing';

      expect(element._currentChannel).to.equal('testing');
    });
  });
});
