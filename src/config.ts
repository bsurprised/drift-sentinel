import { access } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { DriftConfig, DriftKind, Severity } from './types.js';

export const DEFAULT_CONFIG: DriftConfig = {
  include: ['**/*.md', '**/*.mdx', '**/README*', '**/CHANGELOG*', '**/CONTRIBUTING*'],
  exclude: ['**/node_modules/**', '**/dist/**', '**/build/**', '**/target/**', '**/.git/**', '**/vendor/**'],
  rules: {},
  ignorePaths: [],
  resolvers: {
    typescript: { tsconfig: './tsconfig.json' },
    grep: { enabled: true },
  },
  linkTimeout: 5000,
  linkCacheDays: 7,
  maxSeverity: 'high',
  offline: false,
  json: false,
  sarif: false,
  debug: false,
  verbose: false,
};

function deepMerge(base: DriftConfig, override: Partial<DriftConfig>): DriftConfig {
  const result = { ...base };
  for (const [key, val] of Object.entries(override)) {
    if (val === undefined) continue;
    const k = key as keyof DriftConfig;
    const existing = result[k];
    if (
      typeof val === 'object' &&
      val !== null &&
      !Array.isArray(val) &&
      typeof existing === 'object' &&
      existing !== null &&
      !Array.isArray(existing)
    ) {
      (result as any)[k] = { ...existing, ...val };
    } else {
      (result as any)[k] = val;
    }
  }
  return result;
}

const CANDIDATE_BASENAMES = [
  'drift.config.mjs',
  'drift.config.cjs',
  'drift.config.js',
  'drift.config.ts',
];

async function fileExists(p: string): Promise<boolean> {
  try { await access(p); return true; } catch { return false; }
}

function tsLoaderRegistered(): boolean {
  const opts = process.env.NODE_OPTIONS ?? '';
  return /tsx|ts-node/.test(opts) || !!(process as any)[Symbol.for('ts-node.register.instance')];
}

export async function loadConfig(
  cliOptions: Partial<DriftConfig>,
  root: string,
): Promise<DriftConfig> {
  let fileConfig: Partial<DriftConfig> = {};

  for (const name of CANDIDATE_BASENAMES) {
    const abs = join(root, name);
    if (!(await fileExists(abs))) continue;

    if (name.endsWith('.ts') && !tsLoaderRegistered()) {
      throw new Error(
        `Found ${name} but no TypeScript loader is registered.\n` +
        `Run with \`node --import tsx bin/drift.js ...\` or rename to drift.config.mjs / .js.`,
      );
    }

    let mod;
    try {
      mod = await import(pathToFileURL(abs).href);
    } catch (err) {
      throw new Error(
        `Failed to load ${abs}: ${(err as Error).message}`,
        { cause: err },
      );
    }
    fileConfig = mod.default ?? mod;
    break;
  }

  let config = deepMerge(DEFAULT_CONFIG, fileConfig);
  config = deepMerge(config, cliOptions);
  return config;
}

export function isRuleEnabled(config: DriftConfig, kind: DriftKind): boolean {
  return config.rules[kind] !== 'off';
}

export function getEffectiveSeverity(
  config: DriftConfig,
  kind: DriftKind,
  defaultSeverity: Severity,
): Severity {
  const override = config.rules[kind];
  if (override && override !== 'off') {
    return override;
  }
  return defaultSeverity;
}
