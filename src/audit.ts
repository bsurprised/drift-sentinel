import type { DriftConfig, DriftReport } from './types.js';
import { runPipeline } from './pipeline.js';

export async function runAudit(root: string, config: DriftConfig): Promise<DriftReport> {
  return runPipeline(root, config);
}
