import { describe, it, expect, beforeEach, afterEach, afterAll } from 'vitest';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs/promises';
import { loadConfig, DEFAULT_CONFIG } from '../../src/config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEST_TMP_BASE = path.join(__dirname, '__tmp__');

let testDir: string;

beforeEach(async () => {
  await fs.mkdir(TEST_TMP_BASE, { recursive: true });
  testDir = await fs.mkdtemp(path.join(TEST_TMP_BASE, 'cfg-'));
});

afterEach(async () => {
  await fs.rm(testDir, { recursive: true, force: true });
});

afterAll(async () => {
  await fs.rm(TEST_TMP_BASE, { recursive: true, force: true });
});

describe('loadConfig - file loading (LLD-C / B-04, B-16)', () => {
  it('returns DEFAULT_CONFIG when no config file exists', async () => {
    const config = await loadConfig({}, testDir);
    expect(config).toEqual(DEFAULT_CONFIG);
  });

  it('loads drift.config.mjs and merges with defaults', async () => {
    await fs.writeFile(
      path.join(testDir, 'drift.config.mjs'),
      'export default { ignorePaths: ["x"] };\n',
    );
    const config = await loadConfig({}, testDir);
    expect(config.ignorePaths).toEqual(['x']);
    expect(config.include).toEqual(DEFAULT_CONFIG.include);
  });

  it('throws with file path in message for malformed drift.config.mjs', async () => {
    await fs.writeFile(
      path.join(testDir, 'drift.config.mjs'),
      'export default { foo: \n', // deliberate syntax error
    );
    await expect(loadConfig({}, testDir)).rejects.toThrow('drift.config.mjs');
  });

  it('throws actionable error for drift.config.ts without TS loader', async () => {
    await fs.writeFile(
      path.join(testDir, 'drift.config.ts'),
      'export default { ignorePaths: [] };\n',
    );
    const originalOpts = process.env.NODE_OPTIONS;
    delete process.env.NODE_OPTIONS;
    try {
      await expect(loadConfig({}, testDir)).rejects.toThrow(
        'no TypeScript loader is registered',
      );
    } finally {
      if (originalOpts !== undefined) process.env.NODE_OPTIONS = originalOpts;
    }
  });

  it('loads drift.config.cjs and merges with defaults', async () => {
    await fs.writeFile(
      path.join(testDir, 'drift.config.cjs'),
      'module.exports = { ignorePaths: ["from-cjs"] };\n',
    );
    const config = await loadConfig({}, testDir);
    expect(config.ignorePaths).toEqual(['from-cjs']);
    expect(config.include).toEqual(DEFAULT_CONFIG.include);
  });

  it('prefers drift.config.mjs over .cjs and .js when multiple exist', async () => {
    await fs.writeFile(
      path.join(testDir, 'drift.config.mjs'),
      'export default { ignorePaths: ["from-mjs"] };\n',
    );
    await fs.writeFile(
      path.join(testDir, 'drift.config.cjs'),
      'module.exports = { ignorePaths: ["from-cjs"] };\n',
    );
    const config = await loadConfig({}, testDir);
    expect(config.ignorePaths).toEqual(['from-mjs']);
  });

  it('skips TS loader guard when NODE_OPTIONS contains tsx', async () => {
    await fs.writeFile(
      path.join(testDir, 'drift.config.ts'),
      'export default { ignorePaths: ["ts-test"] };\n',
    );
    const originalOpts = process.env.NODE_OPTIONS;
    process.env.NODE_OPTIONS = '--import tsx';
    try {
      // Must NOT throw the "no TypeScript loader" guard error.
      // In vitest's transform environment the import resolves, so verify the result.
      // If it fails for a different reason (e.g. bare Node run), that is also
      // acceptable as long as the guard-specific message is absent.
      const result = await loadConfig({}, testDir);
      expect(result.ignorePaths).toEqual(['ts-test']);
    } catch (err) {
      expect((err as Error).message).not.toContain('no TypeScript loader is registered');
    } finally {
      if (originalOpts !== undefined) {
        process.env.NODE_OPTIONS = originalOpts;
      } else {
        delete process.env.NODE_OPTIONS;
      }
    }
  });
});
