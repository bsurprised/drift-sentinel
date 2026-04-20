import { describe, it, expect } from 'vitest';
import { DeprecatedApiVerifier } from '../../src/verifiers/deprecated-api.js';
import type { DocReference, ProjectContext, SymbolResolver, ResolveResult } from '../../src/types.js';

function makeRef(overrides: Partial<DocReference> = {}): DocReference {
  return {
    id: 'ref-1',
    source: { path: 'docs/api.md', line: 10, column: 1 },
    kind: 'symbol',
    target: 'OldService.doStuff',
    context: 'Use `OldService.doStuff()` to perform an action.',
    ...overrides,
  };
}

const ctx: ProjectContext = {
  root: '/project',
  detectedLanguages: ['typescript'],
  makefileTargets: [],
};

function makeTsResolver(): SymbolResolver {
  return {
    language: 'typescript',
    canHandle: () => true,
    resolve: async (symbol: string): Promise<ResolveResult> => {
      if (symbol === 'OldService.doStuff')
        return {
          found: true,
          locations: [{ file: 'old.ts', line: 5, column: 1 }],
          deprecated: true,
          deprecationMessage: 'Use NewService.doStuff instead',
        };
      if (symbol === 'DeprecatedNoMsg')
        return {
          found: true,
          locations: [{ file: 'dep.ts', line: 1, column: 1 }],
          deprecated: true,
        };
      if (symbol === 'UserService.register')
        return { found: true, locations: [{ file: 'user.ts', line: 10, column: 3 }], deprecated: false };
      if (symbol === 'Missing.thing')
        return { found: false, locations: [], deprecated: false };
      return { found: true, locations: [], deprecated: false };
    },
  };
}

describe('DeprecatedApiVerifier', () => {
  const verifier = new DeprecatedApiVerifier();

  it('returns null for non-symbol references', async () => {
    const ref = makeRef({ kind: 'code-block' });
    const result = await verifier.check(ref, ctx, new Map());
    expect(result).toBeNull();
  });

  it('returns null when no resolvers are available', async () => {
    const ref = makeRef();
    const result = await verifier.check(ref, ctx, new Map());
    expect(result).toBeNull();
  });

  it('returns null for non-deprecated symbol', async () => {
    const resolvers = new Map<string, SymbolResolver>([['typescript', makeTsResolver()]]);
    const ref = makeRef({ target: 'UserService.register' });
    const result = await verifier.check(ref, ctx, resolvers);
    expect(result).toBeNull();
  });

  it('returns null for missing symbol (handled by symbol-ref verifier)', async () => {
    const resolvers = new Map<string, SymbolResolver>([['typescript', makeTsResolver()]]);
    const ref = makeRef({ target: 'Missing.thing' });
    const result = await verifier.check(ref, ctx, resolvers);
    expect(result).toBeNull();
  });

  it('returns LOW severity for deprecated symbol in non-tutorial path', async () => {
    const resolvers = new Map<string, SymbolResolver>([['typescript', makeTsResolver()]]);
    const ref = makeRef({
      target: 'OldService.doStuff',
      source: { path: 'docs/api-reference.md', line: 5, column: 1 },
    });
    const result = await verifier.check(ref, ctx, resolvers);
    expect(result).not.toBeNull();
    expect(result!.kind).toBe('deprecated-api-mention');
    expect(result!.severity).toBe('low');
    expect(result!.message).toContain('OldService.doStuff');
    expect(result!.message).toContain('@deprecated');
  });

  it('returns MEDIUM severity for deprecated symbol in tutorial path', async () => {
    const resolvers = new Map<string, SymbolResolver>([['typescript', makeTsResolver()]]);
    const ref = makeRef({
      target: 'OldService.doStuff',
      source: { path: 'docs/tutorial/getting-started.md', line: 5, column: 1 },
    });
    const result = await verifier.check(ref, ctx, resolvers);
    expect(result).not.toBeNull();
    expect(result!.severity).toBe('medium');
  });

  it.each([
    'docs/tutorial/basics.md',
    'docs/quickstart.md',
    'docs/getting-started/intro.md',
    'content/guide/advanced.md',
  ])('detects tutorial path: %s', async (docPath) => {
    const resolvers = new Map<string, SymbolResolver>([['typescript', makeTsResolver()]]);
    const ref = makeRef({
      target: 'OldService.doStuff',
      source: { path: docPath, line: 1, column: 1 },
    });
    const result = await verifier.check(ref, ctx, resolvers);
    expect(result).not.toBeNull();
    expect(result!.severity).toBe('medium');
  });

  it('includes deprecation message in the issue', async () => {
    const resolvers = new Map<string, SymbolResolver>([['typescript', makeTsResolver()]]);
    const ref = makeRef({ target: 'OldService.doStuff' });
    const result = await verifier.check(ref, ctx, resolvers);
    expect(result).not.toBeNull();
    expect(result!.message).toContain('Use NewService.doStuff instead');
    expect(result!.suggestion).toBe('Use NewService.doStuff instead');
  });

  it('uses fallback suggestion when no deprecation message', async () => {
    const resolvers = new Map<string, SymbolResolver>([['typescript', makeTsResolver()]]);
    const ref = makeRef({ target: 'DeprecatedNoMsg' });
    const result = await verifier.check(ref, ctx, resolvers);
    expect(result).not.toBeNull();
    expect(result!.suggestion).toBe('Consider updating documentation to use the recommended replacement');
  });
});
