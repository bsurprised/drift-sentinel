import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyPatchList } from '../../../src/fixer/index.js';
import { lineHash } from '../../../src/util/lineHash.js';
import type { PatchEntry } from '../../../src/fixer/patch-parser.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEST_TMP_BASE = path.join(__dirname, '__tmp__');

let testDir: string;

beforeAll(async () => {
  await fs.mkdir(TEST_TMP_BASE, { recursive: true });
});

beforeEach(async () => {
  testDir = await fs.mkdtemp(path.join(TEST_TMP_BASE, 'fixer-'));
});

afterEach(async () => {
  await fs.rm(testDir, { recursive: true, force: true });
});

afterAll(async () => {
  await fs.rm(TEST_TMP_BASE, { recursive: true, force: true });
});

function makePatch(overrides: Partial<PatchEntry> & Pick<PatchEntry, 'file' | 'original' | 'replacement'>): PatchEntry {
  return {
    line: 1,
    kind: 'unknown-cli-command',
    applied: false,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// B-07: leading whitespace preserved
// ---------------------------------------------------------------------------
describe('applyPatchList — leading whitespace preserved (B-07)', () => {
  it('replaces indented content without stripping leading spaces', async () => {
    const filePath = path.join(testDir, 'file.md');
    // Line with 4-space-indented content
    await fs.writeFile(filePath, '    foo: bar\n    baz: qux\n', 'utf-8');

    const patches: PatchEntry[] = [
      makePatch({ file: filePath, line: 1, original: '    foo: bar', replacement: '    foo: REPLACED' }),
    ];

    const result = await applyPatchList(patches, testDir);
    expect(result.applied).toBe(1);
    expect(result.skipped).toBe(0);

    const content = await fs.readFile(filePath, 'utf-8');
    expect(content).toBe('    foo: REPLACED\n    baz: qux\n');
  });

  it('does not accidentally match unindented substring when original is indented', async () => {
    const filePath = path.join(testDir, 'file.md');
    // Only the indented "foo" should be replaced, not any bare "foo"
    await fs.writeFile(filePath, 'foo\n    foo\n', 'utf-8');

    const patches: PatchEntry[] = [
      // patch targets line 2 with original = '    foo'
      makePatch({ file: filePath, line: 2, original: '    foo', replacement: '    bar' }),
    ];

    const result = await applyPatchList(patches, testDir);
    expect(result.applied).toBe(1);

    const content = await fs.readFile(filePath, 'utf-8');
    // line 1 ("foo") must remain unchanged; line 2 changed
    expect(content).toBe('foo\n    bar\n');
  });
});

// ---------------------------------------------------------------------------
// B-08: column-anchored matching
// ---------------------------------------------------------------------------
describe('applyPatchList — column-anchored matching (B-08)', () => {
  it('patches the second occurrence on a line when column points to it', async () => {
    const filePath = path.join(testDir, 'versions.md');
    // Two identical version strings on the same line
    const line = 'Supports "1.0.0" and also "1.0.0" as fallback';
    await fs.writeFile(filePath, line + '\n', 'utf-8');

    // Second "1.0.0" starts at column 28 (1-based)
    const secondCol = line.indexOf('"1.0.0"', line.indexOf('"1.0.0"') + 1) + 1;

    const patches: PatchEntry[] = [
      makePatch({
        file: filePath,
        line: 1,
        original: '"1.0.0"',
        replacement: '"2.0.0"',
        column: secondCol,
        originalLength: '"1.0.0"'.length,
      }),
    ];

    const result = await applyPatchList(patches, testDir);
    expect(result.applied).toBe(1);

    const content = await fs.readFile(filePath, 'utf-8');
    // First occurrence stays; second is replaced
    expect(content).toContain('"1.0.0" and also "2.0.0"');
    expect(content).not.toContain('"2.0.0" and also "1.0.0"');
  });

  it('patches the first occurrence when column points to it', async () => {
    const filePath = path.join(testDir, 'versions2.md');
    const line = 'Upgrade "1.0.0" to "1.0.0" soon';
    await fs.writeFile(filePath, line + '\n', 'utf-8');

    const firstCol = line.indexOf('"1.0.0"') + 1;

    const patches: PatchEntry[] = [
      makePatch({
        file: filePath,
        line: 1,
        original: '"1.0.0"',
        replacement: '"3.0.0"',
        column: firstCol,
        originalLength: '"1.0.0"'.length,
      }),
    ];

    const result = await applyPatchList(patches, testDir);
    expect(result.applied).toBe(1);

    const content = await fs.readFile(filePath, 'utf-8');
    expect(content).toContain('"3.0.0" to "1.0.0"');
  });

  it('skips (does not apply) when column does not match original text', async () => {
    const filePath = path.join(testDir, 'mismatch.md');
    await fs.writeFile(filePath, 'hello world\n', 'utf-8');

    const patches: PatchEntry[] = [
      makePatch({
        file: filePath,
        line: 1,
        original: 'world',
        replacement: 'earth',
        column: 1,           // column 1 has "hello", not "world"
        originalLength: 5,
      }),
    ];

    const result = await applyPatchList(patches, testDir);
    expect(result.applied).toBe(0);
    expect(result.skipped).toBe(1);

    const content = await fs.readFile(filePath, 'utf-8');
    expect(content).toBe('hello world\n');
  });
});

// ---------------------------------------------------------------------------
// Stale-line guard
// ---------------------------------------------------------------------------
describe('applyPatchList — stale-line guard', () => {
  it('skips the patch and leaves file unchanged when lineHash does not match', async () => {
    const filePath = path.join(testDir, 'stale.md');
    const currentContent = 'current line content\n';
    await fs.writeFile(filePath, currentContent, 'utf-8');

    // Compute hash of a DIFFERENT line (simulating the file changed after audit)
    const staleHash = lineHash('old line content that was there at audit time');

    const patches: PatchEntry[] = [
      makePatch({
        file: filePath,
        line: 1,
        original: 'current line content',
        replacement: 'replaced content',
        lineHash: staleHash,
      }),
    ];

    const result = await applyPatchList(patches, testDir);
    expect(result.applied).toBe(0);
    expect(result.skipped).toBe(1);
    expect(result.patches[0].applied).toBe(false);

    // File must be completely unchanged
    const content = await fs.readFile(filePath, 'utf-8');
    expect(content).toBe(currentContent);
  });

  it('applies the patch when lineHash matches the current line', async () => {
    const filePath = path.join(testDir, 'fresh.md');
    await fs.writeFile(filePath, 'exact line\n', 'utf-8');

    const currentHash = lineHash('exact line');

    const patches: PatchEntry[] = [
      makePatch({
        file: filePath,
        line: 1,
        original: 'exact line',
        replacement: 'replaced line',
        lineHash: currentHash,
      }),
    ];

    const result = await applyPatchList(patches, testDir);
    expect(result.applied).toBe(1);

    const content = await fs.readFile(filePath, 'utf-8');
    expect(content).toBe('replaced line\n');
  });
});

// ---------------------------------------------------------------------------
// CRLF preservation
// ---------------------------------------------------------------------------
describe('applyPatchList — CRLF EOL preservation', () => {
  it('preserves CRLF line endings after applying a fix', async () => {
    const filePath = path.join(testDir, 'crlf.md');
    const crlfContent = 'foo bar\r\nbaz qux\r\n';
    await fs.writeFile(filePath, crlfContent, 'utf-8');

    const patches: PatchEntry[] = [
      makePatch({ file: filePath, line: 1, original: 'foo bar', replacement: 'foo baz' }),
    ];

    const result = await applyPatchList(patches, testDir);
    expect(result.applied).toBe(1);

    const raw = await fs.readFile(filePath, 'utf-8');
    expect(raw).toBe('foo baz\r\nbaz qux\r\n');
    // Confirm CRLF bytes are present
    expect(raw).toContain('\r\n');
    expect(raw).not.toContain('\r\nbaz\n');
  });

  it('does not add or remove CRLF when patching a multi-line CRLF file', async () => {
    const filePath = path.join(testDir, 'crlf2.md');
    const crlfContent = 'line1\r\nv1.0.0\r\nline3\r\n';
    await fs.writeFile(filePath, crlfContent, 'utf-8');

    const patches: PatchEntry[] = [
      makePatch({ file: filePath, line: 2, original: 'v1.0.0', replacement: 'v2.0.0' }),
    ];

    await applyPatchList(patches, testDir);

    const raw = await fs.readFile(filePath, 'utf-8');
    expect(raw).toBe('line1\r\nv2.0.0\r\nline3\r\n');
  });
});

// ---------------------------------------------------------------------------
// Trailing-newline preservation
// ---------------------------------------------------------------------------
describe('applyPatchList — trailing newline preservation', () => {
  it('preserves a trailing newline after patching (LF)', async () => {
    const filePath = path.join(testDir, 'trailing.md');
    await fs.writeFile(filePath, 'hello world\n', 'utf-8');

    const patches: PatchEntry[] = [
      makePatch({ file: filePath, line: 1, original: 'world', replacement: 'earth' }),
    ];

    await applyPatchList(patches, testDir);

    const content = await fs.readFile(filePath, 'utf-8');
    expect(content).toBe('hello earth\n');
    expect(content.endsWith('\n')).toBe(true);
  });

  it('does NOT add a trailing newline when the original file had none', async () => {
    const filePath = path.join(testDir, 'no-trailing.md');
    // Write without trailing newline
    await fs.writeFile(filePath, 'hello world', 'utf-8');

    const patches: PatchEntry[] = [
      makePatch({ file: filePath, line: 1, original: 'world', replacement: 'earth' }),
    ];

    await applyPatchList(patches, testDir);

    const content = await fs.readFile(filePath, 'utf-8');
    expect(content).toBe('hello earth');
    expect(content.endsWith('\n')).toBe(false);
  });

  it('preserves trailing CRLF newline', async () => {
    const filePath = path.join(testDir, 'trailing-crlf.md');
    await fs.writeFile(filePath, 'hello world\r\n', 'utf-8');

    const patches: PatchEntry[] = [
      makePatch({ file: filePath, line: 1, original: 'world', replacement: 'earth' }),
    ];

    await applyPatchList(patches, testDir);

    const content = await fs.readFile(filePath, 'utf-8');
    expect(content).toBe('hello earth\r\n');
  });
});
