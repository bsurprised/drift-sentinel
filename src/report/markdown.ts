import { writeFile } from 'node:fs/promises';
import { DriftReport, DriftIssue, Severity } from '../types.js';
import { toRelativePosix } from './paths.js';

const SEVERITY_HEADERS: Record<Severity, string> = {
  high: '🔴 High severity',
  medium: '🟡 Medium severity',
  low: '🔵 Low severity',
};

const SEVERITY_ORDER: Severity[] = ['high', 'medium', 'low'];

function sortIssues(issues: DriftIssue[]): DriftIssue[] {
  return [...issues].sort((a, b) => {
    const pathCmp = a.reference.source.path.localeCompare(b.reference.source.path);
    if (pathCmp !== 0) return pathCmp;
    return a.reference.source.line - b.reference.source.line;
  });
}

function formatDate(iso: string): string {
  return iso.slice(0, 10);
}

function renderIssue(issue: DriftIssue, root: string): string {
  const { reference, kind, message, suggestion, autoFixable, patch } = issue;
  const relPath = toRelativePosix(reference.source.path, root);
  const loc = `${relPath}:${reference.source.line}`;
  const lines: string[] = [];

  lines.push(`### ${loc} — ${kind}`);
  lines.push(`**Kind:** ${kind}`);
  lines.push(`**Message:** ${message}`);
  if (suggestion) {
    lines.push(`**Suggestion:** ${suggestion}`);
  }
  lines.push(`**Auto-fixable:** ${autoFixable ? 'yes' : 'no'}`);
  if (autoFixable && patch) {
    lines.push('');
    lines.push('```diff');
    lines.push(patch);
    lines.push('```');
  }

  return lines.join('\n');
}

export function generateMarkdownReport(report: DriftReport): string {
  const date = formatDate(report.generatedAt);
  const highCount = report.issues.filter(i => i.severity === 'high').length;
  const mediumCount = report.issues.filter(i => i.severity === 'medium').length;
  const lowCount = report.issues.filter(i => i.severity === 'low').length;
  const total = report.issues.length;

  const lines: string[] = [];

  lines.push(`# Drift Report — ${date}`);
  lines.push('');
  lines.push(`**Scanned:** ${report.scannedDocs} doc files, ${report.scannedReferences} references checked`);
  lines.push(`**Drift found:** ${total} issues (${highCount} high, ${mediumCount} medium, ${lowCount} low)`);
  lines.push(`**Duration:** ${report.durationMs}ms`);

  if (total === 0) {
    lines.push('');
    lines.push('✅ No drift detected!');
  }

  for (const severity of SEVERITY_ORDER) {
    const issues = sortIssues(report.issues.filter(i => i.severity === severity));
    lines.push('');
    lines.push(`## ${SEVERITY_HEADERS[severity]} (${issues.length})`);

    for (const issue of issues) {
      lines.push('');
      lines.push(renderIssue(issue, report.root));
      lines.push('');
      lines.push('---');
    }
  }

  lines.push('');
  return lines.join('\n');
}

export async function writeMarkdownReport(report: DriftReport, outputPath: string): Promise<void> {
  const content = generateMarkdownReport(report);
  await writeFile(outputPath, content, 'utf-8');
}

