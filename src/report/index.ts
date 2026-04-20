import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { DriftReport, DriftConfig } from '../types.js';
import { generateMarkdownReport, writeMarkdownReport } from './markdown.js';
import { generateJsonReport } from './json.js';
import { generateSarifReport } from './sarif.js';
import { generateTerminalReport } from './terminal.js';

export { generateMarkdownReport, writeMarkdownReport } from './markdown.js';
export { generateJsonReport } from './json.js';
export { generateSarifReport } from './sarif.js';
export { generateTerminalReport } from './terminal.js';

export async function emitReport(
  report: DriftReport,
  config: DriftConfig,
  outputDir: string,
): Promise<void> {
  // Always print to terminal
  console.log(generateTerminalReport(report));

  if (config.json) {
    console.log(generateJsonReport(report));
  } else if (config.sarif) {
    const sarifPath = path.join(outputDir, 'drift-report.sarif');
    await writeFile(sarifPath, generateSarifReport(report), 'utf-8');
  } else {
    // Default: write DRIFT_REPORT.md
    await writeMarkdownReport(report, path.join(outputDir, 'DRIFT_REPORT.md'));
  }
}
