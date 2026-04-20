import type { Verifier, DriftIssue, DocReference, ProjectContext, SymbolResolver } from '../types.js';

const TUTORIAL_PATHS = ['tutorial', 'quickstart', 'getting-started', 'guide'];

export class DeprecatedApiVerifier implements Verifier {
  kind = 'deprecated-api-mention' as const;

  async check(
    ref: DocReference,
    _ctx: ProjectContext,
    resolvers: Map<string, SymbolResolver>,
  ): Promise<DriftIssue | null> {
    if (ref.kind !== 'symbol') return null;

    const resolver = this.pickResolver(resolvers);
    if (!resolver) return null;

    const result = await resolver.resolve(ref.target, ref);

    if (!result.found || !result.deprecated) return null;

    const isTutorial = TUTORIAL_PATHS.some((p) =>
      ref.source.path.toLowerCase().includes(p),
    );

    return {
      reference: ref,
      kind: 'deprecated-api-mention',
      severity: isTutorial ? 'medium' : 'low',
      message: `\`${ref.target}\` is marked @deprecated${result.deprecationMessage ? ` (${result.deprecationMessage})` : ''}`,
      suggestion:
        result.deprecationMessage ||
        'Consider updating documentation to use the recommended replacement',
      autoFixable: false,
    };
  }

  private pickResolver(resolvers: Map<string, SymbolResolver>): SymbolResolver | null {
    return resolvers.get('typescript') ?? resolvers.get('grep') ?? null;
  }
}
