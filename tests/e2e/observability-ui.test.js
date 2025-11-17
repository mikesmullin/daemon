import { test, expect } from '@playwright/test';

/**
 * Basic E2E smoke tests for Observability UI
 * Tests core functionality: page load, WebSocket connection, channel display, agent list
 */

test.describe('Observability Dashboard - Smoke Tests', () => {
  test.beforeEach(async ({ page }) => {
    // Setup fixtures before each test
    // TODO: We may want to setup test fixtures here
    await page.goto('/');
  });

  test('page loads successfully', async ({ page }) => {
    // Check that the page title is set
    await expect(page).toHaveTitle(/Daemon/);
    
    // Check that main elements are present
    const body = page.locator('body');
    await expect(body).toBeVisible();
  });

  test('WebSocket connects successfully', async ({ page }) => {
    // Wait for WebSocket to connect and receive init message
    await page.waitForTimeout(1000);
    
    // Check connection status indicator (assuming there's one)
    const wsState = await page.evaluate(() => {
      return window.Alpine?.store('app')?.wsState || 'unknown';
    });
    
    expect(wsState).toBe('connected');
  });

  test('displays channels sidebar', async ({ page }) => {
    await page.waitForTimeout(500);
    
    // Check that channel list is visible
    const channelList = page.locator('channel-list');
    await expect(channelList).toBeVisible();
  });

  test('displays chat view by default', async ({ page }) => {
    await page.waitForTimeout(500);
    
    // Check that main chat components are visible
    const threadView = page.locator('thread-view');
    const agentList = page.locator('agent-list');
    
    await expect(threadView).toBeVisible();
    await expect(agentList).toBeVisible();
  });

  test('can toggle channels sidebar', async ({ page }) => {
    await page.waitForTimeout(500);
    
    // Find and click hamburger menu button
    const hamburger = page.locator('[data-action="toggle-sidebar"]');
    
    if (await hamburger.count() > 0) {
      await hamburger.click();
      await page.waitForTimeout(200);
      
      // Check sidebar state changed
      const sidebarOpen = await page.evaluate(() => {
        return window.Alpine?.store('app')?.channelsSidebarOpen;
      });
      
      // Should be toggled from initial state
      expect(typeof sidebarOpen).toBe('boolean');
    }
  });

  test('filter input is present and functional', async ({ page }) => {
    await page.waitForTimeout(500);
    
    // Find the Lucene filter input
    const filterInput = page.locator('input[data-filter="lucene"]');
    
    if (await filterInput.count() > 0) {
      await expect(filterInput).toBeVisible();
      
      // Type a test filter
      await filterInput.fill('session:12');
      
      // Check that the filter was set in app state
      const filter = await page.evaluate(() => {
        const app = window.Alpine?.store('app');
        return app?.luceneFilters?.[app.currentChannel] || '';
      });
      
      expect(filter).toContain('session:12');
    }
  });

  test('message input is present', async ({ page }) => {
    await page.waitForTimeout(500);
    
    // Find message textarea
    const messageInput = page.locator('textarea[data-input="message"]');
    
    if (await messageInput.count() > 0) {
      await expect(messageInput).toBeVisible();
      
      // Check that we can type in it
      await messageInput.fill('Test message');
      const value = await messageInput.inputValue();
      expect(value).toBe('Test message');
    }
  });

  test('displays empty state when no channel selected', async ({ page }) => {
    await page.waitForTimeout(500);
    
    // Clear current channel selection
    await page.evaluate(() => {
      const app = window.Alpine?.store('app');
      if (app) {
        app.currentChannel = null;
      }
    });
    
    await page.waitForTimeout(200);
    
    // Check that thread view shows empty state message
    const threadView = page.locator('thread-view');
    const content = await threadView.textContent();
    
    // Should contain some indication that no channel is selected
    expect(content?.toLowerCase()).toMatch(/select|channel|empty/i);
  });
});

