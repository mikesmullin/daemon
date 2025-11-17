import { playwrightLauncher } from '@web/test-runner-playwright';

/**
 * Web Test Runner configuration for component unit tests
 * @see https://modern-web.dev/docs/test-runner/overview/
 */
export default {
  files: 'tests/unit/components/**/*.test.mjs',
  
  nodeResolve: true,
  
  // Use Playwright for browser testing
  browsers: [
    playwrightLauncher({ product: 'chromium' }),
  ],
  
  // Code coverage configuration
  coverage: true,
  coverageConfig: {
    report: true,
    reportDir: 'coverage',
    threshold: {
      statements: 60,
      branches: 50,
      functions: 60,
      lines: 60,
    },
  },
  
  // Test framework configuration
  testFramework: {
    config: {
      timeout: 5000,
    },
  },
  
  // Server configuration
  port: 8001,
  
  // Middleware to serve files
  middleware: [
    function rewriteImports(context, next) {
      // Allow importing .mjs files as modules
      if (context.url.endsWith('.mjs')) {
        context.set('Content-Type', 'application/javascript');
      }
      return next();
    },
  ],
};
