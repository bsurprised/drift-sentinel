import { describe, it, expect } from 'vitest';
import { generateTerminalReport } from '../../src/report/terminal.js';
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
    scannedDocs: 23,
    scannedReferences: 187,
    issues: [],
    durationMs: 4231,
    generatedAt: '2024-06-15T10:30:00Z',
    ...overrides,
  };
}

describe('generateTerminalReport', () => {
  it('contains summary line with counts', () => {
    const report = makeReport({
      issues: [
        makeIssue({ severity: 'high' }),
        makeIssue({ severity: 'medium', kind: 'version-mismatch' }),
        makeIssue({ severity: 'low', kind: 'orphan-doc' }),
      ],
    });
    const output = generateTerminalReport(report, false);
    expect(output).toContain('1 high severity issues');
    expect(output).toContain('1 medium severity issues');
    expect(output).toContain('1 low severity issues');
  });

  it('shows HIGH issues before MEDIUM before LOW', () => {
    const report = makeReport({
      issues: [
        makeIssue({ severity: 'low', kind: 'orphan-doc', message: 'orphan' }),
        makeIssue({ severity: 'high', message: 'critical' }),
        makeIssue({ severity: 'medium', kind: 'version-mismatch', message: 'mismatch' }),
      ],
    });
    const output = generateTerminalReport(report, false);
    const highIdx = output.indexOf('HIGH');
    const medIdx = output.indexOf('MEDIUM');
    const lowIdx = output.indexOf('LOW');
    expect(highIdx).toBeLessThan(medIdx);
    expect(medIdx).toBeLessThan(lowIdx);
  });

  it('includes duration and scan stats', () => {
    const output = generateTerminalReport(makeReport(), false);
    expect(output).toContain('23 doc files');
    expect(output).toContain('187 references');
    expect(output).toContain('4,231ms');
  });

  it('contains issue details: path, line, kind, message', () => {
    const report = makeReport({
      issues: [
        makeIssue({
          reference: makeRef({ source: { path: 'docs/api.md', line: 45, column: 1 } }),
          kind: 'missing-symbol',
          message: 'UserService.createUser is not defined',
        }),
      ],
    });
    const output = generateTerminalReport(report, false);
    expect(output).toContain('docs/api.md:45');
    expect(output).toContain('missing-symbol');
    expect(output).toContain('UserService.createUser is not defined');
  });

  it('includes suggestion when present', () => {
    const report = makeReport({
      issues: [makeIssue({ suggestion: 'Did you mean npm run dev?' })],
    });
    const output = generateTerminalReport(report, false);
    expect(output).toContain('→ Did you mean npm run dev?');
  });

  it('includes ANSI codes when TTY', () => {
    const report = makeReport({
      issues: [makeIssue()],
    });
    const output = generateTerminalReport(report, true);
    expect(output).toContain('\x1b[31m');
    expect(output).toContain('\x1b[0m');
  });

  it('strips ANSI codes when not TTY', () => {
    const report = makeReport({
      issues: [makeIssue()],
    });
    const output = generateTerminalReport(report, false);
    expect(output).not.toContain('\x1b[');
  });

  it('contains header line', () => {
    const output = generateTerminalReport(makeReport(), false);
    expect(output).toContain('drift-sentinel — Audit complete');
  });
});
