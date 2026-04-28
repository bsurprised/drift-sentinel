import { describe, it, expect, beforeEach, afterEach, afterAll } from 'vitest';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs/promises';
import {
  LinkFileVerifier,
  decodeAndStripQuery,
  ROOT_ALLOWLIST,
} from '../../../src/verifiers/link-file.js';
import type { DocReference, ProjectContext } from '../../../src/types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEST_TMP_BASE = path.join(__dirname, '__tmp__');

let testDir: string;

function makeCtx(overrides: Partial<ProjectContext> = {}): ProjectContext {
  return {
    root: testDir,
    makefileTargets: [],
    detectedLanguages: [],
    ...overrides,
  };
}

function makeRef(overrides: Partial<DocReference> = {}): DocReference {
  return {
    id: 'test-ref',
    source: { path: path.join(testDir, 'docs', 'foo.md'), line: 1, column: 1 },
    kind: 'link-file',
    target: 'package.json',
    context: '',
    origin: 'inline-code',
    ...overrides,
  };
}

beforeEach(async () => {
  await fs.mkdir(TEST_TMP_BASE, { recursive: true });
  testDir = await fs.mkdtemp(path.join(TEST_TMP_BASE, 'lf-'));
  await fs.mkdir(path.join(testDir, 'docs'), { recursive: true });
});

afterEach(async () => {
  await fs.rm(testDir, { recursive: true, force: true });
});

afterAll(async () => {
  await fs.rm(TEST_TMP_BASE, { recursive: true, force: true });
});

describe('decodeAndStripQuery', () => {
  it('strips query string', () => {
    expect(decodeAndStripQuery('./file.md?plain=1')).toBe('./file.md');
  });

  it('decodes URL-encoded characters', () => {
    expect(decodeAndStripQuery('./My%20File.md')).toBe('./My File.md');
  });

  it('handles both query and encoding together', () => {
    expect(decodeAndStripQuery('./My%20File.md?plain=1')).toBe('./My File.md');
  });

  it('returns plain strings unchanged', () => {
    expect(decodeAndStripQuery('./normal.md')).toBe('./normal.md');
  });
});

describe('ROOT_ALLOWLIST', () => {
  it('contains package.json', () => {
    expect(ROOT_ALLOWLIST.has('package.json')).toBe(true);
  });
  it('contains tsconfig.json', () => {
    expect(ROOT_ALLOWLIST.has('tsconfig.json')).toBe(true);
  });
});

describe('LinkFileVerifier', () => {
  const verifier = new LinkFileVerifier();

  it('returns null for non link-file refs', async () => {
    const ref = makeRef({ kind: 'link-external', target: 'https://example.com' });
    const result = await verifier.check(ref, makeCtx(), new Map());
    expect(result).toBeNull();
  });

  it('inline-code package.json exists at root → no issue (tier 2)', async () => {
    await fs.writeFile(path.join(testDir, 'package.json'), '{}');
    const ref = makeRef({ target: 'package.json', origin: 'inline-code' });
    const result = await verifier.check(ref, makeCtx(), new Map());
    expect(result).toBeNull();
  });

  it('inline-code tsconfig.json in docs/ → no issue (tier 2: root)', async () => {
    await fs.writeFile(path.join(testDir, 'tsconfig.json'), '{}');
    const ref = makeRef({ target: 'tsconfig.json', origin: 'inline-code' });
    const result = await verifier.check(ref, makeCtx(), new Map());
    expect(result).toBeNull();
  });

  it('markdown-link ./does-not-exist.md → dead-file-ref (strict mode)', async () => {
    const ref = makeRef({
      target: './does-not-exist.md',
      origin: 'markdown-link',
    });
    const result = await verifier.check(ref, makeCtx(), new Map());
    expect(result?.kind).toBe('dead-file-ref');
  });

  it('inline-code notreal.json not tracked → dead-file-ref', async () => {
    const ref = makeRef({ target: 'notreal.json', origin: 'inline-code' });
    const ctx = makeCtx({ findFilesByBasename: async () => [] });
    const result = await verifier.check(ref, ctx, new Map());
    expect(result?.kind).toBe('dead-file-ref');
  });

  it('inline-code unique-thing.md tracked exactly once → no issue (tier 4)', async () => {
    const ref = makeRef({ target: 'unique-thing.md', origin: 'inline-code' });
    const ctx = makeCtx({
      findFilesByBasename: async (name: string) =>
        name === 'unique-thing.md' ? ['subdir/unique-thing.md'] : [],
    });
    const result = await verifier.check(ref, ctx, new Map());
    expect(result).toBeNull();
  });

  it('inline-code ambiguous.md tracked multiple times → dead-file-ref', async () => {
    const ref = makeRef({ target: 'ambiguous.md', origin: 'inline-code' });
    const ctx = makeCtx({
      findFilesByBasename: async (name: string) =>
        name === 'ambiguous.md'
          ? ['subdir/ambiguous.md', 'other/ambiguous.md']
          : [],
    });
    const result = await verifier.check(ref, ctx, new Map());
    expect(result?.kind).toBe('dead-file-ref');
  });

  it('markdown-link ./My%20File.md resolves to existing "My File.md" → no issue', async () => {
    await fs.writeFile(path.join(testDir, 'docs', 'My File.md'), '# hello');
    const ref = makeRef({ target: './My%20File.md', origin: 'markdown-link' });
    const result = await verifier.check(ref, makeCtx(), new Map());
    expect(result).toBeNull();
  });

  it('markdown-link ./other.md?plain=1 resolves to existing other.md → no issue', async () => {
    await fs.writeFile(path.join(testDir, 'docs', 'other.md'), '# hello');
    const ref = makeRef({ target: './other.md?plain=1', origin: 'markdown-link' });
    const result = await verifier.check(ref, makeCtx(), new Map());
    expect(result).toBeNull();
  });

  it('ref with no origin falls back to strict (markdown-link) semantics', async () => {
    const ref: DocReference = {
      id: 'r',
      source: { path: path.join(testDir, 'docs', 'foo.md'), line: 1, column: 1 },
      kind: 'link-file',
      target: './missing.md',
      context: '',
      // origin intentionally omitted
    };
    const result = await verifier.check(ref, makeCtx(), new Map());
    expect(result?.kind).toBe('dead-file-ref');
  });

  it('doc-relative file that exists → no issue (tier 1)', async () => {
    await fs.writeFile(path.join(testDir, 'docs', 'sibling.md'), '# hi');
    const ref = makeRef({ target: './sibling.md', origin: 'markdown-link' });
    const result = await verifier.check(ref, makeCtx(), new Map());
    expect(result).toBeNull();
  });

  it('anchor check: valid anchor → no issue', async () => {
    await fs.writeFile(path.join(testDir, 'docs', 'guide.md'), '# Installation\n\nsome text');
    const ref = makeRef({ target: './guide.md#installation', origin: 'markdown-link' });
    const result = await verifier.check(ref, makeCtx(), new Map());
    expect(result).toBeNull();
  });

  it('anchor check: missing anchor → medium severity issue', async () => {
    await fs.writeFile(path.join(testDir, 'docs', 'guide.md'), '# Installation\n\nsome text');
    const ref = makeRef({ target: './guide.md#no-such-heading', origin: 'markdown-link' });
    const result = await verifier.check(ref, makeCtx(), new Map());
    expect(result?.kind).toBe('dead-file-ref');
    expect(result?.severity).toBe('medium');
  });
});
