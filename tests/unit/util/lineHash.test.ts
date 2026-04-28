import { describe, it, expect } from 'vitest';
import { normaliseLine, lineHash } from '../../../src/util/lineHash.js';

describe('normaliseLine', () => {
  it('strips trailing LF', () => {
    expect(normaliseLine('hello\n')).toBe('hello');
  });

  it('strips trailing CRLF', () => {
    expect(normaliseLine('hello\r\n')).toBe('hello');
  });

  it('strips lone trailing CR', () => {
    expect(normaliseLine('hello\r')).toBe('hello');
  });

  it('leaves plain content unchanged', () => {
    expect(normaliseLine('hello')).toBe('hello');
  });

  it('preserves leading whitespace', () => {
    expect(normaliseLine('    indented\n')).toBe('    indented');
  });
});

describe('lineHash', () => {
  it('returns a 16-character lowercase hex string', () => {
    const h = lineHash('hello');
    expect(h).toHaveLength(16);
    expect(h).toMatch(/^[0-9a-f]{16}$/);
  });

  it('same content with LF and CRLF produces the same hash', () => {
    expect(lineHash('hello\n')).toBe(lineHash('hello\r\n'));
  });

  it('same content without newline matches newline variants', () => {
    expect(lineHash('hello')).toBe(lineHash('hello\n'));
    expect(lineHash('hello')).toBe(lineHash('hello\r\n'));
  });

  it('different content produces a different hash', () => {
    expect(lineHash('hello')).not.toBe(lineHash('world'));
  });

  it('is deterministic across calls', () => {
    expect(lineHash('test line')).toBe(lineHash('test line'));
  });
});
