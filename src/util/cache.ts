import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, readdir, rm, rename } from 'node:fs/promises';
import { join } from 'node:path';

export interface CacheEntry<T> {
  value: T;
  cachedAt: number; // epoch ms
}

export class DiskCache<T> {
  constructor(
    private cacheDir: string,
    private ttlDays: number,
  ) {}

  private hashKey(key: string): string {
    return createHash('sha256').update(key).digest('hex');
  }

  private filePath(key: string): string {
    return join(this.cacheDir, `${this.hashKey(key)}.json`);
  }

  async get(key: string): Promise<T | undefined> {
    try {
      const raw = await readFile(this.filePath(key), 'utf-8');
      const entry: CacheEntry<T> = JSON.parse(raw);
      const ageMs = Date.now() - entry.cachedAt;
      const ttlMs = this.ttlDays * 24 * 60 * 60 * 1000;
      if (ageMs > ttlMs) {
        return undefined;
      }
      return entry.value;
    } catch {
      return undefined;
    }
  }

  async set(key: string, value: T): Promise<void> {
    await mkdir(this.cacheDir, { recursive: true });
    const entry: CacheEntry<T> = { value, cachedAt: Date.now() };
    const finalPath = this.filePath(key);
    const tempPath = finalPath + '.tmp';
    await writeFile(tempPath, JSON.stringify(entry), 'utf-8');
    await rename(tempPath, finalPath);
  }

  async clear(): Promise<void> {
    try {
      const files = await readdir(this.cacheDir);
      await Promise.all(files.map((f) => rm(join(this.cacheDir, f), { force: true })));
    } catch {
      // Directory may not exist
    }
  }
}
