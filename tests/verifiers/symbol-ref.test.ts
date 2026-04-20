import { describe, it, expect } from 'vitest';
import { SymbolRefVerifier } from '../../src/verifiers/symbol-ref.js';
import type { DocReference, ProjectContext, SymbolResolver, ResolveResult } from '../../src/types.js';

function makeRef(overrides: Partial<DocReference> = {}): DocReference {
  return {
    id: 'ref-1',
    source: { path: 'docs/api.md', line: 10, column: 1 },
    kind: 'symbol',
    target: 'UserService.register',
    context: 'Call `UserService.register()` to create a new user.',
    ...overrides,
  };
}

const ctx: ProjectContext = {
  root: '/project',
  detectedLanguages: ['typescript'],
  makefileTargets: [],
};

function makeTsResolver(overrides: Partial<SymbolResolver> = {}): SymbolResolver {
  return {
    language: 'typescript',
    canHandle: () => true,
    resolve: async (symbol: string): Promise<ResolveResult> => {
      if (symbol === 'UserService.register')
        return { found: true, locations: [{ file: 'user.ts', line: 10, column: 3 }], deprecated: false };
      if (symbol === 'UserService.createUser')
        return { found: false, locations: [], deprecated: false };
      if (symbol === 'OldService.doStuff')
        return { found: true, locations: [{ file: 'old.ts', line: 5, column: 1 }], deprecated: true, deprecationMessage: 'Use NewService' };
      return { found: true, locations: [], deprecated: false };
    },
    ...overrides,
  };
}

function makeGrepResolver(overrides: Partial<SymbolResolver> = {}): SymbolResolver {
  return {
    language: 'grep',
    canHandle: () => true,
    resolve: async (symbol: string): Promise<ResolveResult> => {
      if (symbol === 'UserService.register')
        return { found: true, locations: [{ file: 'user.ts', line: 10, column: 1 }], deprecated: false };
      if (symbol === 'UserService.createUser')
        return { found: false, locations: [], deprecated: false };
      return { found: true, locations: [], deprecated: false };
    },
    ...overrides,
  };
}

describe('SymbolRefVerifier', () => {
  const verifier = new SymbolRefVerifier();

  it('returns null for non-symbol references', async () => {
    const ref = makeRef({ kind: 'link-external' });
    const result = await verifier.check(ref, ctx, new Map());
    expect(result).toBeNull();
  });

  it('returns null when no resolvers are available', async () => {
    const ref = makeRef();
    const result = await verifier.check(ref, ctx, new Map());
    expect(result).toBeNull();
  });

  it('returns null for existing symbol', async () => {
    const resolvers = new Map<string, SymbolResolver>([['typescript', makeTsResolver()]]);
    const ref = makeRef({ target: 'UserService.register' });
    const result = await verifier.check(ref, ctx, resolvers);
    expect(result).toBeNull();
  });

  it('returns HIGH severity for missing symbol with TS resolver', async () => {
    const resolvers = new Map<string, SymbolResolver>([['typescript', makeTsResolver()]]);
    const ref = makeRef({ target: 'UserService.createUser' });
    const result = await verifier.check(ref, ctx, resolvers);
    expect(result).not.toBeNull();
    expect(result!.severity).toBe('high');
    expect(result!.kind).toBe('missing-symbol');
    expect(result!.message).toContain('UserService.createUser');
    expect(result!.message).toContain('typescript');
  });

  it('returns MEDIUM severity for missing symbol with grep resolver', async () => {
    const resolvers = new Map<string, SymbolResolver>([['grep', makeGrepResolver()]]);
    const ref = makeRef({ target: 'UserService.createUser' });
    const result = await verifier.check(ref, ctx, resolvers);
    expect(result).not.toBeNull();
    expect(result!.severity).toBe('medium');
    expect(result!.kind).toBe('missing-symbol');
  });

  it('returns null for deprecated symbol (handled by deprecated-api verifier)', async () => {
    const resolvers = new Map<string, SymbolResolver>([['typescript', makeTsResolver()]]);
    const ref = makeRef({ target: 'OldService.doStuff' });
    const result = await verifier.check(ref, ctx, resolvers);
    expect(result).toBeNull();
  });

  it('prefers typescript resolver over grep', async () => {
    const resolvers = new Map<string, SymbolResolver>([
      ['typescript', makeTsResolver()],
      ['grep', makeGrepResolver()],
    ]);
    const ref = makeRef({ target: 'UserService.createUser' });
    const result = await verifier.check(ref, ctx, resolvers);
    expect(result).not.toBeNull();
    expect(result!.severity).toBe('high'); // TS → high confidence
  });
});
