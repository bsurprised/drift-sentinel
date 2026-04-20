import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, writeFile, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { LinkFileVerifier, headingToAnchor, extractAnchors } from '../../src/verifiers/link-file.js';
import type { DocReference, ProjectContext, SymbolResolver } from '../../src/types.js';

let tempDir: string;

const ctx: ProjectContext = {
  root: '/fake/project',
  detectedLanguages: ['typescript'],
  makefileTargets: [],
};

const resolvers = new Map<string, SymbolResolver>();

function makeRef(sourcePath: string, target: string): DocReference {
  return {
    id: 'test-file-link',
    source: { path: sourcePath, line: 5, column: 1 },
    kind: 'link-file',
    target,
    context: `[link](${target})`,
  };
}

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'drift-file-'));
  await mkdir(join(tempDir, 'docs', 'guides'), { recursive: true });
  await mkdir(join(tempDir, 'src'), { recursive: true });

  await writeFile(
    join(tempDir, 'docs', 'api.md'),
    `# API Reference

## Users

### Create User

Some content here.

## Orders

### List Orders
`,
  );

  await writeFile(
    join(tempDir, 'docs', 'guides', 'getting-started.md'),
    `# Getting Started

## Installation

Install the package.

## Configuration

<div id="custom-anchor"></div>

Configure settings.
`,
  );

  await writeFile(join(tempDir, 'src', 'index.ts'), `export const VERSION = '1.0.0';\n`);
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe('headingToAnchor', () => {
  it('converts heading to lowercase dash-separated slug', () => {
    expect(headingToAnchor('Create User')).toBe('create-user');
  });

  it('strips non-alphanumeric chars except dashes', () => {
    expect(headingToAnchor('API Reference (v2)')).toBe('api-reference-v2');
  });

  it('collapses multiple spaces into single dash', () => {
    expect(headingToAnchor('Some   Heading')).toBe('some-heading');
  });
});

describe('extractAnchors', () => {
  it('extracts markdown heading anchors', () => {
    const content = '# Hello\n## World\n### Foo Bar';
    const anchors = extractAnchors(content);
    expect(anchors).toContain('hello');
    expect(anchors).toContain('world');
    expect(anchors).toContain('foo-bar');
  });

  it('extracts HTML id attributes', () => {
    const content = '<div id="custom-id"></div>\n<span id=\'other-id\'></span>';
    const anchors = extractAnchors(content);
    expect(anchors).toContain('custom-id');
    expect(anchors).toContain('other-id');
  });
});

describe('LinkFileVerifier', () => {
  it('returns null when file exists', async () => {
    const verifier = new LinkFileVerifier();
    const ref = makeRef(join(tempDir, 'docs', 'README.md'), './api.md');
    const result = await verifier.check(ref, ctx, resolvers);
    expect(result).toBeNull();
  });

  it('returns HIGH when file is missing', async () => {
    const verifier = new LinkFileVerifier();
    const ref = makeRef(join(tempDir, 'docs', 'README.md'), './nonexistent.md');
    const result = await verifier.check(ref, ctx, resolvers);
    expect(result).not.toBeNull();
    expect(result!.severity).toBe('high');
    expect(result!.kind).toBe('dead-file-ref');
    expect(result!.message).toContain('does not exist');
  });

  it('returns null when file exists and anchor matches a heading', async () => {
    const verifier = new LinkFileVerifier();
    const ref = makeRef(join(tempDir, 'docs', 'README.md'), './api.md#users');
    const result = await verifier.check(ref, ctx, resolvers);
    expect(result).toBeNull();
  });

  it('returns MEDIUM when file exists but anchor does not match', async () => {
    const verifier = new LinkFileVerifier();
    const ref = makeRef(join(tempDir, 'docs', 'README.md'), './api.md#nonexistent');
    const result = await verifier.check(ref, ctx, resolvers);
    expect(result).not.toBeNull();
    expect(result!.severity).toBe('medium');
    expect(result!.message).toContain('#nonexistent');
  });

  it('handles relative paths from nested doc directories', async () => {
    const verifier = new LinkFileVerifier();
    const ref = makeRef(
      join(tempDir, 'docs', 'guides', 'getting-started.md'),
      '../api.md',
    );
    const result = await verifier.check(ref, ctx, resolvers);
    expect(result).toBeNull();
  });

  it('handles ../ in relative paths', async () => {
    const verifier = new LinkFileVerifier();
    const ref = makeRef(
      join(tempDir, 'docs', 'guides', 'getting-started.md'),
      '../../src/index.ts',
    );
    const result = await verifier.check(ref, ctx, resolvers);
    expect(result).toBeNull();
  });

  it('returns null for non-link-file refs', async () => {
    const verifier = new LinkFileVerifier();
    const ref: DocReference = {
      id: 'test',
      source: { path: join(tempDir, 'docs', 'README.md'), line: 1, column: 1 },
      kind: 'link-external',
      target: 'https://example.com',
      context: '[example](https://example.com)',
    };
    const result = await verifier.check(ref, ctx, resolvers);
    expect(result).toBeNull();
  });

  it('resolves anchor with HTML id attribute', async () => {
    const verifier = new LinkFileVerifier();
    const ref = makeRef(
      join(tempDir, 'docs', 'README.md'),
      './guides/getting-started.md#custom-anchor',
    );
    const result = await verifier.check(ref, ctx, resolvers);
    expect(result).toBeNull();
  });

  it('returns autoFixable false', async () => {
    const verifier = new LinkFileVerifier();
    const ref = makeRef(join(tempDir, 'docs', 'README.md'), './nonexistent.md');
    const result = await verifier.check(ref, ctx, resolvers);
    expect(result).not.toBeNull();
    expect(result!.autoFixable).toBe(false);
  });

  it('provides suggestion for missing file', async () => {
    const verifier = new LinkFileVerifier();
    const ref = makeRef(join(tempDir, 'docs', 'README.md'), './nonexistent.md');
    const result = await verifier.check(ref, ctx, resolvers);
    expect(result).not.toBeNull();
    expect(result!.suggestion).toBeDefined();
  });

  it('matches multi-word heading anchors', async () => {
    const verifier = new LinkFileVerifier();
    const ref = makeRef(join(tempDir, 'docs', 'README.md'), './api.md#create-user');
    const result = await verifier.check(ref, ctx, resolvers);
    expect(result).toBeNull();
  });
});
