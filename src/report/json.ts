import { DriftReport } from '../types.js';
import { toRelativePosix } from './paths.js';

export function generateJsonReport(report: DriftReport): string {
  const transformed = {
    ...report,
    issues: report.issues.map(issue => ({
      ...issue,
      reference: {
        ...issue.reference,
        source: {
          path: toRelativePosix(issue.reference.source.path, report.root),
          absPath: issue.reference.source.path, // deprecated; remove in v1.2
          line: issue.reference.source.line,
          column: issue.reference.source.column,
        },
      },
    })),
  };
  return JSON.stringify(transformed, null, 2);
}
