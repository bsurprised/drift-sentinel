import { describe, it, expect } from 'vitest';
import { levenshtein, fuzzyMatch } from '../../src/util/fuzzy.js';

describe('levenshtein', () => {
  it('returns 0 for identical strings', () => {
    expect(levenshtein('hello', 'hello')).toBe(0);
  });

  it('returns length of other string when one is empty', () => {
    expect(levenshtein('', 'abc')).toBe(3);
    expect(levenshtein('abc', '')).toBe(3);
  });

  it('returns 0 for two empty strings', () => {
    expect(levenshtein('', '')).toBe(0);
  });

  it('computes correct distance for single substitution', () => {
    expect(levenshtein('cat', 'bat')).toBe(1);
  });

  it('computes correct distance for insertion', () => {
    expect(levenshtein('cat', 'cats')).toBe(1);
  });

  it('computes correct distance for deletion', () => {
    expect(levenshtein('cats', 'cat')).toBe(1);
  });

  it('computes correct distance for multiple edits', () => {
    expect(levenshtein('kitten', 'sitting')).toBe(3);
  });
});

describe('fuzzyMatch', () => {
  const candidates = ['npm run build', 'npm run test', 'npm run lint', 'npm run dev'];

  it('returns exact match', () => {
    expect(fuzzyMatch('npm run build', candidates)).toBe('npm run build');
  });

  it('returns closest match for typo', () => {
    expect(fuzzyMatch('npm run biuld', candidates)).toBe('npm run build');
  });

  it('returns undefined for completely different input', () => {
    expect(fuzzyMatch('xyzzy_foobar_baz', candidates)).toBeUndefined();
  });

  it('returns undefined for empty candidates', () => {
    expect(fuzzyMatch('test', [])).toBeUndefined();
  });

  it('returns best match among close candidates', () => {
    const result = fuzzyMatch('npm run tset', candidates);
    expect(result).toBe('npm run test');
  });
});
