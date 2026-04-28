/**
 * Integration tests for CLI commands added in LLD-G (M-01, M-05).
 * Tests use direct function/module imports rather than subprocess spawning
 * (no tsx/ts-node in devDeps; bin/drift.js requires a built dist/).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, rm, readFile, access } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { VALID_DRIFT_KINDS } from '../../src/types.js';
import { VERIFIER_DESCRIPTIONS } from '../../src/verifiers/catalog.js';
import { runInit } from '../../src/cli/init.js';

describe('verifiers list (LLD-G / M-01)', () => {
  it('VERIFIER_DESCRIPTIONS contains every DriftKind', () => {
    const keys = Object.keys(VERIFIER_DESCRIPTIONS);
    for (const kind of VALID_DRIFT_KINDS) {
      expect(keys).toContain(kind);
    }
  });

  it('formatted output lines contain all DriftKind values', () => {
    const lines: string[] = [];
    for (const [kind, meta] of Object.entries(VERIFIER_DESCRIPTIONS)) {
      lines.push(`${kind.padEnd(20)} [${meta.defaultSeverity}] ${meta.description}`);
    }
    const output = lines.join('\n');
    for (const kind of VALID_DRIFT_KINDS) {
      expect(output).toContain(kind);
    }
  });
});

describe('init command (LLD-G / M-05)', () => {
  let tmpDir: string;

  beforeAll(async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), 'drift-init-'));
  });

  afterAll(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('writes drift.config.mjs when none exists', async () => {
    await runInit(tmpDir, false);
    const content = await readFile(path.join(tmpDir, 'drift.config.mjs'), 'utf-8');
    expect(content).toContain('export default');
    expect(content).toContain('ignorePaths');
  });

  it('refuses to overwrite without --force (file exists)', async () => {
    await expect(runInit(tmpDir, false)).rejects.toThrow('already exists');
  });

  it('overwrites with --force', async () => {
    await runInit(tmpDir, true);
    const content = await readFile(path.join(tmpDir, 'drift.config.mjs'), 'utf-8');
    expect(content).toContain('export default');
    expect(content).toContain('ignorePaths');
  });

  it('written file is accessible on disk', async () => {
    await expect(access(path.join(tmpDir, 'drift.config.mjs'))).resolves.not.toThrow();
  });
});