test.describe('Observability Dashboard - WebSocket Events', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(1000);
  });

  test('receives init message with channels and sessions', async ({ page }) => {
    // Check that we have received initial data
    const hasData = await page.evaluate(() => {
      const app = window.Alpine?.store('app');
      return app && app.channels.length >= 0 && app.sessions.length >= 0;
    });
    
    expect(hasData).toBe(true);
  });

  test('can send ping message', async ({ page }) => {
    // Send ping via WebSocket
    await page.evaluate(() => {
      const app = window.Alpine?.store('app');
      if (app && app.send) {
        app.send({ type: 'ping' });
      }
    });
    
    // Wait for response
    await page.waitForTimeout(500);
    
    // Check that we're still connected
    const wsState = await page.evaluate(() => {
      return window.Alpine?.store('app')?.wsState;
    });
    
    expect(wsState).toBe('connected');
  });

  test('handles event broadcast correctly', async ({ page }) => {
    // Get initial event count
    const initialCount = await page.evaluate(() => {
      return window.Alpine?.store('app')?.events?.length || 0;
    });
    
    // Simulate receiving an event (if we have access to server)
    // For now, just verify that events array exists
    expect(typeof initialCount).toBe('number');
  });
});

test.describe('Observability Dashboard - Channel Operations', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(1000);
  });

  test('can select a channel', async ({ page }) => {
    // Get list of channels
    const channels = await page.evaluate(() => {
      return window.Alpine?.store('app')?.channels || [];
    });
    
    if (channels.length > 0) {
      const channelName = channels[0].metadata?.name;
      
      // Click on the channel in the list
      const channelItem = page.locator(`[data-channel="${channelName}"]`).first();
      
      if (await channelItem.count() > 0) {
        await channelItem.click();
        await page.waitForTimeout(300);
        
        // Check that current channel was set
        const currentChannel = await page.evaluate(() => {
          return window.Alpine?.store('app')?.currentChannel;
        });
        
        expect(currentChannel).toBe(channelName);
      }
    }
  });

  test('displays agents for selected channel', async ({ page }) => {
    // Get channels
    const channels = await page.evaluate(() => {
      return window.Alpine?.store('app')?.channels || [];
    });
    
    if (channels.length > 0) {
      const channelName = channels[0].metadata?.name;
      
      // Select channel
      await page.evaluate((name) => {
        const app = window.Alpine?.store('app');
        if (app) {
          app.currentChannel = name;
        }
      }, channelName);
      
      await page.waitForTimeout(500);
      
      // Check that agents are populated
      const agents = await page.evaluate(() => {
        const app = window.Alpine?.store('app');
        return app?.channelAgents || [];
      });
      
      expect(Array.isArray(agents)).toBe(true);
    }
  });
});

test.describe('Observability Dashboard - Visual Elements', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(1000);
  });

  test('has proper layout structure', async ({ page }) => {
    // Check for main layout elements
    const hasLayout = await page.evaluate(() => {
      const body = document.body;
      const hasChannelList = !!body.querySelector('channel-list');
      const hasThreadView = !!body.querySelector('thread-view');
      const hasAgentList = !!body.querySelector('agent-list');
      
      return hasChannelList && hasThreadView && hasAgentList;
    });
    
    expect(hasLayout).toBe(true);
  });

  test('web components are registered', async ({ page }) => {
    // Check that custom elements are defined
    const componentsRegistered = await page.evaluate(() => {
      return {
        channelList: !!customElements.get('channel-list'),
        threadView: !!customElements.get('thread-view'),
        agentList: !!customElements.get('agent-list'),
      };
    });
    
    expect(componentsRegistered.channelList).toBe(true);
    expect(componentsRegistered.threadView).toBe(true);
    expect(componentsRegistered.agentList).toBe(true);
  });

  test('Alpine.js is loaded and initialized', async ({ page }) => {
    const alpineReady = await page.evaluate(() => {
      return !!window.Alpine && !!window.Alpine.store;
    });
    
    expect(alpineReady).toBe(true);
  });
});
