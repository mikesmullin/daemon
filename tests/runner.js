// tests/runner.js - Minimalist test runner for multi-agent system
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Global test state
let currentSuite = null;
let stats = { passed: 0, failed: 0, total: 0 };
let failures = [];

// Test framework functions
global.describe = function (name, fn) {
  const prevSuite = currentSuite;
  currentSuite = name;
  console.log(`\n${name}`);
  try {
    fn();
  } finally {
    currentSuite = prevSuite;
  }
};

global.test = function (name, fn) {
  stats.total++;
  const fullName = currentSuite ? `${currentSuite} > ${name}` : name;

  try {
    fn();
    stats.passed++;
    console.log(`  ✓ ${name}`);
  } catch (error) {
    stats.failed++;
    console.log(`  ✗ ${name}`);
    failures.push({ name: fullName, error });
  }
};

// Async test support
global.testAsync = async function (name, fn) {
  stats.total++;
  const fullName = currentSuite ? `${currentSuite} > ${name}` : name;

  try {
    await fn();
    stats.passed++;
    console.log(`  ✓ ${name}`);
  } catch (error) {
    stats.failed++;
    console.log(`  ✗ ${name}`);
    failures.push({ name: fullName, error });
  }
};

// Simple assertion function
global.expect = function (actual) {
  return {
    toBe(expected) {
      if (actual !== expected) {
        throw new Error(`Expected ${JSON.stringify(expected)} but got ${JSON.stringify(actual)}`);
      }
    },

    toEqual(expected) {
      if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        throw new Error(`Expected ${JSON.stringify(expected)} but got ${JSON.stringify(actual)}`);
      }
    },

    toBeInstanceOf(expectedClass) {
      if (!(actual instanceof expectedClass)) {
        throw new Error(`Expected instance of ${expectedClass.name} but got ${typeof actual}`);
      }
    },

    toHaveProperty(prop) {
      if (!(prop in actual)) {
        throw new Error(`Expected object to have property '${prop}'`);
      }
    },

    toHaveLength(expectedLength) {
      if (actual.length !== expectedLength) {
        throw new Error(`Expected length ${expectedLength} but got ${actual.length}`);
      }
    },

    toBeGreaterThan(expected) {
      if (actual <= expected) {
        throw new Error(`Expected ${actual} to be greater than ${expected}`);
      }
    },

    toBeLessThan(expected) {
      if (actual >= expected) {
        throw new Error(`Expected ${actual} to be less than ${expected}`);
      }
    },

    toBeDefined() {
      if (actual === undefined) {
        throw new Error(`Expected value to be defined but got undefined`);
      }
    },

    toBeUndefined() {
      if (actual !== undefined) {
        throw new Error(`Expected value to be undefined but got ${JSON.stringify(actual)}`);
      }
    },

    toBeNull() {
      if (actual !== null) {
        throw new Error(`Expected null but got ${JSON.stringify(actual)}`);
      }
    },

    toBeTruthy() {
      if (!actual) {
        throw new Error(`Expected value to be truthy but got ${JSON.stringify(actual)}`);
      }
    },

    toBeFalsy() {
      if (actual) {
        throw new Error(`Expected value to be falsy but got ${JSON.stringify(actual)}`);
      }
    },

    toContain(expected) {
      if (typeof actual === 'string') {
        if (!actual.includes(expected)) {
          throw new Error(`Expected string "${actual}" to contain "${expected}"`);
        }
      } else if (Array.isArray(actual)) {
        if (!actual.includes(expected)) {
          throw new Error(`Expected array to contain ${JSON.stringify(expected)}`);
        }
      } else {
        throw new Error(`toContain() can only be used with strings or arrays`);
      }
    },

    toMatch(pattern) {
      if (typeof actual !== 'string') {
        throw new Error(`toMatch() can only be used with strings`);
      }
      if (!pattern.test(actual)) {
        throw new Error(`Expected "${actual}" to match pattern ${pattern}`);
      }
    },

    not: {
      toBe(expected) {
        if (actual === expected) {
          throw new Error(`Expected not to be ${JSON.stringify(expected)} but got ${JSON.stringify(actual)}`);
        }
      },

      toContain(expected) {
        if (typeof actual === 'string') {
          if (actual.includes(expected)) {
            throw new Error(`Expected string "${actual}" not to contain "${expected}"`);
          }
        } else if (Array.isArray(actual)) {
          if (actual.includes(expected)) {
            throw new Error(`Expected array not to contain ${JSON.stringify(expected)}`);
          }
        }
      },

      toEqual(expected) {
        if (JSON.stringify(actual) === JSON.stringify(expected)) {
          throw new Error(`Expected not to equal ${JSON.stringify(expected)}`);
        }
      },

      toBeNull() {
        if (actual === null) {
          throw new Error(`Expected not to be null but got null`);
        }
      },

      toThrow() {
        try {
          if (typeof actual === 'function') {
            actual();
          }
          // Function didn't throw - this is what we wanted for .not.toThrow()
        } catch (error) {
          throw new Error(`Expected function not to throw but it threw: ${error.message}`);
        }
      }
    },

    toThrow(expectedMessage) {
      if (typeof actual !== 'function') {
        throw new Error(`toThrow() can only be used with functions`);
      }

      try {
        actual();
        throw new Error(`Expected function to throw but it didn't`);
      } catch (error) {
        if (expectedMessage && !error.message.includes(expectedMessage)) {
          throw new Error(`Expected error message to contain "${expectedMessage}" but got "${error.message}"`);
        }
        // Success - function threw as expected
      }
    }
  };
};

// Find and run all test files
async function runTests() {
  const testDirs = [
    { name: 'unit', path: path.join(__dirname, 'unit') },
    { name: 'integration', path: path.join(__dirname, 'integration') }
  ];

  console.log('🧪 Running Multi-Agent System Tests\n');
  console.log('='.repeat(50));

  for (const { name, path: testDir } of testDirs) {
    if (!fs.existsSync(testDir)) {
      continue;
    }

    const files = fs.readdirSync(testDir).filter(f => f.endsWith('.test.js'));

    for (const file of files) {
      const testPath = path.join(testDir, file);
      console.log(`\n📁 ${file}`);
      try {
        await import(`file://${testPath}`);
      } catch (error) {
        stats.failed++;
        stats.total++;
        console.log(`  ✗ Failed to load test file: ${error.message}`);
        failures.push({ name: file, error });
      }
    }
  }

  // Print summary
  console.log('\n' + '='.repeat(50));
  console.log(`\n📊 Test Results:`);
  console.log(`   Total:  ${stats.total}`);
  console.log(`   Passed: ${stats.passed} ✓`);
  console.log(`   Failed: ${stats.failed} ${stats.failed > 0 ? '✗' : ''}`);

  if (failures.length > 0) {
    console.log('\n❌ Failures:\n');
    failures.forEach(failure => {
      console.log(`   ${failure.name}`);
      console.log(`   → ${failure.error.message}\n`);
    });
    console.log('='.repeat(50));
    process.exit(1);
  } else {
    console.log('\n🎉 All tests passed!');
    console.log('='.repeat(50));
    process.exit(0);
  }
}

// Run the tests
runTests().catch(error => {
  console.error('❌ Test runner failed:', error);
  process.exit(1);
});
