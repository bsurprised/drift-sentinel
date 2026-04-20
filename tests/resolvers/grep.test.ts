import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, writeFile, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { GrepResolver } from '../../src/resolvers/grep.js';
import type { DocReference, ProjectContext } from '../../src/types.js';

let tempDir: string;

const dummyRef: DocReference = {
  id: 'test-ref',
  source: { path: 'README.md', line: 1, column: 1 },
  kind: 'symbol',
  target: '',
  context: '',
};

function makeProject(): ProjectContext {
  return {
    root: tempDir,
    detectedLanguages: ['typescript'],
    makefileTargets: [],
  };
}

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'drift-grep-'));
  await mkdir(join(tempDir, 'src'), { recursive: true });
  await mkdir(join(tempDir, 'node_modules', 'some-pkg'), { recursive: true });

  await writeFile(
    join(tempDir, 'src', 'app.ts'),
    `export function createUser(name: string): void {
  console.log(name);
}

export class UserService {
  register() {}
}
`,
  );

  await writeFile(
    join(tempDir, 'src', 'utils.ts'),
    `export function helperFunction(): void {}
`,
  );

  // File inside node_modules (should be excluded)
  await writeFile(
    join(tempDir, 'node_modules', 'some-pkg', 'index.js'),
    `function createUser() {}
`,
  );
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe('GrepResolver', () => {
  it('canHandle always returns true', () => {
    const resolver = new GrepResolver();
    expect(resolver.canHandle(makeProject())).toBe(true);
  });

  it('finds a function in source files', async () => {
    const resolver = new GrepResolver();
    resolver.canHandle(makeProject());
    const result = await resolver.resolve('createUser', dummyRef);
    expect(result.found).toBe(true);
    expect(result.locations.length).toBeGreaterThanOrEqual(1);
  });

  it('returns found: false for non-existent symbol', async () => {
    const resolver = new GrepResolver();
    resolver.canHandle(makeProject());
    const result = await resolver.resolve('totallyMissing', dummyRef);
    expect(result.found).toBe(false);
  });

  it('excludes node_modules from search', async () => {
    const resolver = new GrepResolver();
    resolver.canHandle(makeProject());
    const result = await resolver.resolve('createUser', dummyRef);
    const inNodeModules = result.locations.some((loc) =>
      loc.file.includes('node_modules'),
    );
    expect(inNodeModules).toBe(false);
  });

  it('returns locations with file and line number', async () => {
    const resolver = new GrepResolver();
    resolver.canHandle(makeProject());
    const result = await resolver.resolve('helperFunction', dummyRef);
    expect(result.found).toBe(true);
    expect(result.locations[0].file).toContain('utils.ts');
    expect(result.locations[0].line).toBe(1);
  });

  it('handles symbol with trailing parens', async () => {
    const resolver = new GrepResolver();
    resolver.canHandle(makeProject());
    const result = await resolver.resolve('createUser()', dummyRef);
    expect(result.found).toBe(true);
  });

  it('handles member syntax by searching the last part', async () => {
    const resolver = new GrepResolver();
    resolver.canHandle(makeProject());
    const result = await resolver.resolve('UserService.register', dummyRef);
    expect(result.found).toBe(true);
  });

  it('deprecated is always false for grep results', async () => {
    const resolver = new GrepResolver();
    resolver.canHandle(makeProject());
    const result = await resolver.resolve('createUser', dummyRef);
    expect(result.deprecated).toBe(false);
  });
});
