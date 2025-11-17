# Web Component Unit Tests

This directory contains unit tests for the Daemon observability UI web components.

## Test Structure

```
tests/unit/components/
├── channel-list.test.mjs       - Channel sidebar component tests
├── thread-view.test.mjs        - Main thread/chat view tests
├── agent-list.test.mjs         - Agent sidebar component tests
├── lucene-filter.test.mjs      - Filter bar component tests
├── message-input.test.mjs      - Message input component tests
├── presence-indicator.test.mjs - Working agents indicator tests
└── pty-viewer.test.mjs         - PTY terminal viewer tests
```

## Running Tests

### Run all component tests
```bash
bun run test:unit
```

### Watch mode (re-run on file changes)
```bash
bun run test:unit:watch
```

### With coverage
```bash
bun run test:unit -- --coverage
```

## Testing Framework

We use:
- **Web Test Runner**: Fast browser-based testing
- **Playwright**: Headless browser automation
- **@open-wc/testing**: Web component testing helpers
- **Chai**: Assertion library

## Writing Tests

### Basic structure

```javascript
import { expect } from '@esm-bundle/chai';
import { fixture, html } from '@open-wc/testing';
import '../../../src/observability/app/components/my-component.mjs';

describe('MyComponent', () => {
  let element;

  beforeEach(async () => {
    element = await fixture(html`<my-component></my-component>`);
  });

  afterEach(() => {
    if (element && element.parentNode) {
      element.parentNode.removeChild(element);
    }
  });

  it('renders without crashing', () => {
    expect(element).to.exist;
    expect(element.shadowRoot).to.exist;
  });

  it('has correct default state', () => {
    expect(element.someProperty).to.equal('default-value');
  });
});
```

### Testing properties

```javascript
it('updates property via setter', () => {
  element.myProperty = 'new-value';
  expect(element._myProperty).to.equal('new-value');
});
```

### Testing events

```javascript
it('emits event on action', async () => {
  let eventDetail = null;
  element.addEventListener('my-event', (e) => {
    eventDetail = e.detail;
  });

  const button = element.shadowRoot.querySelector('button');
  button.click();

  expect(eventDetail).to.exist;
});
```

### Testing rendering

```javascript
it('renders children correctly', async () => {
  element.items = ['a', 'b', 'c'];
  
  await element.updateComplete; // Wait for re-render
  
  const listItems = element.shadowRoot.querySelectorAll('.item');
  expect(listItems.length).to.equal(3);
});
```

### Using mock data

```javascript
import { mockChannels, mockEvents } from '../../fixtures/component-data.mjs';

it('displays channels from mock data', async () => {
  element.channels = mockChannels;
  
  await element.updateComplete;
  
  const channelElements = element.shadowRoot.querySelectorAll('.channel');
  expect(channelElements.length).to.equal(mockChannels.length);
});
```

## Coverage Goals

- **Overall**: 60% minimum
- **Critical components** (thread-view, channel-list, agent-list): 80%
- **Utility components**: 50%

## Best Practices

1. **Test behavior, not implementation** - Focus on what the component does, not how
2. **Use semantic selectors** - Prefer `.querySelector('.channel-item')` over complex selectors
3. **Clean up after tests** - Always remove elements in `afterEach`
4. **Test user interactions** - Click buttons, type in inputs, etc.
5. **Test accessibility** - Verify aria labels, keyboard navigation
6. **Use fixtures** - Share mock data across tests via `fixtures/component-data.mjs`

## Debugging

### Run specific test file
```bash
bun run test:unit -- --group tests/unit/components/channel-list.test.mjs
```

### Enable debugging
```bash
bun run test:unit -- --manual
```

This will keep the browser open so you can use DevTools.

### View in browser
When tests run, they are served at `http://localhost:8001`

## Common Issues

### "Element not found in shadow DOM"
Make sure to query within `shadowRoot`:
```javascript
element.shadowRoot.querySelector('.my-class')
```

### "updateComplete is not a function"
Some components may not use Lit. Add a manual wait:
```javascript
await new Promise(resolve => setTimeout(resolve, 100));
```

### "Cannot read property of undefined"
Check that the component has fully initialized:
```javascript
await element.updateComplete;
await new Promise(resolve => requestAnimationFrame(resolve));
```

## CI/CD Integration

Tests run automatically in GitHub Actions on every push. See `.github/workflows/test.yml`.

To run tests as CI would:
```bash
bun run test:all
```

## Related Documentation

- [Web Test Runner Docs](https://modern-web.dev/docs/test-runner/overview/)
- [Open WC Testing](https://open-wc.org/docs/testing/testing-package/)
- [Chai Assertions](https://www.chaijs.com/api/bdd/)
