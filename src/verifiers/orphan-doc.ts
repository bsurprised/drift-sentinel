import path from 'node:path';
import type {
  Verifier,
  DriftIssue,
  DocReference,
  DocSource,
  ProjectContext,
  SymbolResolver,
} from '../types.js';

const entryPatterns = [
  /README/i,
  /index\.md$/i,
  /CHANGELOG/i,
  /CONTRIBUTING/i,
  /CODE_OF_CONDUCT/i,
  /LICENSE/i,
  /SECURITY/i,
];

export class OrphanDocVerifier implements Verifier {
  kind = 'orphan-doc' as const;

  async check(
    _ref: DocReference,
    _ctx: ProjectContext,
    _resolvers: Map<string, SymbolResolver>,
  ): Promise<DriftIssue | null> {
    // Orphan detection requires the full doc set; use checkAll() instead.
    return null;
  }

  async checkAll(
    docs: DocSource[],
    allReferences: DocReference[],
    ctx: ProjectContext,
  ): Promise<DriftIssue[]> {
    const docPaths = new Set(docs.map(d => path.resolve(d.path)));

    // Initialize in-degree to 0 for every doc
    const inDegree = new Map<string, number>();
    for (const docPath of docPaths) {
      inDegree.set(docPath, 0);
    }

    // Count incoming link-file references
    for (const ref of allReferences) {
      if (ref.kind !== 'link-file') continue;
      const target = path.resolve(
        path.dirname(ref.source.path),
        ref.target.split('#')[0],
      );
      if (inDegree.has(target)) {
        inDegree.set(target, (inDegree.get(target) || 0) + 1);
      }
    }

    // Collect orphans (in-degree 0, not an entry point)
    const orphans: DriftIssue[] = [];
    for (const [docPath, degree] of inDegree) {
      if (degree > 0) continue;
      const relativePath = path.relative(ctx.root, docPath);
      if (entryPatterns.some(p => p.test(relativePath))) continue;

      orphans.push({
        reference: {
          id: `orphan:${relativePath}`,
          source: { path: docPath, line: 1, column: 1 },
          kind: 'link-file',
          target: relativePath,
          context: 'Orphan document detection',
        },
        kind: 'orphan-doc',
        severity: 'low',
        message: 'No other doc or source file links to this file',
        suggestion: 'Consider deleting or linking from the docs index',
        autoFixable: false,
      });
    }

    return orphans;
  }
}
