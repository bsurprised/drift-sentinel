import { describe, it, expect } from 'vitest';
import { CliCommandVerifier } from '../../src/verifiers/cli-command.js';
import type { DocReference, ProjectContext } from '../../src/types.js';

function makeRef(target: string, kind: DocReference['kind'] = 'cli-command'): DocReference {
  return {
    id: 'test-ref',
    source: { path: 'README.md', line: 10, column: 1 },
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

describe('CliCommandVerifier', () => {
  const verifier = new CliCommandVerifier();

  it('has correct kind', () => {
    expect(verifier.kind).toBe('unknown-cli-command');
  });

  it('returns null for non-cli-command refs', async () => {
    const ref = makeRef('something', 'symbol');
    const result = await verifier.check(ref, makeCtx(), resolvers);
    expect(result).toBeNull();
  });

  // npm scripts
  describe('npm scripts', () => {
    it('npm run build with scripts.build present → null', async () => {
      const ref = makeRef('npm run build');
      const ctx = makeCtx({ packageJson: { scripts: { build: 'tsc' } } });
      const result = await verifier.check(ref, ctx, resolvers);
      expect(result).toBeNull();
    });

    it('npm start with scripts.start missing but scripts.dev present → HIGH with suggestion', async () => {
      const ref = makeRef('npm start');
      const ctx = makeCtx({ packageJson: { scripts: { dev: 'vite', build: 'tsc' } } });
      const result = await verifier.check(ref, ctx, resolvers);
      expect(result).not.toBeNull();
      expect(result!.severity).toBe('high');
      expect(result!.kind).toBe('unknown-cli-command');
    });

    it('npm test with scripts.test present → null', async () => {
      const ref = makeRef('npm test');
      const ctx = makeCtx({ packageJson: { scripts: { test: 'vitest' } } });
      const result = await verifier.check(ref, ctx, resolvers);
      expect(result).toBeNull();
    });

    it('npm run nonexistent with no close match → HIGH, no suggestion', async () => {
      const ref = makeRef('npm run nonexistent');
      const ctx = makeCtx({ packageJson: { scripts: { build: 'tsc', test: 'vitest' } } });
      const result = await verifier.check(ref, ctx, resolvers);
      expect(result).not.toBeNull();
      expect(result!.severity).toBe('high');
      expect(result!.suggestion).toBeUndefined();
      expect(result!.autoFixable).toBe(false);
    });

    it('npm install is always valid (lifecycle)', async () => {
      const ref = makeRef('npm install');
      const ctx = makeCtx({ packageJson: { scripts: {} } });
      const result = await verifier.check(ref, ctx, resolvers);
      expect(result).toBeNull();
    });

    it('npm run with close match → suggestion and autoFixable', async () => {
      const ref = makeRef('npm run buld');
      const ctx = makeCtx({ packageJson: { scripts: { build: 'tsc', test: 'vitest' } } });
      const result = await verifier.check(ref, ctx, resolvers);
      expect(result).not.toBeNull();
      expect(result!.suggestion).toContain('build');
      expect(result!.autoFixable).toBe(true);
      expect(result!.patch).toBeDefined();
    });

    it('returns null when no packageJson', async () => {
      const ref = makeRef('npm run build');
      const ctx = makeCtx();
      const result = await verifier.check(ref, ctx, resolvers);
      expect(result).toBeNull();
    });
  });

  // yarn
  describe('yarn', () => {
    it('yarn build checked against package.json scripts → null', async () => {
      const ref = makeRef('yarn build');
      const ctx = makeCtx({ packageJson: { scripts: { build: 'tsc' } } });
      const result = await verifier.check(ref, ctx, resolvers);
      expect(result).toBeNull();
    });

    it('yarn run build → null if script exists', async () => {
      const ref = makeRef('yarn run build');
      const ctx = makeCtx({ packageJson: { scripts: { build: 'tsc' } } });
      const result = await verifier.check(ref, ctx, resolvers);
      expect(result).toBeNull();
    });

    it('yarn missing-script → HIGH', async () => {
      const ref = makeRef('yarn missing-script');
      const ctx = makeCtx({ packageJson: { scripts: { build: 'tsc' } } });
      const result = await verifier.check(ref, ctx, resolvers);
      expect(result).not.toBeNull();
      expect(result!.severity).toBe('high');
    });
  });

  // pnpm
  describe('pnpm', () => {
    it('pnpm run build → null if script exists', async () => {
      const ref = makeRef('pnpm run build');
      const ctx = makeCtx({ packageJson: { scripts: { build: 'tsc' } } });
      const result = await verifier.check(ref, ctx, resolvers);
      expect(result).toBeNull();
    });

    it('pnpm build → null if script exists', async () => {
      const ref = makeRef('pnpm build');
      const ctx = makeCtx({ packageJson: { scripts: { build: 'tsc' } } });
      const result = await verifier.check(ref, ctx, resolvers);
      expect(result).toBeNull();
    });
  });

  // make
  describe('make', () => {
    it('make build with matching target → null', async () => {
      const ref = makeRef('make build');
      const ctx = makeCtx({ makefileTargets: ['build', 'test', 'clean'] });
      const result = await verifier.check(ref, ctx, resolvers);
      expect(result).toBeNull();
    });

    it('make deploy with no deploy target → HIGH', async () => {
      const ref = makeRef('make deploy');
      const ctx = makeCtx({ makefileTargets: ['build', 'test', 'clean'] });
      const result = await verifier.check(ref, ctx, resolvers);
      expect(result).not.toBeNull();
      expect(result!.severity).toBe('high');
      expect(result!.kind).toBe('unknown-cli-command');
    });

    it('make with close match → suggestion', async () => {
      const ref = makeRef('make buld');
      const ctx = makeCtx({ makefileTargets: ['build', 'test', 'clean'] });
      const result = await verifier.check(ref, ctx, resolvers);
      expect(result).not.toBeNull();
      expect(result!.suggestion).toContain('build');
      expect(result!.autoFixable).toBe(true);
    });
  });

  // cargo
  describe('cargo', () => {
    it('cargo build → null (built-in)', async () => {
      const ref = makeRef('cargo build');
      const ctx = makeCtx();
      const result = await verifier.check(ref, ctx, resolvers);
      expect(result).toBeNull();
    });

    it('cargo test → null (built-in)', async () => {
      const ref = makeRef('cargo test');
      const ctx = makeCtx();
      const result = await verifier.check(ref, ctx, resolvers);
      expect(result).toBeNull();
    });

    it('cargo my-custom-bin with matching bin entry → null', async () => {
      const ref = makeRef('cargo my-custom-bin');
      const ctx = makeCtx({
        cargoToml: {
          package: { name: 'myapp', version: '0.1.0' },
          bin: [{ name: 'my-custom-bin', path: 'src/main.rs' }],
        },
      });
      const result = await verifier.check(ref, ctx, resolvers);
      expect(result).toBeNull();
    });

    it('cargo unknown-cmd → MEDIUM severity', async () => {
      const ref = makeRef('cargo unknown-cmd');
      const ctx = makeCtx();
      const result = await verifier.check(ref, ctx, resolvers);
      expect(result).not.toBeNull();
      expect(result!.severity).toBe('medium');
      expect(result!.autoFixable).toBe(false);
    });
  });

  // skip cases
  describe('skip cases', () => {
    it('npx some-tool → null (skip)', async () => {
      const ref = makeRef('npx some-tool');
      const result = await verifier.check(ref, makeCtx(), resolvers);
      expect(result).toBeNull();
    });

    it('non-package-manager commands → null (skip)', async () => {
      const ref = makeRef('echo hello');
      const result = await verifier.check(ref, makeCtx(), resolvers);
      expect(result).toBeNull();
    });

    it('python script → null (skip)', async () => {
      const ref = makeRef('python main.py');
      const result = await verifier.check(ref, makeCtx(), resolvers);
      expect(result).toBeNull();
    });
  });

  // edge: command with leading $
  it('strips leading $ from command', async () => {
    const ref = makeRef('$ npm run build');
    const ctx = makeCtx({ packageJson: { scripts: { build: 'tsc' } } });
    const result = await verifier.check(ref, ctx, resolvers);
    expect(result).toBeNull();
  });
});
