import { describe, it, expect } from 'vitest';
import { parsePatch } from '../../src/fixer/patch-parser.js';
import type { DriftIssue } from '../../src/types.js';

function makeIssue(overrides: Partial<DriftIssue> = {}): DriftIssue {
  return {
    reference: {
      id: 'ref-1',
      source: { path: 'docs/README.md', line: 10, column: 1 },
      kind: 'cli-command',
      target: 'npm start',
      context: 'Run `npm start` to begin',
    },
    kind: 'unknown-cli-command',
    severity: 'medium',
    message: 'Unknown CLI command: npm start',
    autoFixable: true,
    ...overrides,
  };
}

describe('parsePatch', () => {
  it('parses a simple -old/+new patch', () => {
    const issue = makeIssue({ patch: '-npm start\n+npm run dev' });
    const result = parsePatch(issue);
    expect(result).not.toBeNull();
    expect(result!.original).toBe('npm start');
    expect(result!.replacement).toBe('npm run dev');
    expect(result!.file).toBe('docs/README.md');
    expect(result!.line).toBe(10);
    expect(result!.kind).toBe('unknown-cli-command');
    expect(result!.applied).toBe(false);
  });

  it('returns null for issues without patches', () => {
    const issue = makeIssue({ patch: undefined });
    expect(parsePatch(issue)).toBeNull();
  });

  it('returns null when patch has no - line', () => {
    const issue = makeIssue({ patch: '+only new' });
    expect(parsePatch(issue)).toBeNull();
  });

  it('returns null when patch has no + line', () => {
    const issue = makeIssue({ patch: '-only old' });
    expect(parsePatch(issue)).toBeNull();
  });

  it('handles multi-word replacements', () => {
    const issue = makeIssue({
      patch: '-the old command here\n+the new command here',
      reference: {
        id: 'ref-2',
        source: { path: 'docs/guide.md', line: 42, column: 5 },
        kind: 'cli-command',
        target: 'the old command here',
        context: 'Run `the old command here`',
      },
    });
    const result = parsePatch(issue);
    expect(result).not.toBeNull();
    expect(result!.original).toBe('the old command here');
    expect(result!.replacement).toBe('the new command here');
  });

  it('ignores --- and +++ lines (unified diff headers)', () => {
    const issue = makeIssue({
      patch: '--- a/file.md\n+++ b/file.md\n-old text\n+new text',
    });
    const result = parsePatch(issue);
    expect(result).not.toBeNull();
    expect(result!.original).toBe('old text');
    expect(result!.replacement).toBe('new text');
  });
});
