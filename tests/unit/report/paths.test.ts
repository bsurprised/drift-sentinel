import { describe, it, expect } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import { toRelativePosix, toRelativeUri } from '../../../src/report/paths.js';

describe('toRelativePosix', () => {
  it('converts Windows absolute path to POSIX relative (LLD-E spec example)', () => {
    // Use platform-native path construction so the test works on Windows
    const root = path.join('D:\\dev\\repo');
    const abs = path.join('D:\\dev\\repo\\docs\\a.md');
    expect(toRelativePosix(abs, root)).toBe('docs/a.md');
  });

  it('converts POSIX absolute path to relative', () => {
    const root = path.join(os.tmpdir(), 'proj');
    const abs = path.join(os.tmpdir(), 'proj', 'docs', 'a.md');
    expect(toRelativePosix(abs, root)).toBe('docs/a.md');
  });

  it('returns already-relative path with normalised separators', () => {
    expect(toRelativePosix('docs/a.md', '/project')).toBe('docs/a.md');
  });

  it('normalises backslashes on already-relative paths', () => {
    // On Windows, a relative path might have backslashes
    const rel = 'docs' + path.sep + 'a.md';
    expect(toRelativePosix(rel, '/project')).toBe('docs/a.md');
  });

  it('returns empty string for path equal to root', () => {
    const root = path.join(os.tmpdir(), 'proj');
    expect(toRelativePosix(root, root)).toBe('');
  });
});

describe('toRelativeUri', () => {
  it('percent-encodes spaces (LLD-E spec example)', () => {
    const root = path.join('D:\\dev\\repo');
    const abs = path.join('D:\\dev\\repo\\My File.md');
    expect(toRelativeUri(abs, root)).toBe('My%20File.md');
  });

  it('leaves normal path segments unencoded', () => {
    const root = path.join(os.tmpdir(), 'proj');
    const abs = path.join(os.tmpdir(), 'proj', 'docs', 'a.md');
    expect(toRelativeUri(abs, root)).toBe('docs/a.md');
  });

  it('percent-encodes special characters in directory names', () => {
    const root = path.join(os.tmpdir(), 'proj');
    const abs = path.join(os.tmpdir(), 'proj', 'my docs', 'guide.md');
    expect(toRelativeUri(abs, root)).toBe('my%20docs/guide.md');
  });

  it('does not encode forward slashes (only segment separators)', () => {
    const root = path.join(os.tmpdir(), 'proj');
    const abs = path.join(os.tmpdir(), 'proj', 'a', 'b.md');
    const result = toRelativeUri(abs, root);
    expect(result).toContain('/');
    expect(result).toBe('a/b.md');
  });
});
