import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, writeFile, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { detectProjectContext } from '../../src/context/index.js';

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'drift-ctx-'));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe('detectProjectContext', () => {
  it('detects a Node.js project with package.json', async () => {
    await writeFile(
      join(tempDir, 'package.json'),
      JSON.stringify({
        name: 'my-app',
        version: '1.0.0',
        scripts: { build: 'tsc', test: 'vitest' },
      }),
    );

    const ctx = await detectProjectContext(tempDir);
    expect(ctx.packageJson).toBeDefined();
    expect(ctx.packageJson!.name).toBe('my-app');
    expect(ctx.packageJson!.scripts).toEqual({ build: 'tsc', test: 'vitest' });
    expect(ctx.detectedLanguages).toContain('javascript');
  });

  it('detects TypeScript via devDependencies', async () => {
    await writeFile(
      join(tempDir, 'package.json'),
      JSON.stringify({
        name: 'ts-app',
        devDependencies: { typescript: '^5.0.0' },
      }),
    );

    const ctx = await detectProjectContext(tempDir);
    expect(ctx.detectedLanguages).toContain('javascript');
    expect(ctx.detectedLanguages).toContain('typescript');
  });

  it('detects TypeScript via tsconfig.json', async () => {
    await writeFile(
      join(tempDir, 'tsconfig.json'),
      JSON.stringify({ compilerOptions: { strict: true } }),
    );

    const ctx = await detectProjectContext(tempDir);
    expect(ctx.tsconfig).toBeDefined();
    expect(ctx.tsconfig!.compilerOptions).toEqual({ strict: true });
    expect(ctx.detectedLanguages).toContain('typescript');
  });

  it('handles JSONC tsconfig with comments', async () => {
    const jsonc = `{
      // Compiler settings
      "compilerOptions": {
        "target": "ES2022", /* target version */
        "strict": true
      },
      "include": ["src/**/*"]
    }`;
    await writeFile(join(tempDir, 'tsconfig.json'), jsonc);

    const ctx = await detectProjectContext(tempDir);
    expect(ctx.tsconfig).toBeDefined();
    expect(ctx.tsconfig!.compilerOptions).toEqual({
      target: 'ES2022',
      strict: true,
    });
    expect(ctx.tsconfig!.include).toEqual(['src/**/*']);
  });

  it('detects a Rust project with Cargo.toml', async () => {
    const cargo = `[package]
name = "my-crate"
version = "0.2.0"
edition = "2021"

[[bin]]
name = "my-cli"
path = "src/main.rs"

[dependencies]
serde = "1.0"
`;
    await writeFile(join(tempDir, 'Cargo.toml'), cargo);

    const ctx = await detectProjectContext(tempDir);
    expect(ctx.cargoToml).toBeDefined();
    expect(ctx.cargoToml!.package?.name).toBe('my-crate');
    expect(ctx.cargoToml!.package?.version).toBe('0.2.0');
    expect(ctx.cargoToml!.bin).toEqual([
      { name: 'my-cli', path: 'src/main.rs' },
    ]);
    expect(ctx.detectedLanguages).toContain('rust');
  });

  it('detects a Python project with pyproject.toml', async () => {
    const pyproject = `[project]
name = "my-python-app"
version = "3.1.0"

[tool.ruff]
line-length = 100
`;
    await writeFile(join(tempDir, 'pyproject.toml'), pyproject);

    const ctx = await detectProjectContext(tempDir);
    expect(ctx.pyproject).toBeDefined();
    expect(ctx.pyproject!.project?.name).toBe('my-python-app');
    expect(ctx.pyproject!.project?.version).toBe('3.1.0');
    expect(ctx.detectedLanguages).toContain('python');
  });

  it('detects a .NET project with .csproj', async () => {
    const srcDir = join(tempDir, 'src');
    await mkdir(srcDir, { recursive: true });
    const csproj = `<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <TargetFramework>net8.0</TargetFramework>
    <Version>2.0.0</Version>
  </PropertyGroup>
</Project>`;
    await writeFile(join(srcDir, 'MyApp.csproj'), csproj);

    const ctx = await detectProjectContext(tempDir);
    expect(ctx.csprojs).toBeDefined();
    expect(ctx.csprojs!.length).toBe(1);
    expect(ctx.csprojs![0].path).toMatch(/MyApp\.csproj$/);
    expect(ctx.csprojs![0].version).toBe('2.0.0');
    expect(ctx.detectedLanguages).toContain('dotnet');
  });

  it('detects a Go project with go.mod', async () => {
    await writeFile(
      join(tempDir, 'go.mod'),
      'module github.com/user/repo\n\ngo 1.21\n',
    );

    const ctx = await detectProjectContext(tempDir);
    expect(ctx.detectedLanguages).toContain('go');
  });

  it('extracts Makefile targets', async () => {
    const makefile = `build:\n\tgo build ./...\ntest:\n\tgo test ./...\nclean:\n\trm -rf bin`;
    await writeFile(join(tempDir, 'Makefile'), makefile);

    const ctx = await detectProjectContext(tempDir);
    expect(ctx.makefileTargets).toEqual(['build', 'test', 'clean']);
  });

  it('detects multi-language project', async () => {
    await writeFile(
      join(tempDir, 'package.json'),
      JSON.stringify({ name: 'multi', version: '1.0.0' }),
    );
    await writeFile(
      join(tempDir, 'Cargo.toml'),
      '[package]\nname = "multi"\nversion = "0.1.0"\n',
    );

    const ctx = await detectProjectContext(tempDir);
    expect(ctx.detectedLanguages).toContain('javascript');
    expect(ctx.detectedLanguages).toContain('rust');
    expect(ctx.packageJson).toBeDefined();
    expect(ctx.cargoToml).toBeDefined();
  });

  it('returns empty context for empty project', async () => {
    const ctx = await detectProjectContext(tempDir);
    expect(ctx.root).toBe(tempDir);
    expect(ctx.detectedLanguages).toEqual([]);
    expect(ctx.makefileTargets).toEqual([]);
    expect(ctx.packageJson).toBeUndefined();
    expect(ctx.tsconfig).toBeUndefined();
    expect(ctx.cargoToml).toBeUndefined();
    expect(ctx.pyproject).toBeUndefined();
    expect(ctx.csprojs).toBeUndefined();
  });

  it('deduplicates detectedLanguages', async () => {
    await writeFile(
      join(tempDir, 'package.json'),
      JSON.stringify({
        name: 'ts-project',
        devDependencies: { typescript: '^5.0.0' },
      }),
    );
    await writeFile(
      join(tempDir, 'tsconfig.json'),
      JSON.stringify({ compilerOptions: {} }),
    );

    const ctx = await detectProjectContext(tempDir);
    const tsCount = ctx.detectedLanguages.filter((l) => l === 'typescript').length;
    expect(tsCount).toBe(1);
  });
});
