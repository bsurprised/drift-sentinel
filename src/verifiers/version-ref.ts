import type { Verifier, DriftIssue, DocReference, ProjectContext, SymbolResolver } from '../types.js';

function stripV(version: string): string {
  return version.replace(/^v/i, '');
}

function getProjectVersion(ctx: ProjectContext): { version: string; source: string } | null {
  if (ctx.packageJson?.version) {
    return { version: ctx.packageJson.version, source: 'package.json' };
  }
  if (ctx.cargoToml?.package?.version) {
    return { version: ctx.cargoToml.package.version, source: 'Cargo.toml' };
  }
  if (ctx.pyproject?.project?.version) {
    return { version: ctx.pyproject.project.version, source: 'pyproject.toml' };
  }
  if (ctx.csprojs?.[0]?.version) {
    return { version: ctx.csprojs[0].version, source: ctx.csprojs[0].path };
  }
  return null;
}

function generateVersionPatch(ref: DocReference, actualVersion: string): string {
  return `--- ${ref.source.path}\n+++ ${ref.source.path}\n@@ -${ref.source.line} @@\n-${ref.target}\n+v${actualVersion}`;
}

export class VersionRefVerifier implements Verifier {
  kind = 'version-mismatch' as const;

  async check(
    ref: DocReference,
    ctx: ProjectContext,
    _resolvers: Map<string, SymbolResolver>,
  ): Promise<DriftIssue | null> {
    if (ref.kind !== 'version-ref') return null;

    const projectInfo = getProjectVersion(ctx);
    if (!projectInfo) return null;

    const docVersion = stripV(ref.target);
    const actualVersion = stripV(projectInfo.version);

    if (docVersion === actualVersion) return null;

    return {
      reference: ref,
      kind: 'version-mismatch',
      severity: 'low',
      message: `Documentation says v${docVersion}, but ${projectInfo.source} is v${actualVersion}`,
      suggestion: `Update the version reference to v${actualVersion}`,
      autoFixable: true,
      patch: generateVersionPatch(ref, actualVersion),
    };
  }
}
