import { describe, it, expect, vi } from 'vitest';
import { createLogger, setDefaultLogger, getLogger } from '../../../src/util/logger.js';

describe('createLogger (LLD-G / B-05)', () => {
  it('returns a new instance on each call', () => {
    const a = createLogger({});
    const b = createLogger({});
    expect(a).not.toBe(b);
  });

  it('does not mutate the default logger after being called', () => {
    const sentinel = createLogger({});
    setDefaultLogger(sentinel);

    createLogger({});  // must NOT overwrite defaultLogger
    createLogger({});  // call again to be sure

    expect(getLogger()).toBe(sentinel);
  });
});

describe('setDefaultLogger / getLogger (LLD-G / B-05)', () => {
  it('setDefaultLogger + getLogger round-trip', () => {
    const l = createLogger({});
    setDefaultLogger(l);
    expect(getLogger()).toBe(l);
  });

  it('getLogger returns same instance on repeated calls', () => {
    const a = getLogger();
    const b = getLogger();
    expect(a).toBe(b);
  });

  it('getLogger returns a logger even before explicit setDefaultLogger', async () => {
    vi.resetModules();
    const { getLogger: fresh } = await import('../../../src/util/logger.js');
    const logger = fresh();
    expect(logger).toBeDefined();
    expect(typeof logger.info).toBe('function');
    expect(typeof logger.warn).toBe('function');
  });
});
