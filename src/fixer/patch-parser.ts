import { DriftIssue } from '../types.js';

export interface PatchEntry {
  file: string;
  line: number;
  kind: string;
  original: string;
  replacement: string;
  applied: boolean;
  /** 1-based character column within the line where original starts. */
  column?: number;
  /** Byte length of original (pre-computed for column-anchored slice). */
  originalLength?: number;
  /** sha256[:16] of the normalised source line at audit time (stale guard). */
  lineHash?: string;
}

/**
 * Remove the leading `-`/`+` diff marker from a patch line.
 * If the character immediately after the marker is an ASCII space (unified-diff
 * separator convention), that space is also stripped; otherwise only the marker
 * itself is removed.  `.trim()` is intentionally NOT used so that meaningful
 * leading/trailing whitespace in the original content is preserved (B-07).
 */
function stripPrefix(line: string): string {
  if (line.length === 0) return line;
  const head = line[0];
  if (head !== '-' && head !== '+') return line;
  return line[1] === ' ' ? line.slice(2) : line.slice(1);
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
      original = stripPrefix(line);
    } else if (line.startsWith('+') && !line.startsWith('+++')) {
      replacement = stripPrefix(line);
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
    originalLength: original.length,
  };
}
