import { DriftReport, DriftIssue, Severity } from '../types.js';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

let _version: string | undefined;
function getVersion(): string {
  if (!_version) {
    try {
      const __dirname = dirname(fileURLToPath(import.meta.url));
      const pkg = JSON.parse(readFileSync(join(__dirname, '..', '..', 'package.json'), 'utf-8'));
      _version = pkg.version ?? '1.0.0';
    } catch {
      _version = '1.0.0';
    }
  }
  return _version!;
}

const SARIF_SCHEMA =
  'https://raw.githubusercontent.com/oasis-tcs/sarif-spec/main/sarif-2.1/schema/sarif-schema-2.1.0.json';

const SEVERITY_TO_LEVEL: Record<Severity, string> = {
  high: 'error',
  medium: 'warning',
  low: 'note',
};

function buildRules(issues: DriftIssue[]): Array<{
  id: string;
  shortDescription: { text: string };
  defaultConfiguration: { level: string };
}> {
  const seen = new Map<string, Severity>();
  for (const issue of issues) {
    if (!seen.has(issue.kind)) {
      seen.set(issue.kind, issue.severity);
    }
  }

  return Array.from(seen.entries()).map(([kind, severity]) => ({
    id: kind,
    shortDescription: { text: humanize(kind) },
    defaultConfiguration: { level: SEVERITY_TO_LEVEL[severity] },
  }));
}

function humanize(kind: string): string {
  return kind
    .split('-')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function buildResult(issue: DriftIssue) {
  return {
    ruleId: issue.kind,
    level: SEVERITY_TO_LEVEL[issue.severity],
    message: { text: issue.message },
    locations: [
      {
        physicalLocation: {
          artifactLocation: { uri: issue.reference.source.path },
          region: {
            startLine: issue.reference.source.line,
            startColumn: issue.reference.source.column,
          },
        },
      },
    ],
    ...(issue.autoFixable ? { fixes: [] } : {}),
  };
}

export function generateSarifReport(report: DriftReport): string {
  const sarif = {
    $schema: SARIF_SCHEMA,
    version: '2.1.0' as const,
    runs: [
      {
        tool: {
          driver: {
            name: 'drift-sentinel',
            version: getVersion(),
            informationUri: 'https://github.com/bsurprised/drift-sentinel',
            rules: buildRules(report.issues),
          },
        },
        results: report.issues.map(buildResult),
      },
    ],
  };

  return JSON.stringify(sarif, null, 2);
}
