import { describe, it, expect } from 'vitest';
import {
  DEFAULT_CONFIG,
  loadConfig,
  isRuleEnabled,
  getEffectiveSeverity,
} from '../src/config.js';
import type { DriftConfig } from '../src/types.js';

describe('DEFAULT_CONFIG', () => {
  it('has expected default include patterns', () => {
    expect(DEFAULT_CONFIG.include).toContain('**/*.md');
    expect(DEFAULT_CONFIG.include).toContain('**/*.mdx');
  });

  it('has expected default exclude patterns', () => {
    expect(DEFAULT_CONFIG.exclude).toContain('**/node_modules/**');
    expect(DEFAULT_CONFIG.exclude).toContain('**/dist/**');
  });

  it('defaults offline to false', () => {
    expect(DEFAULT_CONFIG.offline).toBe(false);
  });

  it('defaults linkTimeout to 5000', () => {
    expect(DEFAULT_CONFIG.linkTimeout).toBe(5000);
  });

  it('defaults linkCacheDays to 7', () => {
    expect(DEFAULT_CONFIG.linkCacheDays).toBe(7);
  });

  it('defaults json and sarif to false', () => {
    expect(DEFAULT_CONFIG.json).toBe(false);
    expect(DEFAULT_CONFIG.sarif).toBe(false);
  });

  it('has empty rules by default', () => {
    expect(DEFAULT_CONFIG.rules).toEqual({});
  });

  it('has resolver defaults', () => {
    expect(DEFAULT_CONFIG.resolvers.typescript?.tsconfig).toBe('./tsconfig.json');
    expect(DEFAULT_CONFIG.resolvers.grep?.enabled).toBe(true);
  });
});

describe('loadConfig', () => {
  it('returns defaults when no config file exists', async () => {
    const config = await loadConfig({}, '/nonexistent-path');
    expect(config.include).toEqual(DEFAULT_CONFIG.include);
    expect(config.offline).toBe(false);
  });

  it('merges CLI options over defaults', async () => {
    const config = await loadConfig(
      { offline: true, linkTimeout: 10000 },
      '/nonexistent-path',
    );
    expect(config.offline).toBe(true);
    expect(config.linkTimeout).toBe(10000);
    // Other defaults preserved
    expect(config.json).toBe(false);
  });

  it('deep-merges nested resolver options', async () => {
    const config = await loadConfig(
      { resolvers: { typescript: { tsconfig: './custom.json' } } },
      '/nonexistent-path',
    );
    expect(config.resolvers.typescript?.tsconfig).toBe('./custom.json');
    // grep should still be present from defaults
    expect(config.resolvers.grep?.enabled).toBe(true);
  });
});

describe('isRuleEnabled', () => {
  it('returns true when rule is not in config', () => {
    expect(isRuleEnabled(DEFAULT_CONFIG, 'dead-external-link')).toBe(true);
  });

  it('returns false when rule is off', () => {
    const config: DriftConfig = {
      ...DEFAULT_CONFIG,
      rules: { 'dead-external-link': 'off' },
    };
    expect(isRuleEnabled(config, 'dead-external-link')).toBe(false);
  });

  it('returns true when rule has a severity set', () => {
    const config: DriftConfig = {
      ...DEFAULT_CONFIG,
      rules: { 'missing-symbol': 'high' },
    };
    expect(isRuleEnabled(config, 'missing-symbol')).toBe(true);
  });
});

describe('getEffectiveSeverity', () => {
  it('returns default severity when no override exists', () => {
    expect(getEffectiveSeverity(DEFAULT_CONFIG, 'dead-external-link', 'medium')).toBe('medium');
  });

  it('returns overridden severity from config', () => {
    const config: DriftConfig = {
      ...DEFAULT_CONFIG,
      rules: { 'dead-external-link': 'low' },
    };
    expect(getEffectiveSeverity(config, 'dead-external-link', 'high')).toBe('low');
  });

  it('returns default when rule is off', () => {
    const config: DriftConfig = {
      ...DEFAULT_CONFIG,
      rules: { 'missing-symbol': 'off' },
    };
    expect(getEffectiveSeverity(config, 'missing-symbol', 'high')).toBe('high');
  });
});
