export type {
  DriftKind,
  Severity,
  DocSource,
  ParsedDoc,
  DocReference,
  DriftIssue,
  ProjectContext,
  DriftReport,
  DriftConfig,
  SymbolResolver,
  ResolveResult,
  Verifier,
} from './types.js';
export { DEFAULT_CONFIG, loadConfig, isRuleEnabled, getEffectiveSeverity } from './config.js';
export { runAudit } from './audit.js';
export { emitReport } from './report/index.js';
export { applyFixes, generatePatches, writePatchFile } from './fixer/index.js';
