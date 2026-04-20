import { describe, it, expect } from 'vitest';
import { generateJsonReport } from '../../src/report/json.js';
import type { DriftReport } from '../../src/types.js';

function makeReport(overrides: Partial<DriftReport> = {}): DriftReport {
  return {
    root: '/project',
    scannedDocs: 3,
    scannedReferences: 10,
    issues: [],
    durationMs: 456,
    generatedAt: '2024-06-15T10:30:00Z',
    ...overrides,
  };
}

describe('generateJsonReport', () => {
  it('outputs valid JSON', () => {
    const json = generateJsonReport(makeReport());
    expect(() => JSON.parse(json)).not.toThrow();
  });

  it('parsed JSON matches input DriftReport structure', () => {
    const report = makeReport({ scannedDocs: 42, durationMs: 999 });
    const parsed = JSON.parse(generateJsonReport(report));
    expect(parsed.scannedDocs).toBe(42);
    expect(parsed.durationMs).toBe(999);
    expect(parsed.issues).toEqual([]);
    expect(parsed.generatedAt).toBe('2024-06-15T10:30:00Z');
  });

  it('handles empty issues array', () => {
    const parsed = JSON.parse(generateJsonReport(makeReport()));
    expect(parsed.issues).toEqual([]);
  });

  it('preserves issues in output', () => {
    const report = makeReport({
      issues: [
        {
          reference: {
            id: 'ref-1',
            source: { path: 'README.md', line: 10, column: 1 },
            kind: 'link-external',
            target: 'https://example.com',
            context: 'ctx',
          },
          kind: 'dead-external-link',
          severity: 'high',
          message: 'Link is dead',
          autoFixable: false,
        },
      ],
    });
    const parsed = JSON.parse(generateJsonReport(report));
    expect(parsed.issues).toHaveLength(1);
    expect(parsed.issues[0].kind).toBe('dead-external-link');
  });
});
