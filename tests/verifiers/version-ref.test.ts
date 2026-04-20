import { describe, it, expect } from 'vitest';
import { VersionRefVerifier } from '../../src/verifiers/version-ref.js';
import type { DocReference, ProjectContext } from '../../src/types.js';

function makeRef(target: string, kind: DocReference['kind'] = 'version-ref'): DocReference {
  return {
    id: 'test-ref',
    source: { path: 'README.md', line: 5, column: 1 },
    kind,
    target,
    context: '',
  };
}

function makeCtx(overrides: Partial<ProjectContext> = {}): ProjectContext {
  return {
    root: '/project',
    detectedLanguages: ['typescript'],
    makefileTargets: [],
    ...overrides,
  };
}

const resolvers = new Map();

describe('VersionRefVerifier', () => {
  const verifier = new VersionRefVerifier();

  it('has correct kind', () => {
    expect(verifier.kind).toBe('version-mismatch');
  });

  it('returns null for non-version-ref refs', async () => {
    const ref = makeRef('something', 'symbol');
    const result = await verifier.check(ref, makeCtx(), resolvers);
    expect(result).toBeNull();
  });

  it('doc says v1.0.0, package.json says 1.0.0 → null (match)', async () => {
    const ref = makeRef('v1.0.0');
    const ctx = makeCtx({ packageJson: { version: '1.0.0' } });
    const result = await verifier.check(ref, ctx, resolvers);
    expect(result).toBeNull();
  });

  it('doc says 1.2.3, package.json says 1.2.3 → null (match without v prefix)', async () => {
    const ref = makeRef('1.2.3');
    const ctx = makeCtx({ packageJson: { version: '1.2.3' } });
    const result = await verifier.check(ref, ctx, resolvers);
    expect(result).toBeNull();
  });

  it('doc says v1.0, package.json says 2.1.0 → LOW severity', async () => {
    const ref = makeRef('v1.0');
    const ctx = makeCtx({ packageJson: { version: '2.1.0' } });
    const result = await verifier.check(ref, ctx, resolvers);
    expect(result).not.toBeNull();
    expect(result!.severity).toBe('low');
    expect(result!.kind).toBe('version-mismatch');
    expect(result!.message).toContain('1.0');
    expect(result!.message).toContain('2.1.0');
    expect(result!.suggestion).toContain('2.1.0');
    expect(result!.autoFixable).toBe(true);
    expect(result!.patch).toBeDefined();
  });

  it('no project version available → null', async () => {
    const ref = makeRef('v1.0.0');
    const ctx = makeCtx();
    const result = await verifier.check(ref, ctx, resolvers);
    expect(result).toBeNull();
  });

  it('version in Cargo.toml matches → null', async () => {
    const ref = makeRef('v0.3.0');
    const ctx = makeCtx({
      cargoToml: { package: { name: 'myapp', version: '0.3.0' } },
    });
    const result = await verifier.check(ref, ctx, resolvers);
    expect(result).toBeNull();
  });

  it('version in Cargo.toml mismatch → LOW', async () => {
    const ref = makeRef('v0.2.0');
    const ctx = makeCtx({
      cargoToml: { package: { name: 'myapp', version: '0.3.0' } },
    });
    const result = await verifier.check(ref, ctx, resolvers);
    expect(result).not.toBeNull();
    expect(result!.severity).toBe('low');
    expect(result!.message).toContain('Cargo.toml');
  });

  it('prefers package.json version over others', async () => {
    const ref = makeRef('v1.0.0');
    const ctx = makeCtx({
      packageJson: { version: '2.0.0' },
      cargoToml: { package: { name: 'myapp', version: '1.0.0' } },
    });
    const result = await verifier.check(ref, ctx, resolvers);
    expect(result).not.toBeNull();
    expect(result!.message).toContain('package.json');
  });

  it('uses pyproject version when no packageJson or cargoToml', async () => {
    const ref = makeRef('v1.0.0');
    const ctx = makeCtx({
      pyproject: { project: { name: 'myapp', version: '1.0.0' } },
    });
    const result = await verifier.check(ref, ctx, resolvers);
    expect(result).toBeNull();
  });

  it('uses csproj version as last fallback', async () => {
    const ref = makeRef('v3.0.0');
    const ctx = makeCtx({
      csprojs: [{ path: 'MyApp.csproj', version: '4.0.0' }],
    });
    const result = await verifier.check(ref, ctx, resolvers);
    expect(result).not.toBeNull();
    expect(result!.severity).toBe('low');
  });

  it('patch contains the correct replacement version', async () => {
    const ref = makeRef('v1.0.0');
    const ctx = makeCtx({ packageJson: { version: '2.0.0' } });
    const result = await verifier.check(ref, ctx, resolvers);
    expect(result).not.toBeNull();
    expect(result!.patch).toContain('v2.0.0');
  });
});
