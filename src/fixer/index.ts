import * as fs from 'node:fs/promises';
import path from 'node:path';
import { DriftReport } from '../types.js';
import { parsePatch } from './patch-parser.js';
import { formatUnifiedDiff } from './diff-formatter.js';
import { getLogger } from '../util/logger.js';
import { lineHash as computeLineHash } from '../util/lineHash.js';

export type { PatchEntry } from './patch-parser.js';
export { parsePatch } from './patch-parser.js';
export { formatUnifiedDiff } from './diff-formatter.js';

export interface FixResult {
  applied: number;
  skipped: number;
  patches: import('./patch-parser.js').PatchEntry[];
}

/**
 * Generate patches for all auto-fixable issues in the report.
 */
export function generatePatches(report: DriftReport): import('./patch-parser.js').PatchEntry[] {
  return report.issues
    .filter(issue => issue.autoFixable && issue.patch)
    .map(issue => parsePatch(issue))
    .filter((p): p is import('./patch-parser.js').PatchEntry => p !== null);
}

function groupByFile(patches: import('./patch-parser.js').PatchEntry[]): Map<string, import('./patch-parser.js').PatchEntry[]> {
  const map = new Map<string, import('./patch-parser.js').PatchEntry[]>();
  for (const patch of patches) {
    const existing = map.get(patch.file) || [];
    existing.push(patch);
    map.set(patch.file, existing);
  }
  return map;
}

function detectEol(content: string): '\r\n' | '\n' {
  return content.includes('\r\n') ? '\r\n' : '\n';
}

/**
 * Apply a pre-built list of patches directly to their target files.
 * Useful for testing or for callers that construct PatchEntry objects manually
 * (e.g. with explicit column / lineHash fields set).
 */
export async function applyPatchList(
  patches: import('./patch-parser.js').PatchEntry[],
  root: string,
): Promise<FixResult> {
  const byFile = groupByFile(patches);
  const logger = getLogger();

  let applied = 0;
  let skipped = 0;

  for (const [filePath, filePatches] of byFile) {
    // Security: ensure path is within project root
    const resolvedPath = path.resolve(filePath);
    const resolvedRoot = path.resolve(root);
    const normalizedRoot = resolvedRoot.endsWith(path.sep) ? resolvedRoot : resolvedRoot + path.sep;
    if (resolvedPath !== resolvedRoot && !resolvedPath.startsWith(normalizedRoot)) {
      for (const p of filePatches) p.applied = false;
      skipped += filePatches.length;
      continue;
    }

    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const eol = detectEol(content);
      const hadTrailingEol = content.endsWith(eol);
      const lines = content.split(/\r?\n/);

      // Remove the trailing empty element produced by a final newline so that
      // join(eol) + conditional eol reconstructs the file faithfully.
      if (hadTrailingEol && lines[lines.length - 1] === '') {
        lines.pop();
      }

      // Apply patches in reverse line order to avoid line-index shifts
      const sorted = [...filePatches].sort((a, b) => b.line - a.line);

      for (const patch of sorted) {
        const idx = patch.line - 1;
        if (idx < 0 || idx >= lines.length) {
          patch.applied = false;
          skipped++;
          continue;
        }

        const current = lines[idx];

        // Stale-line guard: skip if the line has changed since audit was emitted
        if (patch.lineHash && computeLineHash(current) !== patch.lineHash) {
          logger.warn(
            { filePath, line: patch.line },
            'skipping fix — line has changed since audit',
          );
          patch.applied = false;
          skipped++;
          continue;
        }

        // Determine replacement position
        let pos: number;
        if (typeof patch.column === 'number' && typeof patch.originalLength === 'number') {
          // Column-anchored match (B-08): verify the text at the exact position
          const col0 = patch.column - 1;
          const slice = current.slice(col0, col0 + patch.originalLength);
          if (slice !== patch.original) {
            logger.warn({ filePath, line: patch.line }, 'column mismatch at fix site');
            patch.applied = false;
            skipped++;
            continue;
          }
          pos = col0;
        } else {
          // Fallback: first-occurrence match
          pos = current.indexOf(patch.original);
          if (pos === -1) {
            patch.applied = false;
            skipped++;
            continue;
          }
        }

        lines[idx] =
          current.slice(0, pos) +
          patch.replacement +
          current.slice(pos + patch.original.length);
        patch.applied = true;
        applied++;
      }

      // Reconstruct file, preserving original EOL style and trailing-newline presence
      let next = lines.join(eol);
      if (hadTrailingEol) next += eol;
      await fs.writeFile(filePath, next, 'utf-8');
    } catch (err) {
      logger.warn({ filePath, err }, 'Failed to apply patches to file');
      for (const p of filePatches) {
        p.applied = false;
      }
      skipped += filePatches.length;
    }
  }

  return { applied, skipped, patches };
}

/**
 * Apply patches to files. If dryRun is true, only return what would change.
 */
export async function applyFixes(
  report: DriftReport,
  options: { dryRun: boolean }
): Promise<FixResult> {
  const patches = generatePatches(report);

  if (options.dryRun) {
    return {
      applied: 0,
      skipped: patches.length,
      patches: patches.map(p => ({ ...p, applied: false })),
    };
  }

  return applyPatchList(patches, report.root);
}

/**
 * Write a unified diff patch file.
 */
export async function writePatchFile(
  patches: import('./patch-parser.js').PatchEntry[],
  outputPath: string
): Promise<void> {
  const patchContent = patches
    .map(p => formatUnifiedDiff(p))
    .join('\n');
  await fs.writeFile(outputPath, patchContent, 'utf-8');
}
