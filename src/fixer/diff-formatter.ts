import type { PatchEntry } from './patch-parser.js';

/**
 * Format a PatchEntry as a unified diff hunk.
 */
export function formatUnifiedDiff(patch: PatchEntry): string {
  return [
    `--- a/${patch.file}`,
    `+++ b/${patch.file}`,
    `@@ -${patch.line},1 +${patch.line},1 @@`,
    `-${patch.original}`,
    `+${patch.replacement}`,
  ].join('\n');
}
