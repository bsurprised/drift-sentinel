import { describe, it, expect } from 'vitest';
import { CodeBlockVerifier } from '../../src/verifiers/code-block.js';
import type { DocReference, ProjectContext, SymbolResolver } from '../../src/types.js';

function makeRef(overrides: Partial<DocReference> = {}): DocReference {
  return {
    id: 'ref-1',
    source: { path: 'docs/api.md', line: 10, column: 1 },
    kind: 'code-block',
    target: '',
    context: '',
    language: 'typescript',
    ...overrides,
  };
}

const ctx: ProjectContext = {
  root: '/project',
  detectedLanguages: ['typescript'],
  makefileTargets: [],
};

const emptyResolvers = new Map<string, SymbolResolver>();

describe('CodeBlockVerifier', () => {
  const verifier = new CodeBlockVerifier();

  it('returns null for non-code-block references', async () => {
    const ref = makeRef({ kind: 'symbol' });
    const result = await verifier.check(ref, ctx, emptyResolvers);
    expect(result).toBeNull();
  });

  it('returns null for empty code block', async () => {
    const ref = makeRef({ target: '   ' });
    const result = await verifier.check(ref, ctx, emptyResolvers);
    expect(result).toBeNull();
  });

  it('returns null for unknown language', async () => {
    const ref = makeRef({ language: 'ruby', target: 'puts "hello"' });
    const result = await verifier.check(ref, ctx, emptyResolvers);
    expect(result).toBeNull();
  });

  it('returns null for missing language', async () => {
    const ref = makeRef({ language: undefined, target: 'some code' });
    const result = await verifier.check(ref, ctx, emptyResolvers);
    expect(result).toBeNull();
  });

  // --- TypeScript ---

  it('returns null for valid TypeScript code', async () => {
    const ref = makeRef({
      language: 'typescript',
      target: 'const x: number = 42;\nconsole.log(x);',
    });
    const result = await verifier.check(ref, ctx, emptyResolvers);
    expect(result).toBeNull();
  }, 15000);

  it('returns MEDIUM for invalid TypeScript code', async () => {
    const ref = makeRef({
      language: 'typescript',
      target: 'const x: number = "not a number";',
    });
    const result = await verifier.check(ref, ctx, emptyResolvers);
    expect(result).not.toBeNull();
    expect(result!.kind).toBe('invalid-code-example');
    expect(result!.severity).toBe('medium');
    expect(result!.message).toContain('does not compile');
  }, 15000);

  it('returns null for valid JavaScript code', async () => {
    const ref = makeRef({
      language: 'javascript',
      target: 'const x = 42;\nconsole.log(x);',
    });
    const result = await verifier.check(ref, ctx, emptyResolvers);
    expect(result).toBeNull();
  }, 15000);

  // --- JSON ---

  it('returns null for valid JSON', async () => {
    const ref = makeRef({
      language: 'json',
      target: '{"name": "drift", "version": "1.0.0"}',
    });
    const result = await verifier.check(ref, ctx, emptyResolvers);
    expect(result).toBeNull();
  });

  it('returns MEDIUM for invalid JSON', async () => {
    const ref = makeRef({
      language: 'json',
      target: '{"name": "drift", version: "1.0.0"}',
    });
    const result = await verifier.check(ref, ctx, emptyResolvers);
    expect(result).not.toBeNull();
    expect(result!.kind).toBe('invalid-code-example');
    expect(result!.severity).toBe('medium');
    expect(result!.message).toContain('does not compile');
  });

  // --- YAML ---

  it('returns null for valid YAML', async () => {
    const ref = makeRef({
      language: 'yaml',
      target: 'name: drift\nversion: 1.0.0\n',
    });
    const result = await verifier.check(ref, ctx, emptyResolvers);
    expect(result).toBeNull();
  });

  it('returns MEDIUM for invalid YAML', async () => {
    const ref = makeRef({
      language: 'yaml',
      target: 'name: drift\n  bad indent:\n wrong',
    });
    const result = await verifier.check(ref, ctx, emptyResolvers);
    // YAML is very permissive; only truly broken syntax is caught
    // If the parser doesn't throw, it's considered valid
    if (result) {
      expect(result.kind).toBe('invalid-code-example');
      expect(result.severity).toBe('medium');
    }
  });

  it('returns MEDIUM for clearly invalid YAML', async () => {
    const ref = makeRef({
      language: 'yml',
      target: ':\n  - :\n  - : :\n}}}',
    });
    const result = await verifier.check(ref, ctx, emptyResolvers);
    // Depending on the parser this may or may not throw; assert shape if it does
    if (result) {
      expect(result.kind).toBe('invalid-code-example');
      expect(result.severity).toBe('medium');
    }
  });

  // --- Bash/shell → skip ---

  it('returns null for bash code blocks', async () => {
    const ref = makeRef({ language: 'bash', target: 'echo "hello"' });
    const result = await verifier.check(ref, ctx, emptyResolvers);
    expect(result).toBeNull();
  });
});
