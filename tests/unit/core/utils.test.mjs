import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { log, readYaml, writeYaml } from '../../../src/lib/utils.mjs';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

describe('utils', () => {
  describe('log', () => {
    test('logs info message', () => {
      // Just test that it doesn't throw
      expect(() => log('info', 'Test message')).not.toThrow();
    });

    test('logs debug message', () => {
      expect(() => log('debug', 'Test debug')).not.toThrow();
    });

    test('logs error message', () => {
      expect(() => log('error', 'Test error')).not.toThrow();
    });

    test('logs warn message', () => {
      expect(() => log('warn', 'Test warning')).not.toThrow();
    });
  });

  describe('readYaml', () => {
    let tempDir;

    beforeEach(() => {
      tempDir = mkdtempSync(join(tmpdir(), 'daemon-test-'));
    });

    afterEach(() => {
      if (tempDir) {
        rmSync(tempDir, { recursive: true, force: true });
      }
    });

    test('reads YAML file', async () => {
      const testFile = join(tempDir, 'test.yaml');
      const testData = { foo: 'bar', nested: { key: 'value' } };
      
      await writeYaml(testFile, testData);
      const result = await readYaml(testFile);
      
      expect(result).toEqual(testData);
    });

    test('throws when file not found and okToFail is true', async () => {
      await expect(readYaml(join(tempDir, 'nonexistent.yaml'), true)).rejects.toThrow();
    });
  });

  describe('writeYaml', () => {
    let tempDir;

    beforeEach(() => {
      tempDir = mkdtempSync(join(tmpdir(), 'daemon-test-'));
    });

    afterEach(() => {
      if (tempDir) {
        rmSync(tempDir, { recursive: true, force: true });
      }
    });

    test('writes YAML file', async () => {
      const testFile = join(tempDir, 'test.yaml');
      const testData = { foo: 'bar', array: [1, 2, 3] };
      
      await writeYaml(testFile, testData);
      const result = await readYaml(testFile);
      
      expect(result).toEqual(testData);
    });

    test('creates parent directories if needed', async () => {
      const testFile = join(tempDir, 'nested', 'dir', 'test.yaml');
      const testData = { created: 'in nested dir' };
      
      await writeYaml(testFile, testData);
      const result = await readYaml(testFile);
      
      expect(result).toEqual(testData);
    });
  });
});
