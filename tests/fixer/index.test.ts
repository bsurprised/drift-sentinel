import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  generatePatches,
  applyFixes,
  writePatchFile,
} from '../../src/fixer/index.js';
import type { DriftReport, DriftIssue } from '../../src/types.js';

function makeIssue(overrides: Partial<DriftIssue> & { reference: DriftIssue['reference'] }): DriftIssue {
  return {
    kind: 'unknown-cli-command',
    severity: 'medium',
    message: 'test issue',
    autoFixable: true,
    ...overrides,
  };
}

function makeReport(issues: DriftIssue[], root = '.'): DriftReport {
  return {
    root,
    scannedDocs: 1,
    scannedReferences: 1,
    issues,
    durationMs: 100,
    generatedAt: new Date().toISOString(),
  };
}

let tmpDir: string;

beforeEach(async () => {
  tmpDir = path.join(os.tmpdir(), `drift-fixer-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  await fs.mkdir(tmpDir, { recursive: true });
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('generatePatches', () => {
  it('returns patches for auto-fixable issues with patch field', () => {
    const report = makeReport([
      makeIssue({
        reference: {
          id: 'r1',
          source: { path: 'docs/readme.md', line: 5, column: 1 },
          kind: 'cli-command',
          target: 'npm start',
          context: 'Run npm start',
        },
        autoFixable: true,
        patch: '-npm start\n+npm run dev',
      }),
    ]);
    const patches = generatePatches(report);
    expect(patches).toHaveLength(1);
    expect(patches[0].original).toBe('npm start');
    expect(patches[0].replacement).toBe('npm run dev');
  });

  it('returns empty array when no issues are auto-fixable', () => {
    const report = makeReport([
      makeIssue({
        reference: {
          id: 'r1',
          source: { path: 'docs/readme.md', line: 5, column: 1 },
          kind: 'cli-command',
          target: 'npm start',
          context: 'Run npm start',
        },
        autoFixable: false,
        patch: '-npm start\n+npm run dev',
      }),
    ]);
    const patches = generatePatches(report);
    expect(patches).toHaveLength(0);
  });

  it('skips issues without patch field', () => {
    const report = makeReport([
      makeIssue({
        reference: {
          id: 'r1',
          source: { path: 'docs/readme.md', line: 5, column: 1 },
          kind: 'cli-command',
          target: 'npm start',
          context: 'Run npm start',
        },
        autoFixable: true,
        patch: undefined,
      }),
    ]);
    const patches = generatePatches(report);
    expect(patches).toHaveLength(0);
  });
});

describe('applyFixes', () => {
  it('dry run generates patches but does not apply them', async () => {
    const filePath = path.join(tmpDir, 'readme.md');
    await fs.writeFile(filePath, 'Run `npm start` to begin\n', 'utf-8');

    const report = makeReport([
      makeIssue({
        reference: {
          id: 'r1',
          source: { path: filePath, line: 1, column: 1 },
          kind: 'cli-command',
          target: 'npm start',
          context: 'Run npm start',
        },
        patch: '-npm start\n+npm run dev',
      }),
    ]);

    const result = await applyFixes(report, { dryRun: true });
    expect(result.applied).toBe(0);
    expect(result.skipped).toBe(1);
    expect(result.patches).toHaveLength(1);
    expect(result.patches[0].applied).toBe(false);

    // File should remain unchanged
    const content = await fs.readFile(filePath, 'utf-8');
    expect(content).toBe('Run `npm start` to begin\n');
  });

  it('applies a CLI command fix', async () => {
    const filePath = path.join(tmpDir, 'readme.md');
    await fs.writeFile(filePath, 'Run `npm start` to begin\n', 'utf-8');

    const report = makeReport([
      makeIssue({
        reference: {
          id: 'r1',
          source: { path: filePath, line: 1, column: 1 },
          kind: 'cli-command',
          target: 'npm start',
          context: 'Run npm start',
        },
        patch: '-npm start\n+npm run dev',
      }),
    ], tmpDir);

    const result = await applyFixes(report, { dryRun: false });
    expect(result.applied).toBe(1);
    expect(result.skipped).toBe(0);

    const content = await fs.readFile(filePath, 'utf-8');
    expect(content).toBe('Run `npm run dev` to begin\n');
  });

  it('applies a version fix', async () => {
    const filePath = path.join(tmpDir, 'readme.md');
    await fs.writeFile(filePath, 'Current version: v1.0\n', 'utf-8');

    const report = makeReport([
      makeIssue({
        reference: {
          id: 'r1',
          source: { path: filePath, line: 1, column: 1 },
          kind: 'version-ref',
          target: 'v1.0',
          context: 'version badge',
        },
        kind: 'version-mismatch',
        patch: '-v1.0\n+v2.1',
      }),
    ], tmpDir);

    const result = await applyFixes(report, { dryRun: false });
    expect(result.applied).toBe(1);

    const content = await fs.readFile(filePath, 'utf-8');
    expect(content).toBe('Current version: v2.1\n');
  });

  it('applies multiple patches in one file bottom-up', async () => {
    const filePath = path.join(tmpDir, 'readme.md');
    await fs.writeFile(
      filePath,
      'line1: npm start\nline2: something\nline3: npm test\n',
      'utf-8'
    );

    const report = makeReport([
      makeIssue({
        reference: {
          id: 'r1',
          source: { path: filePath, line: 1, column: 1 },
          kind: 'cli-command',
          target: 'npm start',
          context: 'npm start',
        },
        patch: '-npm start\n+npm run dev',
      }),
      makeIssue({
        reference: {
          id: 'r2',
          source: { path: filePath, line: 3, column: 1 },
          kind: 'cli-command',
          target: 'npm test',
          context: 'npm test',
        },
        patch: '-npm test\n+npm run test',
      }),
    ], tmpDir);

    const result = await applyFixes(report, { dryRun: false });
    expect(result.applied).toBe(2);
    expect(result.skipped).toBe(0);

    const content = await fs.readFile(filePath, 'utf-8');
    expect(content).toBe('line1: npm run dev\nline2: something\nline3: npm run test\n');
  });

  it('skips patch when current content does not match', async () => {
    const filePath = path.join(tmpDir, 'readme.md');
    await fs.writeFile(filePath, 'Run `npm run build` to begin\n', 'utf-8');

    const report = makeReport([
      makeIssue({
        reference: {
          id: 'r1',
          source: { path: filePath, line: 1, column: 1 },
          kind: 'cli-command',
          target: 'npm start',
          context: 'npm start',
        },
        patch: '-npm start\n+npm run dev',
      }),
    ]);

    const result = await applyFixes(report, { dryRun: false });
    expect(result.applied).toBe(0);
    expect(result.skipped).toBe(1);
    expect(result.patches[0].applied).toBe(false);
  });

  it('returns empty patches when no auto-fixable issues exist', async () => {
    const report = makeReport([
      makeIssue({
        reference: {
          id: 'r1',
          source: { path: 'docs/readme.md', line: 1, column: 1 },
          kind: 'symbol',
          target: 'SomeSymbol',
          context: 'SomeSymbol',
        },
        kind: 'missing-symbol',
        autoFixable: false,
      }),
    ]);

    const result = await applyFixes(report, { dryRun: false });
    expect(result.applied).toBe(0);
    expect(result.skipped).toBe(0);
    expect(result.patches).toHaveLength(0);
  });
});

describe('writePatchFile', () => {
  it('produces valid unified diff format', async () => {
    const outputPath = path.join(tmpDir, 'output.patch');

    const patches = [
      {
        file: 'docs/readme.md',
        line: 5,
        kind: 'unknown-cli-command',
        original: 'npm start',
        replacement: 'npm run dev',
        applied: true,
      },
    ];

    await writePatchFile(patches, outputPath);
    const content = await fs.readFile(outputPath, 'utf-8');

    expect(content).toContain('--- a/docs/readme.md');
    expect(content).toContain('+++ b/docs/readme.md');
    expect(content).toContain('@@ -5,1 +5,1 @@');
    expect(content).toContain('-npm start');
    expect(content).toContain('+npm run dev');
  });

  it('writes multiple patches', async () => {
    const outputPath = path.join(tmpDir, 'output.patch');

    const patches = [
      {
        file: 'docs/readme.md',
        line: 5,
        kind: 'unknown-cli-command',
        original: 'npm start',
        replacement: 'npm run dev',
        applied: true,
      },
      {
        file: 'docs/guide.md',
        line: 10,
        kind: 'version-mismatch',
        original: 'v1.0',
        replacement: 'v2.1',
        applied: true,
      },
    ];

    await writePatchFile(patches, outputPath);
    const content = await fs.readFile(outputPath, 'utf-8');

    expect(content).toContain('--- a/docs/readme.md');
    expect(content).toContain('--- a/docs/guide.md');
    expect(content).toContain('-v1.0');
    expect(content).toContain('+v2.1');
  });
});
