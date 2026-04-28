/**
 * Unit tests for CLI validation logic (LLD-B / B-02).
 *
 * These tests verify the VALID_DRIFT_KINDS constant and kind validation without
 * spawning a subprocess or importing Commander (which calls program.parse()).
 */
import { describe, it, expect } from 'vitest';
import { VALID_DRIFT_KINDS } from '../../src/types.js';
import type { DriftKind } from '../../src/types.js';

describe('VALID_DRIFT_KINDS (LLD-B / B-02)', () => {
  it('contains all 8 expected drift kinds', () => {
    const expected: DriftKind[] = [
      'dead-external-link',
      'dead-file-ref',
      'missing-symbol',
      'invalid-code-example',
      'unknown-cli-command',
      'version-mismatch',
      'deprecated-api-mention',
      'orphan-doc',
    ];
    expect([...VALID_DRIFT_KINDS].sort()).toEqual([...expected].sort());
  });

  it('rejects a known-invalid kind string', () => {
    const badKind = 'totally-bogus-kind';
    expect((VALID_DRIFT_KINDS as readonly string[]).includes(badKind)).toBe(false);
  });

  it('accepts all valid kind strings', () => {
    for (const k of VALID_DRIFT_KINDS) {
      expect((VALID_DRIFT_KINDS as readonly string[]).includes(k)).toBe(true);
    }
  });
});

/** Mirrors the inline validation logic from src/cli.ts for unit testing. */
function parseKinds(raw: string): { valid: DriftKind[]; invalid: string[] } {
  const parts = raw.split(',').map(s => s.trim()).filter(Boolean);
  const valid: DriftKind[] = [];
  const invalid: string[] = [];
  for (const k of parts) {
    if ((VALID_DRIFT_KINDS as readonly string[]).includes(k)) {
      valid.push(k as DriftKind);
    } else {
      invalid.push(k);
    }
  }
  return { valid, invalid };
}

describe('parseKinds helper (mirrors CLI validation, LLD-B / B-02)', () => {
  it('returns all valid kinds and empty invalid list for correct input', () => {
    const { valid, invalid } = parseKinds('dead-file-ref,missing-symbol');
    expect(valid).toEqual(['dead-file-ref', 'missing-symbol']);
    expect(invalid).toHaveLength(0);
  });

  it('flags unknown kinds in invalid list', () => {
    const { valid, invalid } = parseKinds('dead-file-ref,bogus,also-bad');
    expect(valid).toEqual(['dead-file-ref']);
    expect(invalid).toEqual(['bogus', 'also-bad']);
  });

  it('handles a single invalid kind', () => {
    const { invalid } = parseKinds('not-a-kind');
    expect(invalid).toEqual(['not-a-kind']);
  });

  it('trims whitespace around kind names', () => {
    const { valid, invalid } = parseKinds(' dead-file-ref , missing-symbol ');
    expect(valid).toEqual(['dead-file-ref', 'missing-symbol']);
    expect(invalid).toHaveLength(0);
  });

  it('handles empty string', () => {
    const { valid, invalid } = parseKinds('');
    expect(valid).toHaveLength(0);
    expect(invalid).toHaveLength(0);
  });
});
