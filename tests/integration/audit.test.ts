import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execSync } from 'node:child_process';
import { runAudit } from '../../src/audit.js';
import { loadConfig, DEFAULT_CONFIG } from '../../src/config.js';
import { createLogger } from '../../src/util/logger.js';
import type { DriftConfig, DriftKind } from '../../src/types.js';

let fixtureDir: string;

async function writeFixture(relPath: string, content: string): Promise<void> {
  const abs = path.join(fixtureDir, relPath);
  await mkdir(path.dirname(abs), { recursive: true });
  await writeFile(abs, content, 'utf-8');
}

beforeAll(async () => {
  createLogger({});
  fixtureDir = await mkdtemp(path.join(os.tmpdir(), 'drift-test-'));

  // Init a git repo so simple-git doesn't fail
  execSync('git init', { cwd: fixtureDir, stdio: 'ignore' });
  execSync('git config user.email "test@test.com"', { cwd: fixtureDir, stdio: 'ignore' });
  execSync('git config user.name "Test"', { cwd: fixtureDir, stdio: 'ignore' });

  // Create fixture files
  await writeFixture('package.json', JSON.stringify({
    name: 'test-repo',
    version: '2.0.0',
    scripts: { build: 'tsc', test: 'vitest' },
    dependencies: {},
    devDependencies: { typescript: '^5.0.0' },
  }, null, 2));

  await writeFixture('tsconfig.json', JSON.stringify({
    compilerOptions: {
      target: 'ES2022',
      module: 'Node16',
      moduleResolution: 'Node16',
      strict: true,
      outDir: 'dist',
    },
    include: ['src/**/*'],
  }, null, 2));

  // README with known drift: npm start doesn't exist, link to nonexistent.md
  await writeFixture('README.md', [
    '# Test Repo',
    '',
    '## Getting Started',
    '',
    'Install and run:',
    '',
    '```bash',
    'npm run start',
    '```',
    '',
    'See the [guide](./nonexistent.md) for more details.',
    '',
    'Current version is `1.0.0`.',
    '',
  ].join('\n'));

  await writeFixture('docs/guide.md', [
    '# Guide',
    '',
    'See the [API docs](./api.md) for details.',
    '',
  ].join('\n'));

  await writeFixture('docs/api.md', [
    '# API Reference',
    '',
    'Use `UserService.createUser()` to create a user.',
    '',
  ].join('\n'));

  await writeFixture('src/user.ts', [
    'export class UserService {',
    '  register() {',
    '    return true;',
    '  }',
    '}',
    '',
  ].join('\n'));

  // Initial commit
  execSync('git add -A', { cwd: fixtureDir, stdio: 'ignore' });
  execSync('git commit -m "initial"', { cwd: fixtureDir, stdio: 'ignore' });
});

afterAll(async () => {
  if (fixtureDir) {
    await rm(fixtureDir, { recursive: true, force: true });
  }
});

describe('runAudit integration', () => {
  it('finds expected drift types in fixture repo', async () => {
    const config: DriftConfig = {
      ...DEFAULT_CONFIG,
      offline: true,  // skip external link checks in tests
      rules: {
        'dead-external-link': 'off',
      },
    };

    const report = await runAudit(fixtureDir, config);

    expect(report.scannedDocs).toBeGreaterThanOrEqual(3);
    expect(report.scannedReferences).toBeGreaterThan(0);
    expect(report.durationMs).toBeGreaterThan(0);
    expect(report.generatedAt).toBeTruthy();

    const kinds = new Set(report.issues.map(i => i.kind));

    // npm run start doesn't exist in scripts
    expect(kinds.has('unknown-cli-command')).toBe(true);

    // ./nonexistent.md is a dead file ref
    expect(kinds.has('dead-file-ref')).toBe(true);
  });

  it('returns report even when no drift found', async () => {
    const config: DriftConfig = {
      ...DEFAULT_CONFIG,
      offline: true,
      rules: {
        'dead-external-link': 'off',
        'dead-file-ref': 'off',
        'missing-symbol': 'off',
        'invalid-code-example': 'off',
        'unknown-cli-command': 'off',
        'version-mismatch': 'off',
        'deprecated-api-mention': 'off',
        'orphan-doc': 'off',
      },
    };

    const report = await runAudit(fixtureDir, config);
    expect(report.issues).toHaveLength(0);
    expect(report.scannedDocs).toBeGreaterThan(0);
  });

  it('inline suppression skips a specific check', async () => {
    // Add a suppressed link to the README
    await writeFixture('README.md', [
      '# Test Repo',
      '',
      '## Getting Started',
      '',
      '<!-- drift-ignore: dead-file-ref -->',
      'See the [guide](./nonexistent.md) for more details.',
      '',
    ].join('\n'));

    const config: DriftConfig = {
      ...DEFAULT_CONFIG,
      offline: true,
      rules: {
        'dead-external-link': 'off',
        'unknown-cli-command': 'off',
        'version-mismatch': 'off',
        'missing-symbol': 'off',
        'deprecated-api-mention': 'off',
        'invalid-code-example': 'off',
        'orphan-doc': 'off',
      },
    };

    const report = await runAudit(fixtureDir, config);

    // The ./nonexistent.md link should be suppressed, but may still find other dead file refs
    const readmeDeadRefs = report.issues.filter(
      i => i.kind === 'dead-file-ref' && i.reference.source.path.includes('README.md'),
    );
    expect(readmeDeadRefs).toHaveLength(0);

    // Restore original README
    await writeFixture('README.md', [
      '# Test Repo',
      '',
      '## Getting Started',
      '',
      'Install and run:',
      '',
      '```bash',
      'npm run start',
      '```',
      '',
      'See the [guide](./nonexistent.md) for more details.',
      '',
      'Current version is `1.0.0`.',
      '',
    ].join('\n'));
  });

  it('config override disables a rule', async () => {
    const config: DriftConfig = {
      ...DEFAULT_CONFIG,
      offline: true,
      rules: {
        'dead-external-link': 'off',
        'dead-file-ref': 'off',
        'unknown-cli-command': 'off',
      },
    };

    const report = await runAudit(fixtureDir, config);
    const kinds = new Set(report.issues.map(i => i.kind));

    expect(kinds.has('dead-file-ref')).toBe(false);
    expect(kinds.has('unknown-cli-command')).toBe(false);
  });
});
