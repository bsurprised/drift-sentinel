import { readFile } from 'node:fs/promises';
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

export async function loadConfig(
  cliOptions: Partial<DriftConfig>,
  root: string,
): Promise<DriftConfig> {
  let config: DriftConfig = { ...DEFAULT_CONFIG };

  // Try loading drift.config.ts or drift.config.js from root
  for (const filename of ['drift.config.ts', 'drift.config.js']) {
    const configPath = join(root, filename);
    try {
      await readFile(configPath, 'utf-8');
      const fileUrl = pathToFileURL(configPath).href;
      const mod = await import(fileUrl);
      const fileConfig = (mod.default ?? mod) as Partial<DriftConfig>;
      config = deepMerge(config, fileConfig);
      break;
    } catch {
      // File doesn't exist or can't be imported, continue
    }
  }

  // CLI options win
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
