import { join } from 'node:path';
import { homedir } from 'node:os';
import { DiskCache } from '../util/cache.js';
import type {
  Verifier,
  DriftIssue,
  DriftKind,
  Severity,
  DocReference,
  ProjectContext,
  SymbolResolver,
} from '../types.js';

interface CachedLinkResult {
  status: number | null; // null = network error
  error?: string;
}

interface LinkExternalOptions {
  timeout?: number;
  cacheDays?: number;
  offline?: boolean;
  maxConcurrent?: number;
}

// Simple semaphore for concurrency control
class Semaphore {
  private queue: Array<() => void> = [];
  private active = 0;

  constructor(private max: number) {}

  async acquire(): Promise<void> {
    if (this.active < this.max) {
      this.active++;
      return;
    }
    return new Promise<void>((resolve) => {
      this.queue.push(() => {
        this.active++;
        resolve();
      });
    });
  }

  release(): void {
    this.active--;
    const next = this.queue.shift();
    if (next) next();
  }
}

export class LinkExternalVerifier implements Verifier {
  kind: DriftKind = 'dead-external-link';

  private timeout: number;
  private cacheDays: number;
  private offline: boolean;
  private semaphore: Semaphore;
  private hostLastRequest = new Map<string, number>();
  private cache: DiskCache<CachedLinkResult>;

  constructor(options: LinkExternalOptions = {}) {
    this.timeout = options.timeout ?? 5000;
    this.cacheDays = options.cacheDays ?? 7;
    this.offline = options.offline ?? false;
    this.semaphore = new Semaphore(options.maxConcurrent ?? 10);
    this.cache = new DiskCache<CachedLinkResult>(
      join(homedir(), '.cache', 'drift-sentinel', 'links'),
      this.cacheDays,
    );
  }

  /** Allow tests to inject a custom cache directory */
  setCacheDir(dir: string): void {
    this.cache = new DiskCache<CachedLinkResult>(dir, this.cacheDays);
  }

  async check(
    ref: DocReference,
    _ctx: ProjectContext,
    _resolvers: Map<string, SymbolResolver>,
  ): Promise<DriftIssue | null> {
    if (this.offline) return null;
    if (ref.kind !== 'link-external') return null;

    const url = ref.target;

    // Check cache
    const cached = await this.cache.get(url);
    if (cached !== undefined) {
      return this.toIssue(ref, cached);
    }

    // Acquire semaphore slot
    await this.semaphore.acquire();
    try {
      // Rate limit per host: max 3 req/s → min 334ms between requests
      await this.rateLimit(url);

      const result = await this.fetchUrl(url);
      await this.cache.set(url, result);
      return this.toIssue(ref, result);
    } finally {
      this.semaphore.release();
    }
  }

  private async rateLimit(url: string): Promise<void> {
    let host: string;
    try {
      host = new URL(url).host;
    } catch {
      return;
    }
    const minInterval = 334; // ~3 req/s
    const last = this.hostLastRequest.get(host);
    if (last !== undefined) {
      const elapsed = Date.now() - last;
      if (elapsed < minInterval) {
        await new Promise((r) => setTimeout(r, minInterval - elapsed));
      }
    }
    this.hostLastRequest.set(host, Date.now());
  }

  private async fetchUrl(url: string): Promise<CachedLinkResult> {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeout);

      let response: Response;
      try {
        response = await fetch(url, {
          method: 'HEAD',
          redirect: 'follow',
          signal: controller.signal,
        });
      } catch {
        // HEAD failed (network error, timeout, etc.) — retry with GET
        clearTimeout(timer);
        const controller2 = new AbortController();
        const timer2 = setTimeout(() => controller2.abort(), this.timeout);
        try {
          response = await fetch(url, {
            method: 'GET',
            redirect: 'follow',
            signal: controller2.signal,
          });
        } finally {
          clearTimeout(timer2);
        }
        return { status: response.status };
      } finally {
        clearTimeout(timer);
      }

      // If HEAD returns 405, retry with GET
      if (response.status === 405) {
        const controller2 = new AbortController();
        const timer2 = setTimeout(() => controller2.abort(), this.timeout);
        try {
          response = await fetch(url, {
            method: 'GET',
            redirect: 'follow',
            signal: controller2.signal,
          });
        } finally {
          clearTimeout(timer2);
        }
      }

      return { status: response.status };
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Unknown network error';
      return { status: null, error: message };
    }
  }

  private toIssue(
    ref: DocReference,
    result: CachedLinkResult,
  ): DriftIssue | null {
    if (result.status !== null && result.status >= 200 && result.status < 400) {
      return null;
    }

    let severity: Severity;
    let message: string;
    let suggestion: string | undefined;

    if (result.status === null) {
      // Network error
      severity = 'low';
      message = `External link unreachable (network error): ${ref.target}`;
    } else if (result.status === 404 || result.status === 410) {
      severity = 'high';
      message = `External link returns ${result.status}: ${ref.target}`;
      suggestion = 'Remove the link or update to a valid URL';
    } else {
      severity = 'medium';
      message = `External link returns ${result.status}: ${ref.target}`;
    }

    return {
      reference: ref,
      kind: 'dead-external-link',
      severity,
      message,
      suggestion,
      autoFixable: false,
    };
  }
}
