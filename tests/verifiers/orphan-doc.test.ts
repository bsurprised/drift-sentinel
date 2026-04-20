import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { OrphanDocVerifier } from '../../src/verifiers/orphan-doc.js';
import type { DocSource, DocReference, ProjectContext } from '../../src/types.js';

const ROOT = path.resolve('/project');

function ctx(): ProjectContext {
  return { root: ROOT, detectedLanguages: [], makefileTargets: [] };
}

function makeDocSource(p: string): DocSource {
  return { path: path.resolve(p), type: 'markdown', content: '' };
}

function makeFileRef(fromPath: string, toTarget: string, line = 1): DocReference {
  return {
    id: `test-${fromPath}-${toTarget}`,
    source: { path: path.resolve(fromPath), line, column: 1 },
    kind: 'link-file',
    target: toTarget,
    context: 'test',
  };
}

describe('OrphanDocVerifier', () => {
  const verifier = new OrphanDocVerifier();

  it('check() returns null', async () => {
    const result = await verifier.check(
      {
        id: 'x',
        source: { path: 'a.md', line: 1, column: 1 },
        kind: 'link-file',
        target: 'b.md',
        context: '',
      },
      ctx(),
      new Map(),
    );
    expect(result).toBeNull();
  });

  it('reports no orphans when all docs are linked', async () => {
    const docs = [
      makeDocSource('/project/docs/a.md'),
      makeDocSource('/project/docs/b.md'),
      makeDocSource('/project/docs/c.md'),
    ];
    const refs = [
      makeFileRef('/project/docs/a.md', 'b.md'),
      makeFileRef('/project/docs/b.md', 'c.md'),
      makeFileRef('/project/docs/c.md', 'a.md'),
    ];
    const issues = await verifier.checkAll(docs, refs, ctx());
    expect(issues).toHaveLength(0);
  });

  it('detects one orphan when a doc has no incoming links', async () => {
    const docs = [
      makeDocSource('/project/docs/a.md'),
      makeDocSource('/project/docs/b.md'),
      makeDocSource('/project/docs/c.md'),
    ];
    const refs = [
      makeFileRef('/project/docs/a.md', 'b.md'),
      makeFileRef('/project/docs/b.md', 'a.md'),
      // c.md has no incoming link
    ];
    const issues = await verifier.checkAll(docs, refs, ctx());
    expect(issues).toHaveLength(1);
    expect(issues[0].kind).toBe('orphan-doc');
    expect(issues[0].severity).toBe('low');
    expect(issues[0].reference.target).toContain('c.md');
  });

  it('never reports README as orphan', async () => {
    const docs = [
      makeDocSource('/project/README.md'),
      makeDocSource('/project/docs/a.md'),
    ];
    const refs = [
      makeFileRef('/project/README.md', 'docs/a.md'),
    ];
    const issues = await verifier.checkAll(docs, refs, ctx());
    expect(issues).toHaveLength(0);
  });

  it('never reports index.md as orphan', async () => {
    const docs = [
      makeDocSource('/project/docs/index.md'),
      makeDocSource('/project/docs/a.md'),
    ];
    const refs = [
      makeFileRef('/project/docs/index.md', 'a.md'),
    ];
    const issues = await verifier.checkAll(docs, refs, ctx());
    expect(issues).toHaveLength(0);
  });

  it('never reports CHANGELOG as orphan', async () => {
    const docs = [makeDocSource('/project/CHANGELOG.md')];
    const issues = await verifier.checkAll(docs, [], ctx());
    expect(issues).toHaveLength(0);
  });

  it('detects multiple orphans', async () => {
    const docs = [
      makeDocSource('/project/docs/a.md'),
      makeDocSource('/project/docs/b.md'),
      makeDocSource('/project/docs/c.md'),
      makeDocSource('/project/docs/d.md'),
      makeDocSource('/project/docs/e.md'),
    ];
    const refs = [
      makeFileRef('/project/docs/a.md', 'b.md'),
      makeFileRef('/project/docs/b.md', 'c.md'),
      makeFileRef('/project/docs/c.md', 'a.md'),
      // d.md and e.md have no incoming links
    ];
    const issues = await verifier.checkAll(docs, refs, ctx());
    expect(issues).toHaveLength(2);
    const targets = issues.map(i => i.reference.target);
    expect(targets).toContain(path.relative(ROOT, path.resolve('/project/docs/d.md')));
    expect(targets).toContain(path.relative(ROOT, path.resolve('/project/docs/e.md')));
  });

  it('returns no orphans for empty doc set', async () => {
    const issues = await verifier.checkAll([], [], ctx());
    expect(issues).toHaveLength(0);
  });

  it('returns no orphans when all docs are entry points', async () => {
    const docs = [
      makeDocSource('/project/README.md'),
      makeDocSource('/project/CONTRIBUTING.md'),
    ];
    const issues = await verifier.checkAll(docs, [], ctx());
    expect(issues).toHaveLength(0);
  });
});
