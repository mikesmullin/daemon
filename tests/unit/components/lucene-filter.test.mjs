import { expect } from '@esm-bundle/chai';
import '../../../src/observability/app/components/lucene-filter.mjs';

describe('LuceneFilter Component', () => {
  let element;

  beforeEach(() => {
    element = document.createElement('lucene-filter');
    document.body.appendChild(element);
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

  it('has empty filter by default', () => {
    expect(element._filter).to.equal('');
  });

  it('shows input field', async () => {
    await new Promise(resolve => setTimeout(resolve, 10));
    
    const input = element.shadowRoot.querySelector('input[type="text"]');
    expect(input).to.exist;
  });

  it('has placeholder text', async () => {
    await new Promise(resolve => setTimeout(resolve, 10));
    
    const input = element.shadowRoot.querySelector('input[type="text"]');
    expect(input.placeholder).to.exist;
    expect(input.placeholder.length).to.be.greaterThan(0);
  });

  it('shows clear button when filter has value', async () => {
    element.filter = 'session:123';
    await new Promise(resolve => setTimeout(resolve, 10));
    
    const clearButton = element.shadowRoot.querySelector('.clear-btn');
    expect(clearButton).to.exist;
  });

  it('emits filter-change on input', async () => {
    await new Promise(resolve => setTimeout(resolve, 50));

    let emittedFilter = null;
    element.addEventListener('filter-change', (e) => {
      emittedFilter = e.detail.filter;
    });

    const input = element.shadowRoot.querySelector('.filter-input');
    expect(input).to.exist;
    input.value = 'type:USER_REQUEST';
    
    // Create and dispatch a proper input event
    const inputEvent = new InputEvent('input', {
      bubbles: true,
      cancelable: true,
      data: 'type:USER_REQUEST'
    });
    input.dispatchEvent(inputEvent);

    await new Promise(resolve => setTimeout(resolve, 350)); // Wait for debounce
    expect(emittedFilter).to.equal('type:USER_REQUEST');
  });

  it('emits filter-clear when clicking clear button', async () => {
    element.filter = 'session:123';
    await new Promise(resolve => setTimeout(resolve, 10));

    let clearFired = false;
    element.addEventListener('filter-clear', () => {
      clearFired = true;
    });

    const clearButton = element.shadowRoot.querySelector('.clear-btn');
    clearButton.click();

    expect(clearFired).to.be.true;
  });

  it('updates filter via setter', () => {
    element.filter = 'session:456';
    expect(element._filter).to.equal('session:456');
  });

  it('reflects filter value in input', async () => {
    element.filter = 'session:456';
    await new Promise(resolve => setTimeout(resolve, 10));

    const input = element.shadowRoot.querySelector('.filter-input');
    expect(input.value).to.equal('session:456');
  });
});
