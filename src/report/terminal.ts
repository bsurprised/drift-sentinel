import { DriftReport, DriftIssue, Severity } from '../types.js';

const ANSI = {
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m',
  bold: '\x1b[1m',
} as const;

const SEVERITY_COLOR: Record<Severity, string> = {
  high: ANSI.red,
  medium: ANSI.yellow,
  low: ANSI.blue,
};

const SEVERITY_LABEL: Record<Severity, string> = {
  high: 'HIGH',
  medium: 'MEDIUM',
  low: 'LOW',
};

const SEVERITY_ICON: Record<Severity, string> = {
  high: '✖',
  medium: '⚠',
  low: 'ℹ',
};

const SEVERITY_ORDER: Severity[] = ['high', 'medium', 'low'];

function formatDuration(ms: number): string {
  return ms.toLocaleString('en-US');
}

function stripAnsi(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\x1b\[[0-9;]*m/g, '');
}

function sortIssues(issues: DriftIssue[]): DriftIssue[] {
  return [...issues].sort((a, b) => {
    const sA = SEVERITY_ORDER.indexOf(a.severity);
    const sB = SEVERITY_ORDER.indexOf(b.severity);
    if (sA !== sB) return sA - sB;
    const pathCmp = a.reference.source.path.localeCompare(b.reference.source.path);
    if (pathCmp !== 0) return pathCmp;
    return a.reference.source.line - b.reference.source.line;
  });
}

export function generateTerminalReport(report: DriftReport, isTTY?: boolean): string {
  const tty = isTTY ?? (typeof process !== 'undefined' && !!process.stdout?.isTTY);

  const countBySev: Record<Severity, number> = { high: 0, medium: 0, low: 0 };
  for (const issue of report.issues) {
    countBySev[issue.severity]++;
  }

  const lines: string[] = [];

  lines.push('drift-sentinel — Audit complete');
  lines.push('');
  lines.push(`  Scanned: ${report.scannedDocs} doc files, ${report.scannedReferences} references`);
  lines.push(`  Duration: ${formatDuration(report.durationMs)}ms`);
  lines.push('');

  for (const sev of SEVERITY_ORDER) {
    const count = countBySev[sev];
    const color = SEVERITY_COLOR[sev];
    const icon = SEVERITY_ICON[sev];
    const word = sev === 'high' ? 'high' : sev === 'medium' ? 'medium' : 'low';
    lines.push(`  ${color}${icon}${ANSI.reset} ${count} ${word} severity issues`);
  }

  const sorted = sortIssues(report.issues);

  for (const issue of sorted) {
    const color = SEVERITY_COLOR[issue.severity];
    const label = SEVERITY_LABEL[issue.severity];
    const loc = `${issue.reference.source.path}:${issue.reference.source.line}`;
    lines.push('');
    lines.push(`${color}${label}${ANSI.reset}  ${loc}  ${issue.kind}`);
    lines.push(`  ${issue.message}`);
    if (issue.suggestion) {
      lines.push(`  → ${issue.suggestion}`);
    }
  }

  lines.push('');

  const output = lines.join('\n');
  return tty ? output : stripAnsi(output);
}
