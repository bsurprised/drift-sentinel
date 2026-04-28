import { describe, it, expect } from 'vitest';
import { parsePatch } from '../../../src/fixer/patch-parser.js';
import type { DriftIssue } from '../../../src/types.js';

function makeIssue(overrides: Partial<DriftIssue> = {}): DriftIssue {
  return {
    reference: {
      id: 'ref-1',
      source: { path: 'docs/README.md', line: 10, column: 5 },
      kind: 'cli-command',
      target: 'npm start',
      context: 'Run `npm start`',
    },
    kind: 'unknown-cli-command',
    severity: 'medium',
    message: 'test',
    autoFixable: true,
    ...overrides,
  };
}

describe('parsePatch — LLD-F whitespace preservation (B-07)', () => {
  it('preserves leading whitespace in original (no .trim())', () => {
    // Separator-space format: "- " + content allows leading spaces to be kept
    const issue = makeIssue({ patch: '-     indented code\n+     fixed code' });
    const result = parsePatch(issue);
    expect(result).not.toBeNull();
    // stripPrefix('-     indented code'): line[1]==' ' → slice(2) = '    indented code'
    expect(result!.original).toBe('    indented code');
    expect(result!.replacement).toBe('    fixed code');
  });

  it('preserves leading whitespace in replacement', () => {
    // Use separator-space convention: "+<sep><4-spaces>content" → stripPrefix strips sep
    const issue = makeIssue({ patch: '-foo\n+     indented replacement' });
    const result = parsePatch(issue);
    expect(result).not.toBeNull();
    expect(result!.original).toBe('foo');
    // stripPrefix strips the separator space; 4 content spaces are preserved
    expect(result!.replacement).toBe('    indented replacement');
  });

  it('does not strip trailing whitespace from original', () => {
    const issue = makeIssue({ patch: '-trailing space   \n+no trailing' });
    const result = parsePatch(issue);
    expect(result).not.toBeNull();
    expect(result!.original).toBe('trailing space   ');
  });

  it('sets originalLength to the length of the parsed original', () => {
    const issue = makeIssue({ patch: '-hello world\n+goodbye world' });
    const result = parsePatch(issue);
    expect(result).not.toBeNull();
    expect(result!.originalLength).toBe('hello world'.length);
  });

  it('column and lineHash are undefined by default (set by caller when known)', () => {
    const issue = makeIssue({ patch: '-old\n+new' });
    const result = parsePatch(issue);
    expect(result).not.toBeNull();
    expect(result!.column).toBeUndefined();
    expect(result!.lineHash).toBeUndefined();
  });

  it('handles diff header lines (--- / +++) without treating them as patch content', () => {
    const issue = makeIssue({
      patch: '--- a/file.md\n+++ b/file.md\n-old text\n+new text',
    });
    const result = parsePatch(issue);
    expect(result).not.toBeNull();
    expect(result!.original).toBe('old text');
    expect(result!.replacement).toBe('new text');
  });
});
