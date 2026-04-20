import { describe, it, expect } from 'vitest';
import { generateSarifReport } from '../../src/report/sarif.js';
import type { DriftReport, DriftIssue, DocReference } from '../../src/types.js';

function makeRef(overrides: Partial<DocReference> = {}): DocReference {
  return {
    id: 'ref-1',
    source: { path: 'README.md', line: 10, column: 1 },
    kind: 'link-external',
    target: 'https://example.com',
    context: 'some context',
    ...overrides,
  };
}

function makeIssue(overrides: Partial<DriftIssue> = {}): DriftIssue {
  return {
    reference: makeRef(),
    kind: 'dead-external-link',
    severity: 'high',
    message: 'Link is dead',
    autoFixable: false,
    ...overrides,
  };
}

function makeReport(overrides: Partial<DriftReport> = {}): DriftReport {
  return {
    root: '/project',
    scannedDocs: 5,
    scannedReferences: 20,
    issues: [],
    durationMs: 123,
    generatedAt: '2024-06-15T10:30:00Z',
    ...overrides,
  };
}

describe('generateSarifReport', () => {
  it('outputs valid JSON', () => {
    const output = generateSarifReport(makeReport());
    expect(() => JSON.parse(output)).not.toThrow();
  });

  it('contains correct SARIF schema and version', () => {
    const parsed = JSON.parse(generateSarifReport(makeReport()));
    expect(parsed.version).toBe('2.1.0');
    expect(parsed.$schema).toContain('sarif-schema-2.1.0');
  });

  it('maps high severity to error level', () => {
    const report = makeReport({ issues: [makeIssue({ severity: 'high' })] });
    const parsed = JSON.parse(generateSarifReport(report));
    expect(parsed.runs[0].results[0].level).toBe('error');
  });

  it('maps medium severity to warning level', () => {
    const report = makeReport({ issues: [makeIssue({ severity: 'medium' })] });
    const parsed = JSON.parse(generateSarifReport(report));
    expect(parsed.runs[0].results[0].level).toBe('warning');
  });

  it('maps low severity to note level', () => {
    const report = makeReport({ issues: [makeIssue({ severity: 'low' })] });
    const parsed = JSON.parse(generateSarifReport(report));
    expect(parsed.runs[0].results[0].level).toBe('note');
  });

  it('contains one result per issue', () => {
    const report = makeReport({
      issues: [
        makeIssue(),
        makeIssue({
          kind: 'missing-symbol',
          severity: 'medium',
          reference: makeRef({ source: { path: 'docs/api.md', line: 5, column: 1 } }),
        }),
      ],
    });
    const parsed = JSON.parse(generateSarifReport(report));
    expect(parsed.runs[0].results).toHaveLength(2);
  });

  it('rule IDs match DriftKind values', () => {
    const report = makeReport({
      issues: [
        makeIssue({ kind: 'dead-external-link' }),
        makeIssue({ kind: 'missing-symbol', severity: 'medium' }),
      ],
    });
    const parsed = JSON.parse(generateSarifReport(report));
    const ruleIds = parsed.runs[0].tool.driver.rules.map((r: { id: string }) => r.id);
    expect(ruleIds).toContain('dead-external-link');
    expect(ruleIds).toContain('missing-symbol');
  });

  it('sets tool driver name to drift-sentinel', () => {
    const parsed = JSON.parse(generateSarifReport(makeReport()));
    expect(parsed.runs[0].tool.driver.name).toBe('drift-sentinel');
  });

  it('includes artifact location with file path', () => {
    const report = makeReport({
      issues: [makeIssue({ reference: makeRef({ source: { path: 'docs/guide.md', line: 42, column: 3 } }) })],
    });
    const parsed = JSON.parse(generateSarifReport(report));
    const loc = parsed.runs[0].results[0].locations[0].physicalLocation;
    expect(loc.artifactLocation.uri).toBe('docs/guide.md');
    expect(loc.region.startLine).toBe(42);
    expect(loc.region.startColumn).toBe(3);
  });

  it('handles empty issues', () => {
    const parsed = JSON.parse(generateSarifReport(makeReport()));
    expect(parsed.runs[0].results).toEqual([]);
    expect(parsed.runs[0].tool.driver.rules).toEqual([]);
  });
});
