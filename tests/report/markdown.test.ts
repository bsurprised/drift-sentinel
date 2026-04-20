import { describe, it, expect } from 'vitest';
import { generateMarkdownReport } from '../../src/report/markdown.js';
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

describe('generateMarkdownReport', () => {
  it('contains "No drift detected!" for 0 issues', () => {
    const md = generateMarkdownReport(makeReport());
    expect(md).toContain('✅ No drift detected!');
  });

  it('formats date as YYYY-MM-DD', () => {
    const md = generateMarkdownReport(makeReport());
    expect(md).toContain('# Drift Report — 2024-06-15');
  });

  it('includes scan stats', () => {
    const md = generateMarkdownReport(makeReport());
    expect(md).toContain('5 doc files');
    expect(md).toContain('20 references checked');
    expect(md).toContain('123ms');
  });

  it('contains 🔴 section with correct count for high issues', () => {
    const report = makeReport({
      issues: [
        makeIssue({ severity: 'high' }),
        makeIssue({
          severity: 'high',
          reference: makeRef({ source: { path: 'docs/api.md', line: 5, column: 1 } }),
        }),
      ],
    });
    const md = generateMarkdownReport(report);
    expect(md).toContain('## 🔴 High severity (2)');
  });

  it('contains all three severity sections with correct counts', () => {
    const report = makeReport({
      issues: [
        makeIssue({ severity: 'high' }),
        makeIssue({ severity: 'medium', kind: 'version-mismatch', message: 'version mismatch' }),
        makeIssue({ severity: 'medium', kind: 'version-mismatch', message: 'another mismatch' }),
        makeIssue({ severity: 'low', kind: 'orphan-doc', message: 'orphan' }),
      ],
    });
    const md = generateMarkdownReport(report);
    expect(md).toContain('## 🔴 High severity (1)');
    expect(md).toContain('## 🟡 Medium severity (2)');
    expect(md).toContain('## 🔵 Low severity (1)');
  });

  it('shows severity headers with (0) count when group is empty', () => {
    const report = makeReport({
      issues: [makeIssue({ severity: 'high' })],
    });
    const md = generateMarkdownReport(report);
    expect(md).toContain('## 🟡 Medium severity (0)');
    expect(md).toContain('## 🔵 Low severity (0)');
  });

  it('renders diff block for auto-fixable issues with patch', () => {
    const report = makeReport({
      issues: [
        makeIssue({
          autoFixable: true,
          patch: '- old line\n+ new line',
        }),
      ],
    });
    const md = generateMarkdownReport(report);
    expect(md).toContain('**Auto-fixable:** yes');
    expect(md).toContain('```diff');
    expect(md).toContain('- old line\n+ new line');
  });

  it('sorts issues by file path then line within severity groups', () => {
    const report = makeReport({
      issues: [
        makeIssue({
          severity: 'high',
          reference: makeRef({ source: { path: 'docs/z.md', line: 5, column: 1 } }),
        }),
        makeIssue({
          severity: 'high',
          reference: makeRef({ source: { path: 'docs/a.md', line: 20, column: 1 } }),
        }),
        makeIssue({
          severity: 'high',
          reference: makeRef({ source: { path: 'docs/a.md', line: 3, column: 1 } }),
        }),
      ],
    });
    const md = generateMarkdownReport(report);
    const aLine3 = md.indexOf('docs/a.md:3');
    const aLine20 = md.indexOf('docs/a.md:20');
    const zLine5 = md.indexOf('docs/z.md:5');
    expect(aLine3).toBeLessThan(aLine20);
    expect(aLine20).toBeLessThan(zLine5);
  });

  it('includes suggestion when present', () => {
    const report = makeReport({
      issues: [
        makeIssue({ suggestion: 'Did you mean npm run dev?' }),
      ],
    });
    const md = generateMarkdownReport(report);
    expect(md).toContain('**Suggestion:** Did you mean npm run dev?');
  });

  it('includes total counts in summary', () => {
    const report = makeReport({
      issues: [
        makeIssue({ severity: 'high' }),
        makeIssue({ severity: 'medium', kind: 'version-mismatch', message: 'v' }),
        makeIssue({ severity: 'low', kind: 'orphan-doc', message: 'o' }),
      ],
    });
    const md = generateMarkdownReport(report);
    expect(md).toContain('3 issues (1 high, 1 medium, 1 low)');
  });
});
