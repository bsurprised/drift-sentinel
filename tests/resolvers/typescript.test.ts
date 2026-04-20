import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, writeFile, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { TypeScriptResolver } from '../../src/resolvers/typescript.js';
import type { DocReference, ProjectContext } from '../../src/types.js';

let tempDir: string;

const dummyRef: DocReference = {
  id: 'test-ref',
  source: { path: 'README.md', line: 1, column: 1 },
  kind: 'symbol',
  target: '',
  context: '',
};

function tsProject(): ProjectContext {
  return {
    root: tempDir,
    detectedLanguages: ['typescript'],
    makefileTargets: [],
  };
}

function pythonProject(): ProjectContext {
  return {
    root: tempDir,
    detectedLanguages: ['python'],
    makefileTargets: [],
  };
}

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'drift-ts-'));
  await mkdir(join(tempDir, 'src'), { recursive: true });

  // tsconfig.json
  await writeFile(
    join(tempDir, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: {
        target: 'ES2022',
        module: 'Node16',
        moduleResolution: 'Node16',
        strict: true,
        outDir: 'dist',
        rootDir: 'src',
      },
      include: ['src/**/*'],
    }),
  );

  // src/user.ts
  await writeFile(
    join(tempDir, 'src', 'user.ts'),
    `export class UserService {
  register(name: string): void {}
  login(email: string): boolean { return true; }
}

export function createUser(name: string): void {}

export interface UserConfig {
  timeout: number;
}
`,
  );

  // src/deprecated.ts
  await writeFile(
    join(tempDir, 'src', 'deprecated.ts'),
    `/** @deprecated Use newMethod instead */
export function oldMethod(): void {}

export class LegacyService {
  /** @deprecated No longer supported */
  legacyCall(): void {}
}
`,
  );

  // src/index.ts
  await writeFile(
    join(tempDir, 'src', 'index.ts'),
    `export { UserService, createUser } from './user.js';
export { oldMethod } from './deprecated.js';
`,
  );
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe('TypeScriptResolver', () => {
  it('canHandle returns true for TS projects', () => {
    const resolver = new TypeScriptResolver(join(tempDir, 'tsconfig.json'));
    expect(resolver.canHandle(tsProject())).toBe(true);
  });

  it('canHandle returns false for non-TS projects', () => {
    const resolver = new TypeScriptResolver(join(tempDir, 'tsconfig.json'));
    expect(resolver.canHandle(pythonProject())).toBe(false);
  });

  it('resolves an existing class name', async () => {
    const resolver = new TypeScriptResolver(join(tempDir, 'tsconfig.json'));
    const result = await resolver.resolve('UserService', dummyRef);
    expect(result.found).toBe(true);
    expect(result.locations.length).toBeGreaterThanOrEqual(1);
    expect(result.locations[0].file).toContain('user.ts');
  });

  it('resolves an existing function name', async () => {
    const resolver = new TypeScriptResolver(join(tempDir, 'tsconfig.json'));
    const result = await resolver.resolve('createUser', dummyRef);
    expect(result.found).toBe(true);
    expect(result.locations[0].file).toContain('user.ts');
  });

  it('resolves a class method via ClassName.method', async () => {
    const resolver = new TypeScriptResolver(join(tempDir, 'tsconfig.json'));
    const result = await resolver.resolve('UserService.register', dummyRef);
    expect(result.found).toBe(true);
    expect(result.locations[0].file).toContain('user.ts');
  });

  it('handles trailing parens: ClassName.method()', async () => {
    const resolver = new TypeScriptResolver(join(tempDir, 'tsconfig.json'));
    const result = await resolver.resolve('UserService.register()', dummyRef);
    expect(result.found).toBe(true);
  });

  it('returns found: false for non-existent symbol', async () => {
    const resolver = new TypeScriptResolver(join(tempDir, 'tsconfig.json'));
    const result = await resolver.resolve('NonExistentThing', dummyRef);
    expect(result.found).toBe(false);
    expect(result.locations).toEqual([]);
  });

  it('detects @deprecated tag', async () => {
    const resolver = new TypeScriptResolver(join(tempDir, 'tsconfig.json'));
    const result = await resolver.resolve('oldMethod', dummyRef);
    expect(result.found).toBe(true);
    expect(result.deprecated).toBe(true);
  });

  it('detects @deprecated on class members', async () => {
    const resolver = new TypeScriptResolver(join(tempDir, 'tsconfig.json'));
    const result = await resolver.resolve('LegacyService.legacyCall', dummyRef);
    expect(result.found).toBe(true);
    expect(result.deprecated).toBe(true);
  });

  it('returns correct line numbers', async () => {
    const resolver = new TypeScriptResolver(join(tempDir, 'tsconfig.json'));
    const result = await resolver.resolve('UserService', dummyRef);
    expect(result.found).toBe(true);
    expect(result.locations[0].line).toBe(1);
    expect(result.locations[0].column).toBeGreaterThanOrEqual(1);
  });

  it('caches results on repeated lookups', async () => {
    const resolver = new TypeScriptResolver(join(tempDir, 'tsconfig.json'));
    const result1 = await resolver.resolve('UserService', dummyRef);
    const result2 = await resolver.resolve('UserService', dummyRef);
    expect(result1).toBe(result2); // Same object reference means cached
  });

  it('resolves an interface name', async () => {
    const resolver = new TypeScriptResolver(join(tempDir, 'tsconfig.json'));
    const result = await resolver.resolve('UserConfig', dummyRef);
    expect(result.found).toBe(true);
    expect(result.locations[0].file).toContain('user.ts');
  });

  it('dispose clears program and cache', async () => {
    const resolver = new TypeScriptResolver(join(tempDir, 'tsconfig.json'));
    await resolver.resolve('UserService', dummyRef);
    resolver.dispose();
    // After dispose, re-resolving still works (program is re-created)
    const result = await resolver.resolve('UserService', dummyRef);
    expect(result.found).toBe(true);
  });
});
