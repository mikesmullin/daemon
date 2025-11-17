import { test, expect } from '@playwright/test';

/**
 * Visual regression tests using Playwright screenshots
 * Captures and compares screenshots of key UI states
 */

test.describe('Visual Regression Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(1000); // Wait for initial load
  });

  test('captures full page layout', async ({ page }) => {
    await expect(page).toHaveScreenshot('full-page-initial.png', {
      fullPage: true,
      animations: 'disabled',
    });
  });

  test('captures channels sidebar', async ({ page }) => {
    const channelList = page.locator('channel-list');
    await expect(channelList).toHaveScreenshot('channel-list.png');
  });

  test('captures thread view empty state', async ({ page }) => {
    // Ensure no channel is selected
    await page.evaluate(() => {
      const app = window.Alpine?.store('app');
      if (app) {
        app.currentChannel = null;
      }
    });
    
    await page.waitForTimeout(300);
    
    const threadView = page.locator('thread-view');
    await expect(threadView).toHaveScreenshot('thread-view-empty.png');
  });

  test('captures agent list', async ({ page }) => {
    // Select a channel first if possible
    const channels = await page.evaluate(() => {
      return window.Alpine?.store('app')?.channels || [];
    });
    
    if (channels.length > 0) {
      await page.evaluate((channelName) => {
        const app = window.Alpine?.store('app');
        if (app) {
          app.currentChannel = channelName;
        }
      }, channels[0].metadata?.name);
      
      await page.waitForTimeout(500);
    }
    
    const agentList = page.locator('agent-list');
    await expect(agentList).toHaveScreenshot('agent-list.png');
  });

  test('captures filter bar', async ({ page }) => {
    const filter = page.locator('lucene-filter');
    
    if (await filter.count() > 0) {
      await expect(filter).toHaveScreenshot('lucene-filter.png');
      
      // With text in filter
      const input = filter.locator('input');
      if (await input.count() > 0) {
        await input.fill('session:12 AND type:USER_REQUEST');
        await page.waitForTimeout(200);
        await expect(filter).toHaveScreenshot('lucene-filter-filled.png');
      }
    }
  });

  test('captures message input area', async ({ page }) => {
    const messageInput = page.locator('message-input');
    await expect(messageInput).toHaveScreenshot('message-input.png');
  });

  test('captures with channel selected', async ({ page }) => {
    const channels = await page.evaluate(() => {
      return window.Alpine?.store('app')?.channels || [];
    });
    
    if (channels.length > 0) {
      const channelName = channels[0].metadata?.name;
      
      await page.evaluate((name) => {
        const app = window.Alpine?.store('app');
        if (app) {
          app.currentChannel = name;
        }
      }, channelName);
      
      await page.waitForTimeout(500);
      
      await expect(page).toHaveScreenshot('page-with-channel-selected.png', {
        fullPage: true,
        animations: 'disabled',
      });
    }
  });

  test('captures sidebar collapsed state', async ({ page }) => {
    // Toggle sidebar
    await page.evaluate(() => {
      const app = window.Alpine?.store('app');
      if (app) {
        app.channelsSidebarOpen = false;
      }
    });
    
    await page.waitForTimeout(300);
    
    await expect(page).toHaveScreenshot('sidebar-collapsed.png', {
      fullPage: true,
      animations: 'disabled',
    });
  });

  test('captures connection states', async ({ page }) => {
    // Disconnected state
    await page.evaluate(() => {
      const app = window.Alpine?.store('app');
      if (app) {
        app.wsState = 'disconnected';
      }
    });
    
    await page.waitForTimeout(200);
    const statusDisconnected = page.locator('.connection-status');
    await expect(statusDisconnected).toHaveScreenshot('connection-disconnected.png');
    
    // Connecting state
    await page.evaluate(() => {
      const app = window.Alpine?.store('app');
      if (app) {
        app.wsState = 'connecting';
      }
    });
    
    await page.waitForTimeout(200);
    await expect(statusDisconnected).toHaveScreenshot('connection-connecting.png');
    
    // Connected state
    await page.evaluate(() => {
      const app = window.Alpine?.store('app');
      if (app) {
        app.wsState = 'connected';
      }
    });
    
    await page.waitForTimeout(200);
    await expect(statusDisconnected).toHaveScreenshot('connection-connected.png');
  });
});

test.describe('Visual Regression - Dark Theme', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(1000);
    
    // Force dark theme if not already applied
    await page.evaluate(() => {
      document.documentElement.classList.add('dark');
    });
    
    await page.waitForTimeout(200);
  });

  test('captures dark theme full page', async ({ page }) => {
    await expect(page).toHaveScreenshot('dark-theme-full-page.png', {
      fullPage: true,
      animations: 'disabled',
    });
  });

  test('captures dark theme components', async ({ page }) => {
    const channelList = page.locator('channel-list');
    await expect(channelList).toHaveScreenshot('dark-theme-channel-list.png');
    
    const threadView = page.locator('thread-view');
    await expect(threadView).toHaveScreenshot('dark-theme-thread-view.png');
    
    const agentList = page.locator('agent-list');
    await expect(agentList).toHaveScreenshot('dark-theme-agent-list.png');
  });
});

test.describe('Visual Regression - Responsive', () => {
  test('captures mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 }); // iPhone SE
    await page.goto('/');
    await page.waitForTimeout(1000);
    
    await expect(page).toHaveScreenshot('mobile-viewport.png', {
      fullPage: true,
      animations: 'disabled',
    });
  });

  test('captures tablet viewport', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 }); // iPad
    await page.goto('/');
    await page.waitForTimeout(1000);
    
    await expect(page).toHaveScreenshot('tablet-viewport.png', {
      fullPage: true,
      animations: 'disabled',
    });
  });

  test('captures desktop viewport', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 }); // Full HD
    await page.goto('/');
    await page.waitForTimeout(1000);
    
    await expect(page).toHaveScreenshot('desktop-viewport.png', {
      fullPage: true,
      animations: 'disabled',
    });
  });
});
