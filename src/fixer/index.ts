import * as fs from 'node:fs/promises';
import path from 'node:path';
import { DriftReport } from '../types.js';
import { parsePatch } from './patch-parser.js';
import { formatUnifiedDiff } from './diff-formatter.js';
import { getLogger } from '../util/logger.js';

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

  const byFile = groupByFile(patches);

  let applied = 0;
  let skipped = 0;

  for (const [filePath, filePatches] of byFile) {
    // Security: ensure path is within project root
    const resolvedPath = path.resolve(filePath);
    const resolvedRoot = path.resolve(report.root);
    const normalizedRoot = resolvedRoot.endsWith(path.sep) ? resolvedRoot : resolvedRoot + path.sep;
    if (resolvedPath !== resolvedRoot && !resolvedPath.startsWith(normalizedRoot)) {
      for (const p of filePatches) p.applied = false;
      skipped += filePatches.length;
      continue;
    }

    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const eol = content.includes('\r\n') ? '\r\n' : '\n';
      const lines = content.split(eol);

      // Apply patches in reverse line order to avoid line shifts
      const sorted = filePatches.sort((a, b) => b.line - a.line);

      for (const patch of sorted) {
        const lineIdx = patch.line - 1;
        if (lineIdx >= 0 && lineIdx < lines.length) {
          const currentLine = lines[lineIdx];
          if (currentLine.includes(patch.original)) {
            lines[lineIdx] = currentLine.replace(patch.original, patch.replacement);
            patch.applied = true;
            applied++;
          } else {
            patch.applied = false;
            skipped++;
          }
        } else {
          patch.applied = false;
          skipped++;
        }
      }

      await fs.writeFile(filePath, lines.join(eol), 'utf-8');
    } catch (err) {
      const logger = getLogger();
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
