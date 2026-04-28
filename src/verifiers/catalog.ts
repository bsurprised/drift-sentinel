import type { DriftKind, Severity } from '../types.js';

export const VERIFIER_DESCRIPTIONS: Record<DriftKind, { defaultSeverity: Severity; description: string }> = {
  'dead-external-link':    { defaultSeverity: 'medium', description: 'External URL returns 4xx / 5xx.' },
  'dead-file-ref':         { defaultSeverity: 'high',   description: 'File reference (link or inline) does not exist.' },
  'missing-symbol':        { defaultSeverity: 'high',   description: 'Inline-code symbol not found in the project.' },
  'invalid-code-example':  { defaultSeverity: 'medium', description: 'Fenced code block does not compile / type-check.' },
  'unknown-cli-command':   { defaultSeverity: 'medium', description: 'CLI invocation in docs is not a known command.' },
  'version-mismatch':      { defaultSeverity: 'low',    description: 'Documented version differs from the project version.' },
  'deprecated-api-mention':{ defaultSeverity: 'medium', description: 'Doc references an API marked deprecated.' },
  'orphan-doc':            { defaultSeverity: 'low',    description: 'Markdown file is not linked from anywhere.' },
};

/**
 * Single source of truth for the set of valid DriftKind values at runtime.
 * Derived from VERIFIER_DESCRIPTIONS so that adding a new DriftKind without
 * a description is a compile-time error (Record exhaustiveness check).
 */
export const VALID_DRIFT_KINDS: readonly DriftKind[] =
  Object.keys(VERIFIER_DESCRIPTIONS) as DriftKind[];

