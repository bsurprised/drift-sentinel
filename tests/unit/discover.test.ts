import { describe, it, expect, beforeEach, afterEach, afterAll } from 'vitest';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs/promises';
import { discoverDocs } from '../../src/discover/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEST_TMP_BASE = path.join(__dirname, '__tmp_discover__');

let testDir: string;

function makeOptions(overrides: { include?: string[] } = {}) {
  return {
    root: testDir,
    include: overrides.include ?? ['**/*'],
    exclude: ['**/node_modules/**'],
    ignorePaths: [],
  };
}

beforeEach(async () => {
  await fs.mkdir(TEST_TMP_BASE, { recursive: true });
  testDir = await fs.mkdtemp(path.join(TEST_TMP_BASE, 'disc-'));
});

afterEach(async () => {
  await fs.rm(testDir, { recursive: true, force: true });
});

afterAll(async () => {
  await fs.rm(TEST_TMP_BASE, { recursive: true, force: true });
});

describe('discoverDocs – extensionless well-known docs (LLD-D / B-18)', () => {
  it('picks up extensionless README as markdown', async () => {
    await fs.writeFile(path.join(testDir, 'README'), '# Hello');
    const sources = await discoverDocs(makeOptions({ include: ['README'] }));
    expect(sources).toHaveLength(1);
    expect(sources[0].type).toBe('markdown');
    expect(path.basename(sources[0].path)).toBe('README');
  });

  it('picks up extensionless CHANGELOG as markdown', async () => {
    await fs.writeFile(path.join(testDir, 'CHANGELOG'), '## v1.0.0');
    const sources = await discoverDocs(makeOptions({ include: ['CHANGELOG'] }));
    expect(sources).toHaveLength(1);
    expect(sources[0].type).toBe('markdown');
  });

  it('picks up extensionless CONTRIBUTING as markdown', async () => {
    await fs.writeFile(path.join(testDir, 'CONTRIBUTING'), '# Contributing');
    const sources = await discoverDocs(makeOptions({ include: ['CONTRIBUTING'] }));
    expect(sources).toHaveLength(1);
    expect(sources[0].type).toBe('markdown');
  });

  it('picks up extensionless LICENSE as markdown', async () => {
    await fs.writeFile(path.join(testDir, 'LICENSE'), 'MIT License');
    const sources = await discoverDocs(makeOptions({ include: ['LICENSE'] }));
    expect(sources).toHaveLength(1);
    expect(sources[0].type).toBe('markdown');
  });

  it('picks up extensionless NOTICE as markdown', async () => {
    await fs.writeFile(path.join(testDir, 'NOTICE'), 'NOTICE content');
    const sources = await discoverDocs(makeOptions({ include: ['NOTICE'] }));
    expect(sources).toHaveLength(1);
    expect(sources[0].type).toBe('markdown');
  });

  it('picks up extensionless AUTHORS as markdown', async () => {
    await fs.writeFile(path.join(testDir, 'AUTHORS'), 'Author Name');
    const sources = await discoverDocs(makeOptions({ include: ['AUTHORS'] }));
    expect(sources).toHaveLength(1);
    expect(sources[0].type).toBe('markdown');
  });

  it('still classifies .md files as markdown', async () => {
    await fs.writeFile(path.join(testDir, 'docs.md'), '# Docs');
    const sources = await discoverDocs(makeOptions({ include: ['**/*.md'] }));
    expect(sources).toHaveLength(1);
    expect(sources[0].type).toBe('markdown');
  });

  it('ignores unknown extensionless files', async () => {
    await fs.writeFile(path.join(testDir, 'somefile'), 'content');
    const sources = await discoverDocs(makeOptions({ include: ['somefile'] }));
    expect(sources).toHaveLength(0);
  });
});
