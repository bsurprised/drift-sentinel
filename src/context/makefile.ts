/**
 * Extract target names from Makefile content.
 */
export function extractMakefileTargets(content: string): string[] {
  const targets: string[] = [];
  for (const line of content.split('\n')) {
    const match = line.match(/^([a-zA-Z_][a-zA-Z0-9_-]*):/);
    if (match && !match[1].startsWith('.')) {
      targets.push(match[1]);
    }
  }
  return targets;
}
