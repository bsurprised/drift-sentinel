import { describe, it, expect } from 'vitest';
import { VERIFIER_DESCRIPTIONS } from '../../../src/verifiers/catalog.js';
import { VALID_DRIFT_KINDS } from '../../../src/types.js';

describe('VERIFIER_DESCRIPTIONS (LLD-G)', () => {
  it('has an entry for every DriftKind', () => {
    for (const kind of VALID_DRIFT_KINDS) {
      expect(VERIFIER_DESCRIPTIONS).toHaveProperty(kind);
    }
  });

  it('has exactly as many entries as DriftKind values', () => {
    expect(Object.keys(VERIFIER_DESCRIPTIONS)).toHaveLength(VALID_DRIFT_KINDS.length);
  });

  it('every entry has a valid severity', () => {
    const valid = new Set(['high', 'medium', 'low']);
    for (const [, meta] of Object.entries(VERIFIER_DESCRIPTIONS)) {
      expect(valid.has(meta.defaultSeverity)).toBe(true);
    }
  });

  it('every entry has a non-empty description', () => {
    for (const [, meta] of Object.entries(VERIFIER_DESCRIPTIONS)) {
      expect(meta.description.length).toBeGreaterThan(0);
    }
  });
});
