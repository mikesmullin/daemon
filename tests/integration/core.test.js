import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { mainLoop } from '../../daemon/main-loop.mjs';
import { globals } from '../../common/globals.mjs';
import { Utils } from '../../common/utils.mjs';

describe('Core Loop Integration', () => {
  beforeAll(async () => {
    // Mock config
    globals.config = { app: { concurrencyLimit: 5, tickInterval: 10 } };
    // Disable logging for tests to keep output clean
    Utils.shouldLog = () => false; 
    await mainLoop.start();
  });

  afterAll(async () => {
    await mainLoop.stop();
  });

  it('should process commands', async () => {
    globals.enqueueCommand('set app.test true');
    
    // Wait for processing
    await new Promise(resolve => setTimeout(resolve, 100));
    
    expect(globals.getConfig('app.test')).toBe('true');
  });

  it('should pause and resume', async () => {
    globals.enqueueCommand('pause');
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(globals.isPaused).toBe(true);
    
    // Enqueue a normal command, should NOT be processed
    globals.enqueueCommand('set app.pausedTest true');
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(globals.getConfig('app.pausedTest')).toBeUndefined();
    
    // Enqueue continue, should be processed
    globals.enqueueCommand('continue');
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(globals.isPaused).toBe(false);
    
    // Now the normal command should be processed
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(globals.getConfig('app.pausedTest')).toBe('true');
  });
});
