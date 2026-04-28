import path from 'node:path';
import { DriftReport, DriftConfig, Severity } from '../types.js';
import { writeMarkdownReport } from './markdown.js';
import { generateJsonReport } from './json.js';
import { generateSarifReport } from './sarif.js';
import { generateTerminalReport } from './terminal.js';

export { generateMarkdownReport, writeMarkdownReport } from './markdown.js';
export { generateJsonReport } from './json.js';
export { generateSarifReport } from './sarif.js';
export { generateTerminalReport } from './terminal.js';

function briefSummary(report: DriftReport): string {
  const counts: Record<Severity, number> = { high: 0, medium: 0, low: 0 };
  for (const issue of report.issues) {
    counts[issue.severity]++;
  }
  const total = report.issues.length;
  return `drift-sentinel: ${total} issue${total !== 1 ? 's' : ''} (${counts.high} high, ${counts.medium} medium, ${counts.low} low)`;
}

export async function emitReport(
  report: DriftReport,
  opts: { format: 'terminal' | 'json' | 'sarif'; config: DriftConfig },
): Promise<void> {
  const { format, config } = opts;

  if (format === 'json') {
    process.stdout.write(generateJsonReport(report) + '\n');
    process.stderr.write(briefSummary(report) + '\n');
  } else if (format === 'sarif') {
    process.stdout.write(generateSarifReport(report) + '\n');
    process.stderr.write(briefSummary(report) + '\n');
  } else {
    process.stdout.write(generateTerminalReport(report));
  }

  if (config.writeReport !== false) {
    const reportPath = config.reportPath ?? path.join(report.root, 'DRIFT_REPORT.md');
    await writeMarkdownReport(report, reportPath);
  }
}

