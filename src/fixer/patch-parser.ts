import { DriftIssue } from '../types.js';

export interface PatchEntry {
  file: string;
  line: number;
  kind: string;
  original: string;
  replacement: string;
  applied: boolean;
}

/**
 * Parse a DriftIssue's patch field into a PatchEntry.
 * The patch field format is a simple diff:
 *   -old text
 *   +new text
 */
export function parsePatch(issue: DriftIssue): PatchEntry | null {
  if (!issue.patch) return null;

  const lines = issue.patch.split('\n');
  let original = '';
  let replacement = '';

  for (const line of lines) {
    if (line.startsWith('-') && !line.startsWith('---')) {
      original = line.slice(1).trim();
    } else if (line.startsWith('+') && !line.startsWith('+++')) {
      replacement = line.slice(1).trim();
    }
  }

  if (!original || !replacement) return null;

  return {
    file: issue.reference.source.path,
    line: issue.reference.source.line,
    kind: issue.kind,
    original,
    replacement,
    applied: false,
  };
}
