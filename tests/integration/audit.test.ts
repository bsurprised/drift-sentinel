import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm, access } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execSync } from 'node:child_process';
import { runAudit } from '../../src/audit.js';
import { DEFAULT_CONFIG, loadConfig } from '../../src/config.js';
import { createLogger } from '../../src/util/logger.js';
import { emitReport } from '../../src/report/index.js';
import type { DriftConfig, DriftReport } from '../../src/types.js';

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

describe('emitReport — output routing and writeReport gating (LLD-E)', () => {  let testDir: string;
  let baseReport: DriftReport;

  beforeEach(async () => {
    testDir = await mkdtemp(path.join(os.tmpdir(), 'emit-test-'));
    baseReport = {
      root: testDir,
      scannedDocs: 1,
      scannedReferences: 1,
      issues: [],
      durationMs: 10,
      generatedAt: new Date().toISOString(),
    };
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it('writes DRIFT_REPORT.md by default (terminal mode)', async () => {
    const spy = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    try {
      await emitReport(baseReport, { format: 'terminal', config: DEFAULT_CONFIG });
      await expect(access(path.join(testDir, 'DRIFT_REPORT.md'))).resolves.not.toThrow();
    } finally {
      spy.mockRestore();
    }
  });

  it('--no-report (writeReport: false) does not create DRIFT_REPORT.md', async () => {
    const spy = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    try {
      const config: DriftConfig = { ...DEFAULT_CONFIG, writeReport: false };
      await emitReport(baseReport, { format: 'terminal', config });
      await expect(access(path.join(testDir, 'DRIFT_REPORT.md'))).rejects.toThrow();
    } finally {
      spy.mockRestore();
    }
  });

  it('--report-path writes markdown to the specified custom path', async () => {
    const spy = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    const customPath = path.join(testDir, 'custom-report.md');
    try {
      const config: DriftConfig = { ...DEFAULT_CONFIG, reportPath: customPath };
      await emitReport(baseReport, { format: 'terminal', config });
      await expect(access(customPath)).resolves.not.toThrow();
      // Default path should NOT be created when reportPath is set
      await expect(access(path.join(testDir, 'DRIFT_REPORT.md'))).rejects.toThrow();
    } finally {
      spy.mockRestore();
    }
  });

  it('--json: stdout is pure JSON (starts with {), stderr contains summary', async () => {
    const stdoutChunks: string[] = [];
    const stderrChunks: string[] = [];
    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
      stdoutChunks.push(String(chunk));
      return true;
    });
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation((chunk: unknown) => {
      stderrChunks.push(String(chunk));
      return true;
    });
    try {
      const config: DriftConfig = { ...DEFAULT_CONFIG, writeReport: false };
      await emitReport(baseReport, { format: 'json', config });
    } finally {
      stdoutSpy.mockRestore();
      stderrSpy.mockRestore();
    }
    const out = stdoutChunks.join('');
    expect(out.trimStart()).toMatch(/^\{/);
    expect(() => JSON.parse(out)).not.toThrow();
    expect(stderrChunks.join('')).toContain('drift-sentinel:');
  });

  it('--json: JSON output has both path (relative) and absPath fields on issue sources', async () => {
    const issueReport: DriftReport = {
      ...baseReport,
      issues: [
        {
          reference: {
            id: 'ref-1',
            source: { path: path.join(testDir, 'README.md'), line: 1, column: 1 },
            kind: 'link-file',
            target: 'nonexistent.md',
            context: 'ctx',
          },
          kind: 'dead-file-ref',
          severity: 'high',
          message: 'File not found',
          autoFixable: false,
        },
      ],
    };
    const stdoutChunks: string[] = [];
    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
      stdoutChunks.push(String(chunk));
      return true;
    });
    vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    try {
      const config: DriftConfig = { ...DEFAULT_CONFIG, writeReport: false };
      await emitReport(issueReport, { format: 'json', config });
    } finally {
      stdoutSpy.mockRestore();
      vi.restoreAllMocks();
    }
    const parsed = JSON.parse(stdoutChunks.join(''));
    expect(parsed.issues[0].reference.source.path).toBe('README.md');
    expect(parsed.issues[0].reference.source.absPath).toBe(path.join(testDir, 'README.md'));
  });

  it('--sarif: stdout is valid SARIF JSON (version 2.1.0), stderr contains summary', async () => {
    const stdoutChunks: string[] = [];
    const stderrChunks: string[] = [];
    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
      stdoutChunks.push(String(chunk));
      return true;
    });
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation((chunk: unknown) => {
      stderrChunks.push(String(chunk));
      return true;
    });
    try {
      const config: DriftConfig = { ...DEFAULT_CONFIG, writeReport: false };
      await emitReport(baseReport, { format: 'sarif', config });
    } finally {
      stdoutSpy.mockRestore();
      stderrSpy.mockRestore();
    }
    const out = stdoutChunks.join('');
    const parsed = JSON.parse(out);
    expect(parsed.version).toBe('2.1.0');
    expect(parsed.runs[0].originalUriBaseIds.PROJECTROOT.uri).toMatch(/^file:\/\//);
    expect(stderrChunks.join('')).toContain('drift-sentinel:');
  });
});

describe('runAudit — kinds filter (LLD-B / B-02)', () => {
  it('with kinds: [dead-file-ref] only reports dead-file-ref issues', async () => {
    const config: DriftConfig = {
      ...DEFAULT_CONFIG,
      offline: true,
      kinds: ['dead-file-ref'],
    };
    const report = await runAudit(fixtureDir, config);
    // Must find the known dead-file-ref in fixture README
    const kinds = new Set(report.issues.map(i => i.kind));
    expect(kinds.has('dead-file-ref')).toBe(true);
    // Other verifiers must NOT have run
    expect(kinds.has('missing-symbol')).toBe(false);
    expect(kinds.has('unknown-cli-command')).toBe(false);
    expect(kinds.has('version-mismatch')).toBe(false);
  });

  it('with kinds: [] (empty) reports no issues from any verifier', async () => {
    const config: DriftConfig = {
      ...DEFAULT_CONFIG,
      offline: true,
      kinds: [],
    };
    const report = await runAudit(fixtureDir, config);
    expect(report.issues).toHaveLength(0);
  });
});

describe('loadConfig — ignorePaths CLI override (LLD-B / B-17)', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), 'cfg-b17-'));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('ignorePaths from config file is preserved when CLI omits --ignore', async () => {
    await writeFile(
      path.join(tmpDir, 'drift.config.mjs'),
      'export default { ignorePaths: ["keep-me"] };\n',
    );
    const config = await loadConfig({}, tmpDir);
    expect(config.ignorePaths).toEqual(['keep-me']);
  });

  it('CLI ignorePaths override replaces config file ignorePaths', async () => {
    await writeFile(
      path.join(tmpDir, 'drift.config.mjs'),
      'export default { ignorePaths: ["old-path"] };\n',
    );
    const config = await loadConfig({ ignorePaths: ['new-path'] }, tmpDir);
    expect(config.ignorePaths).toEqual(['new-path']);
  });

  it('passing ignorePaths: undefined does NOT erase config file value (B-17 root cause)', async () => {
    await writeFile(
      path.join(tmpDir, 'drift.config.mjs'),
      'export default { ignorePaths: ["preserved"] };\n',
    );
    // Simulate what the FIXED CLI does: only adds ignorePaths when flag is present
    const config = await loadConfig({ ignorePaths: undefined }, tmpDir);
    expect(config.ignorePaths).toEqual(['preserved']);
  });
});
