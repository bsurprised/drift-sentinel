import { DriftReport } from '../types.js';

export function generateJsonReport(report: DriftReport): string {
  return JSON.stringify(report, null, 2);
}
