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

export type EmitFormat = 'terminal' | 'json' | 'sarif';
export interface EmitOptions { format: EmitFormat; config: DriftConfig; }

/**
 * Emit a drift report.
 *
 * Two call shapes are supported for backward compatibility:
 *   - v1.1 (preferred): `emitReport(report, { format, config })`
 *   - v1.0 (deprecated): `emitReport(report, config, outputDir?)` — always
 *     produces terminal output and writes the markdown report to
 *     `<outputDir>/DRIFT_REPORT.md` (or `<report.root>/DRIFT_REPORT.md`).
 *
 * Markdown report write rules (v1.1):
 *   - `config.writeReport === false`            → never write
 *   - `config.writeReport === true`             → always write
 *   - `config.reportPath` set, `writeReport` not explicitly false → write to that path
 *   - format `'terminal'` (default) and writeReport unset → write `<root>/DRIFT_REPORT.md`
 *   - format `'json'` / `'sarif'` and writeReport unset → DO NOT write the markdown
 *     file (machine-output modes stay clean by default; matches v1.0 behaviour)
 */
export async function emitReport(
  report: DriftReport,
  optsOrConfig: EmitOptions | DriftConfig,
  legacyOutputDir?: string,
): Promise<void> {
  let format: EmitFormat;
  let config: DriftConfig;
  let legacyMode = false;

  if (optsOrConfig && typeof (optsOrConfig as EmitOptions).format === 'string') {
    ({ format, config } = optsOrConfig as EmitOptions);
  } else {
    legacyMode = true;
    config = optsOrConfig as DriftConfig;
    format = 'terminal';
  }

  if (format === 'json') {
    process.stdout.write(generateJsonReport(report) + '\n');
    process.stderr.write(briefSummary(report) + '\n');
  } else if (format === 'sarif') {
    process.stdout.write(generateSarifReport(report) + '\n');
    process.stderr.write(briefSummary(report) + '\n');
  } else {
    process.stdout.write(generateTerminalReport(report));
  }

  const writeReportFlag = config.writeReport;
  const reportPathSet = typeof config.reportPath === 'string';

  let shouldWrite: boolean;
  if (writeReportFlag === false) {
    shouldWrite = false;
  } else if (writeReportFlag === true || reportPathSet || legacyMode) {
    shouldWrite = true;
  } else {
    // writeReport not explicitly set: default depends on format.
    // Terminal mode keeps the v1.0 behaviour (write DRIFT_REPORT.md);
    // machine-output modes stay clean unless the user opts in.
    shouldWrite = format === 'terminal';
  }

  if (shouldWrite) {
    const reportPath =
      config.reportPath ??
      (legacyOutputDir
        ? path.join(legacyOutputDir, 'DRIFT_REPORT.md')
        : path.join(report.root, 'DRIFT_REPORT.md'));
    await writeMarkdownReport(report, reportPath);
  }
}


