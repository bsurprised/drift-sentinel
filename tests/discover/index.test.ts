import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { discoverDocs, type DiscoverOptions } from '../../src/discover/index.js';

const DEFAULT_EXCLUDE = [
  '**/node_modules/**',
  '**/dist/**',
  '**/build/**',
  '**/target/**',
  '**/.git/**',
  '**/vendor/**',
];

const DEFAULT_INCLUDE = [
  '**/*.md',
  '**/*.mdx',
  '**/README*',
  '**/CHANGELOG*',
  '**/CONTRIBUTING*',
];

function makeOptions(root: string, overrides?: Partial<DiscoverOptions>): DiscoverOptions {
  return {
    root,
    include: overrides?.include ?? DEFAULT_INCLUDE,
    exclude: overrides?.exclude ?? DEFAULT_EXCLUDE,
    ignorePaths: overrides?.ignorePaths ?? [],
  };
}

async function createFile(base: string, relPath: string, content = ''): Promise<void> {
  const full = join(base, relPath);
  await mkdir(join(full, '..'), { recursive: true });
  await writeFile(full, content || `# ${relPath}\nSample content.\n`, 'utf-8');
}

describe('discoverDocs', () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'drift-test-'));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('discovers .md and .mdx files in root and subdirectories', async () => {
    await createFile(root, 'README.md');
    await createFile(root, 'docs/guide.md');
    await createFile(root, 'docs/api.mdx');

    const results = await discoverDocs(makeOptions(root));

    expect(results).toHaveLength(3);
    const paths = results.map((r) => r.path);
    expect(paths).toContain(resolve(root, 'README.md'));
    expect(paths).toContain(resolve(root, 'docs/guide.md'));
    expect(paths).toContain(resolve(root, 'docs/api.mdx'));
  });

  it('excludes node_modules by default', async () => {
    await createFile(root, 'README.md');
    await createFile(root, 'node_modules/pkg/README.md');

    const results = await discoverDocs(makeOptions(root));

    expect(results).toHaveLength(1);
    expect(results[0].path).toBe(resolve(root, 'README.md'));
  });

  it('excludes dist, build, target, .git, and vendor by default', async () => {
    await createFile(root, 'README.md');
    await createFile(root, 'dist/docs.md');
    await createFile(root, 'build/output.md');
    await createFile(root, 'target/doc.md');
    await createFile(root, '.git/info.md');
    await createFile(root, 'vendor/lib.md');

    const results = await discoverDocs(makeOptions(root));

    expect(results).toHaveLength(1);
    expect(results[0].path).toBe(resolve(root, 'README.md'));
  });

  it('respects custom ignorePaths', async () => {
    await createFile(root, 'README.md');
    await createFile(root, 'docs/guide.md');
    await createFile(root, 'docs/internal/secret.md');

    const results = await discoverDocs(
      makeOptions(root, { ignorePaths: ['docs/internal/**'] }),
    );

    expect(results).toHaveLength(2);
    const paths = results.map((r) => r.path);
    expect(paths).not.toContain(resolve(root, 'docs/internal/secret.md'));
  });

  it('returns correct type classification for .md and .mdx', async () => {
    await createFile(root, 'guide.md');
    await createFile(root, 'api.mdx');

    const results = await discoverDocs(makeOptions(root));

    expect(results).toHaveLength(2);
    for (const r of results) {
      expect(r.type).toBe('markdown');
    }
  });

  it('reads file content correctly', async () => {
    const content = '# Hello World\n\nThis is a test document.\n';
    await createFile(root, 'test.md', content);

    const results = await discoverDocs(makeOptions(root));

    expect(results).toHaveLength(1);
    expect(results[0].content).toBe(content);
  });

  it('handles empty directories gracefully', async () => {
    await mkdir(join(root, 'empty-dir'), { recursive: true });

    const results = await discoverDocs(makeOptions(root));

    expect(results).toHaveLength(0);
  });

  it('returns results sorted by path', async () => {
    await createFile(root, 'z-last.md');
    await createFile(root, 'a-first.md');
    await createFile(root, 'm-middle.md');

    const results = await discoverDocs(makeOptions(root));

    expect(results).toHaveLength(3);
    const paths = results.map((r) => r.path);
    const sorted = [...paths].sort();
    expect(paths).toEqual(sorted);
  });

  it('throws for non-existent root path', async () => {
    const badRoot = join(root, 'does-not-exist');

    await expect(discoverDocs(makeOptions(badRoot))).rejects.toThrow(
      /Root path does not exist/,
    );
  });

  it('does not discover non-markdown files with default include', async () => {
    await createFile(root, 'README.md');
    await createFile(root, 'src/index.ts', 'export const x = 1;');
    await createFile(root, 'src/styles.css', 'body {}');

    const results = await discoverDocs(makeOptions(root));

    expect(results).toHaveLength(1);
    expect(results[0].path).toBe(resolve(root, 'README.md'));
  });

  it('truncates content for files exceeding 1MB', async () => {
    const bigContent = 'x'.repeat(1_100_000);
    await createFile(root, 'big.md', bigContent);

    const results = await discoverDocs(makeOptions(root));

    expect(results).toHaveLength(1);
    expect(results[0].content.length).toBe(1_048_576);
  });

  it('uses custom include patterns', async () => {
    await createFile(root, 'notes.txt', 'notes');
    await createFile(root, 'guide.md');

    const results = await discoverDocs(
      makeOptions(root, { include: ['**/*.md'] }),
    );

    expect(results).toHaveLength(1);
    expect(results[0].path).toBe(resolve(root, 'guide.md'));
  });

  it('stores absolute paths in DocSource.path', async () => {
    await createFile(root, 'README.md');

    const results = await discoverDocs(makeOptions(root));

    expect(results).toHaveLength(1);
    expect(results[0].path).toBe(resolve(root, 'README.md'));
  });
});



