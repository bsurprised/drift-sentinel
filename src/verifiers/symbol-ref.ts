import type { Verifier, DriftIssue, DocReference, ProjectContext, SymbolResolver } from '../types.js';

export class SymbolRefVerifier implements Verifier {
  kind = 'missing-symbol' as const;

  async check(
    ref: DocReference,
    _ctx: ProjectContext,
    resolvers: Map<string, SymbolResolver>,
  ): Promise<DriftIssue | null> {
    if (ref.kind !== 'symbol') return null;

    const [resolverName, resolver] = this.pickResolver(resolvers);
    if (!resolver) return null;

    const result = await resolver.resolve(ref.target, ref);

    if (result.found && result.deprecated) {
      // Handled by DeprecatedApiVerifier
      return null;
    }

    if (result.found) return null;

    const isHighConfidence = resolverName === 'typescript';

    return {
      reference: ref,
      kind: 'missing-symbol',
      severity: isHighConfidence ? 'high' : 'medium',
      message: `\`${ref.target}\` is not defined in the ${resolver.language} project`,
      suggestion: undefined,
      autoFixable: false,
    };
  }

  private pickResolver(
    resolvers: Map<string, SymbolResolver>,
  ): [string, SymbolResolver] | [string, null] {
    const ts = resolvers.get('typescript');
    if (ts) return ['typescript', ts];

    const grep = resolvers.get('grep');
    if (grep) return ['grep', grep];

    return ['', null];
  }
}
