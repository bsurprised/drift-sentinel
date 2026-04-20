import { describe, it, expect } from 'vitest';
import { ResolverRegistry, createDefaultRegistry } from '../../src/resolvers/registry.js';
import { TypeScriptResolver } from '../../src/resolvers/typescript.js';
import { GrepResolver } from '../../src/resolvers/grep.js';
import type { ProjectContext } from '../../src/types.js';

function tsProject(root = '/fake'): ProjectContext {
  return {
    root,
    detectedLanguages: ['typescript'],
    makefileTargets: [],
  };
}

function pythonProject(root = '/fake'): ProjectContext {
  return {
    root,
    detectedLanguages: ['python'],
    makefileTargets: [],
  };
}

describe('ResolverRegistry', () => {
  it('registers resolvers and retrieves by priority', () => {
    const registry = new ResolverRegistry();
    const ts = new TypeScriptResolver('/fake/tsconfig.json');
    const grep = new GrepResolver();
    registry.register(ts);
    registry.register(grep);

    const resolver = registry.getResolver(tsProject());
    expect(resolver).toBe(ts);
  });

  it('TypeScript resolver is preferred over grep when both can handle', () => {
    const registry = new ResolverRegistry();
    const ts = new TypeScriptResolver('/fake/tsconfig.json');
    const grep = new GrepResolver();
    registry.register(ts);
    registry.register(grep);

    const resolver = registry.getResolver(tsProject());
    expect(resolver?.language).toBe('typescript');
  });

  it('falls back to grep when TS cannot handle', () => {
    const registry = new ResolverRegistry();
    const ts = new TypeScriptResolver('/fake/tsconfig.json');
    const grep = new GrepResolver();
    registry.register(ts);
    registry.register(grep);

    const resolver = registry.getResolver(pythonProject());
    expect(resolver?.language).toBe('grep');
  });

  it('returns undefined when no resolver matches', () => {
    const registry = new ResolverRegistry();
    // Register nothing
    const resolver = registry.getResolver(pythonProject());
    expect(resolver).toBeUndefined();
  });

  it('getAll returns map of all resolvers', () => {
    const registry = new ResolverRegistry();
    registry.register(new TypeScriptResolver('/fake/tsconfig.json'));
    registry.register(new GrepResolver());
    const all = registry.getAll();
    expect(all.size).toBe(2);
    expect(all.has('typescript')).toBe(true);
    expect(all.has('grep')).toBe(true);
  });

  it('disposeAll calls dispose on all resolvers', async () => {
    const registry = new ResolverRegistry();
    const ts = new TypeScriptResolver('/fake/tsconfig.json');
    registry.register(ts);
    registry.register(new GrepResolver());
    // Should not throw
    await registry.disposeAll();
  });
});

describe('createDefaultRegistry', () => {
  it('includes TS resolver for TypeScript projects', () => {
    const registry = createDefaultRegistry(tsProject());
    const all = registry.getAll();
    expect(all.has('typescript')).toBe(true);
    expect(all.has('grep')).toBe(true);
  });

  it('includes only grep for non-TS projects', () => {
    const registry = createDefaultRegistry(pythonProject());
    const all = registry.getAll();
    expect(all.has('typescript')).toBe(false);
    expect(all.has('grep')).toBe(true);
  });

  it('TS resolver is prioritised in getResolver', () => {
    const registry = createDefaultRegistry(tsProject());
    const resolver = registry.getResolver(tsProject());
    expect(resolver?.language).toBe('typescript');
  });
});
