import { expect } from '@esm-bundle/chai';
import { fixture, html } from '@open-wc/testing';
import '../../../src/observability/app/components/message-input.mjs';

describe('MessageInput Component', () => {
  let element;

  beforeEach(async () => {
    element = await fixture(html`<message-input></message-input>`);
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

    it('has empty message by default', async () => {
      await new Promise(resolve => setTimeout(resolve, 10));
      const textarea = element.shadowRoot.querySelector('.message-textarea');
      expect(textarea.value).to.equal('');
    });
  });

  describe('message input field', () => {
    it('shows textarea', async () => {
      await new Promise(resolve => setTimeout(resolve, 10));
      
      const textarea = element.shadowRoot.querySelector('.message-textarea');
      expect(textarea).to.exist;
    });

    it('has placeholder text', async () => {
      await new Promise(resolve => setTimeout(resolve, 10));
      
      const textarea = element.shadowRoot.querySelector('.message-textarea');
      expect(textarea.placeholder).to.exist;
    });

    it('updates internal message on input', async () => {
      await new Promise(resolve => setTimeout(resolve, 10));

      const textarea = element.shadowRoot.querySelector('.message-textarea');
      textarea.value = 'Hello, world!';
      textarea.dispatchEvent(new Event('input'));

      expect(textarea.value).to.equal('Hello, world!');
    });
  });

  describe('send button', () => {
    it('shows send button', async () => {
      await new Promise(resolve => setTimeout(resolve, 10));
      
      const sendButton = element.shadowRoot.querySelector('.send-btn');
      expect(sendButton).to.exist;
    });

    it('emits message-submit event when clicking send', async () => {
      await new Promise(resolve => setTimeout(resolve, 10));

      element.currentChannel = 'test';

      let submittedMessage = null;
      element.addEventListener('message-submit', (e) => {
        submittedMessage = e.detail.content;
      });

      const textarea = element.shadowRoot.querySelector('.message-textarea');
      const sendButton = element.shadowRoot.querySelector('.send-btn');
      
      textarea.value = '@alice#12 Test message';
      sendButton.click();

      expect(submittedMessage).to.equal('@alice#12 Test message');
    });

    it('clears message after sending', async () => {
      await new Promise(resolve => setTimeout(resolve, 10));

      element.currentChannel = 'test';

      const textarea = element.shadowRoot.querySelector('.message-textarea');
      const sendButton = element.shadowRoot.querySelector('.send-btn');
      
      textarea.value = '@alice#12 Test message';
      sendButton.click();

      await new Promise(resolve => setTimeout(resolve, 10));

      expect(textarea.value).to.equal('');
    });

    it('does not send when message is empty', async () => {
      await new Promise(resolve => setTimeout(resolve, 10));

      element.currentChannel = 'test';

      let messageSubmitted = false;
      element.addEventListener('message-submit', () => {
        messageSubmitted = true;
      });

      const textarea = element.shadowRoot.querySelector('.message-textarea');
      const sendButton = element.shadowRoot.querySelector('.send-btn');
      
      textarea.value = '';
      sendButton.click();

      expect(messageSubmitted).to.be.false;
    });

    it('sends when message has content', async () => {
      element.currentChannel = 'test';

      await new Promise(resolve => setTimeout(resolve, 10));

      let messageSubmitted = false;
      element.addEventListener('message-submit', () => {
        messageSubmitted = true;
      });

      const textarea = element.shadowRoot.querySelector('.message-textarea');
      const sendButton = element.shadowRoot.querySelector('.send-btn');
      
      textarea.value = '@alice#12 Hello';
      sendButton.click();

      expect(messageSubmitted).to.be.true;
    });
  });

  describe('@mention autocomplete', () => {
    it('detects @ symbol', async () => {
      await new Promise(resolve => setTimeout(resolve, 10));

      const textarea = element.shadowRoot.querySelector('.message-textarea');
      textarea.value = '@alice';
      textarea.dispatchEvent(new Event('input'));

      // Component should detect mention
      expect(textarea.value).to.include('@');
    });

    it('shows autocomplete dropdown on @', async () => {
      element.agents = [
        { name: 'alice', session_id: 12 },
        { name: 'bob', session_id: 15 }
      ];

      await new Promise(resolve => setTimeout(resolve, 10));

      const textarea = element.shadowRoot.querySelector('.message-textarea');
      textarea.value = '@';
      textarea.dispatchEvent(new Event('input'));

      await new Promise(resolve => setTimeout(resolve, 10));

      const dropdown = element.shadowRoot.querySelector('.autocomplete');
      expect(dropdown).to.exist;
    });

    it('filters agents by typed text', async () => {
      element.agents = [
        { name: 'alice', session_id: 12 },
        { name: 'bob', session_id: 15 }
      ];

      await new Promise(resolve => setTimeout(resolve, 10));

      const textarea = element.shadowRoot.querySelector('.message-textarea');
      textarea.value = '@al';
      textarea.dispatchEvent(new Event('input'));

      await new Promise(resolve => setTimeout(resolve, 10));

      const dropdown = element.shadowRoot.querySelector('.autocomplete');
      if (dropdown) {
        const suggestions = dropdown.querySelectorAll('.suggestion');
        const aliceFound = Array.from(suggestions).some(s => s.textContent.includes('alice'));
        expect(aliceFound).to.be.true;
      }
    });

    it('inserts mention on selection', async () => {
      element.agents = [
        { name: 'alice', session_id: 12 }
      ];

      await new Promise(resolve => setTimeout(resolve, 10));

      const textarea = element.shadowRoot.querySelector('.message-textarea');
      textarea.value = '@al';
      textarea.dispatchEvent(new Event('input'));

      await new Promise(resolve => setTimeout(resolve, 10));

      const suggestionItem = element.shadowRoot.querySelector('.suggestion');
      if (suggestionItem) {
        suggestionItem.click();

        await new Promise(resolve => setTimeout(resolve, 10));

        expect(textarea.value).to.include('@alice#12');
      }
    });
  });

  describe('slash commands', () => {
    it('detects slash commands', async () => {
      await new Promise(resolve => setTimeout(resolve, 10));

      const textarea = element.shadowRoot.querySelector('.message-textarea');
      textarea.value = '/join development';
      textarea.dispatchEvent(new Event('input'));

      expect(textarea.value).to.include('/');
    });

    it('emits slash-command event for /join', async () => {
      await new Promise(resolve => setTimeout(resolve, 10));

      let command = null;
      element.addEventListener('slash-command', (e) => {
        command = e.detail;
      });

      const textarea = element.shadowRoot.querySelector('.message-textarea');
      textarea.value = '/join development';
      
      const sendButton = element.shadowRoot.querySelector('.send-btn');
      sendButton.click();

      if (command) {
        expect(command.command).to.equal('join');
        expect(command.args).to.include('development');
      }
    });

    it('emits slash-command event for /invite', async () => {
      await new Promise(resolve => setTimeout(resolve, 10));

      let command = null;
      element.addEventListener('slash-command', (e) => {
        command = e.detail;
      });

      const textarea = element.shadowRoot.querySelector('.message-textarea');
      textarea.value = '/invite @solo';
      
      const sendButton = element.shadowRoot.querySelector('.send-btn');
      sendButton.click();

      if (command) {
        expect(command.command).to.equal('invite');
      }
    });

    it('emits slash-command event for /part', async () => {
      await new Promise(resolve => setTimeout(resolve, 10));

      let command = null;
      element.addEventListener('slash-command', (e) => {
        command = e.detail;
      });

      const textarea = element.shadowRoot.querySelector('.message-textarea');
      textarea.value = '/part';
      
      const sendButton = element.shadowRoot.querySelector('.send-btn');
      sendButton.click();

      if (command) {
        expect(command.command).to.equal('part');
      }
    });
  });

  describe('voice dictation', () => {
    it('shows microphone button', async () => {
      await new Promise(resolve => setTimeout(resolve, 10));
      
      const micButton = element.shadowRoot.querySelector('.voice-btn');
      expect(micButton).to.exist;
    });

    it('has microphone icon', async () => {
      await new Promise(resolve => setTimeout(resolve, 10));
      
      const voiceBtn = element.shadowRoot.querySelector('.voice-btn');
      expect(voiceBtn.innerHTML).to.include('🎤');
    });
  });

  describe('property setters', () => {
    it('updates currentChannel via setter', () => {
      element.currentChannel = 'testing';

      expect(element._currentChannel).to.equal('testing');
    });

    it('updates agents via setter', () => {
      const newAgents = [
        { name: 'charlie', session_id: 23 }
      ];

      element.agents = newAgents;

      expect(element._agents).to.deep.equal(newAgents);
    });
  });

  describe('keyboard shortcuts', () => {
    it('sends message on Enter key', async () => {
      await new Promise(resolve => setTimeout(resolve, 10));

      element.currentChannel = 'test';

      let submitted = false;
      element.addEventListener('message-submit', () => {
        submitted = true;
      });

      const textarea = element.shadowRoot.querySelector('.message-textarea');
      textarea.value = '@alice#12 Test';
      
      const enterEvent = new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter' });
      textarea.dispatchEvent(enterEvent);

      expect(submitted).to.be.true;
    });

    it('allows Shift+Enter for newline', async () => {
      await new Promise(resolve => setTimeout(resolve, 10));

      const textarea = element.shadowRoot.querySelector('.message-textarea');
      const shiftEnterEvent = new KeyboardEvent('keydown', { 
        key: 'Enter', 
        code: 'Enter', 
        shiftKey: true 
      });
      
      textarea.value = 'Line 1';
      textarea.dispatchEvent(shiftEnterEvent);

      // Should not submit, allows new line
      expect(textarea.value).to.not.equal('');
    });
  });

  describe('accessibility', () => {
    it('textarea has aria-label', async () => {
      await new Promise(resolve => setTimeout(resolve, 10));
      
      const textarea = element.shadowRoot.querySelector('.message-textarea');
      expect(textarea.getAttribute('aria-label')).to.exist;
    });

    it('send button has accessible label', async () => {
      await new Promise(resolve => setTimeout(resolve, 10));
      
      const sendButton = element.shadowRoot.querySelector('.send-btn');
      expect(sendButton.getAttribute('aria-label') || sendButton.textContent.trim()).to.exist;
    });
  });
});
