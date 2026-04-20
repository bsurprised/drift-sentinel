import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DiskCache } from '../../src/util/cache.js';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('DiskCache', () => {
  let cacheDir: string;
  let cache: DiskCache<string>;

  beforeEach(async () => {
    cacheDir = await mkdtemp(join(tmpdir(), 'drift-cache-test-'));
    cache = new DiskCache<string>(cacheDir, 7);
  });

  afterEach(async () => {
    await rm(cacheDir, { recursive: true, force: true });
  });

  it('returns undefined for missing keys', async () => {
    const result = await cache.get('nonexistent');
    expect(result).toBeUndefined();
  });

  it('returns value after set', async () => {
    await cache.set('key1', 'value1');
    const result = await cache.get('key1');
    expect(result).toBe('value1');
  });

  it('returns undefined for expired entries', async () => {
    // Create a cache with 0 TTL days (already expired)
    const expiredCache = new DiskCache<string>(cacheDir, 0);
    await expiredCache.set('key2', 'value2');
    const result = await expiredCache.get('key2');
    expect(result).toBeUndefined();
  });

  it('clears all entries', async () => {
    await cache.set('a', 'val-a');
    await cache.set('b', 'val-b');

    await cache.clear();

    expect(await cache.get('a')).toBeUndefined();
    expect(await cache.get('b')).toBeUndefined();
  });

  it('handles complex values', async () => {
    const complexCache = new DiskCache<{ status: number; url: string }>(cacheDir, 7);
    await complexCache.set('link1', { status: 200, url: 'https://example.com' });
    const result = await complexCache.get('link1');
    expect(result).toEqual({ status: 200, url: 'https://example.com' });
  });
});
