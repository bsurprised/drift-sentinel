import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { createServer } from 'node:http';
import type { Server, IncomingMessage, ServerResponse } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { LinkExternalVerifier } from '../../src/verifiers/link-external.js';
import type { DocReference, ProjectContext, SymbolResolver } from '../../src/types.js';

let server: Server;
let baseUrl: string;
let cacheDir: string;

const ctx: ProjectContext = {
  root: '/fake/project',
  detectedLanguages: ['typescript'],
  makefileTargets: [],
};

const resolvers = new Map<string, SymbolResolver>();

function makeRef(url: string): DocReference {
  return {
    id: 'test-link',
    source: { path: '/fake/docs/README.md', line: 10, column: 1 },
    kind: 'link-external',
    target: url,
    context: `[example](${url})`,
  };
}

beforeAll(async () => {
  server = createServer((req: IncomingMessage, res: ServerResponse) => {
    if (req.url === '/ok') {
      res.writeHead(200);
      res.end();
    } else if (req.url === '/not-found') {
      res.writeHead(404);
      res.end();
    } else if (req.url === '/gone') {
      res.writeHead(410);
      res.end();
    } else if (req.url === '/error') {
      res.writeHead(500);
      res.end();
    } else if (req.url === '/redirect') {
      res.writeHead(301, { Location: '/ok' });
      res.end();
    } else if (req.url === '/head-not-allowed') {
      if (req.method === 'HEAD') {
        res.writeHead(405);
        res.end();
      } else {
        res.writeHead(200);
        res.end();
      }
    } else if (req.url === '/forbidden') {
      res.writeHead(403);
      res.end();
    } else {
      res.writeHead(404);
      res.end();
    }
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address();
  if (addr && typeof addr !== 'string') {
    baseUrl = `http://127.0.0.1:${addr.port}`;
  }
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve())),
  );
});

beforeEach(async () => {
  cacheDir = await mkdtemp(join(tmpdir(), 'drift-link-cache-'));
});

afterEach(async () => {
  await rm(cacheDir, { recursive: true, force: true });
});

describe('LinkExternalVerifier', () => {
  it('returns null for 200 response', async () => {
    const verifier = new LinkExternalVerifier({ timeout: 5000 });
    verifier.setCacheDir(cacheDir);
    const result = await verifier.check(makeRef(`${baseUrl}/ok`), ctx, resolvers);
    expect(result).toBeNull();
  });

  it('returns HIGH for 404', async () => {
    const verifier = new LinkExternalVerifier({ timeout: 5000 });
    verifier.setCacheDir(cacheDir);
    const result = await verifier.check(makeRef(`${baseUrl}/not-found`), ctx, resolvers);
    expect(result).not.toBeNull();
    expect(result!.severity).toBe('high');
    expect(result!.kind).toBe('dead-external-link');
    expect(result!.message).toContain('404');
  });

  it('returns HIGH for 410 Gone', async () => {
    const verifier = new LinkExternalVerifier({ timeout: 5000 });
    verifier.setCacheDir(cacheDir);
    const result = await verifier.check(makeRef(`${baseUrl}/gone`), ctx, resolvers);
    expect(result).not.toBeNull();
    expect(result!.severity).toBe('high');
    expect(result!.message).toContain('410');
  });

  it('returns MEDIUM for 500', async () => {
    const verifier = new LinkExternalVerifier({ timeout: 5000 });
    verifier.setCacheDir(cacheDir);
    const result = await verifier.check(makeRef(`${baseUrl}/error`), ctx, resolvers);
    expect(result).not.toBeNull();
    expect(result!.severity).toBe('medium');
    expect(result!.message).toContain('500');
  });

  it('returns LOW for network error', async () => {
    const verifier = new LinkExternalVerifier({ timeout: 2000 });
    verifier.setCacheDir(cacheDir);
    // Use a port that's almost certainly not listening
    const result = await verifier.check(
      makeRef('http://127.0.0.1:1/unreachable'),
      ctx,
      resolvers,
    );
    expect(result).not.toBeNull();
    expect(result!.severity).toBe('low');
    expect(result!.message).toContain('network error');
  });

  it('follows redirects (301 → 200 = OK)', async () => {
    const verifier = new LinkExternalVerifier({ timeout: 5000 });
    verifier.setCacheDir(cacheDir);
    const result = await verifier.check(makeRef(`${baseUrl}/redirect`), ctx, resolvers);
    expect(result).toBeNull();
  });

  it('skips check in offline mode', async () => {
    const verifier = new LinkExternalVerifier({ offline: true });
    verifier.setCacheDir(cacheDir);
    const result = await verifier.check(makeRef(`${baseUrl}/not-found`), ctx, resolvers);
    expect(result).toBeNull();
  });

  it('uses cache for repeated URLs', async () => {
    const verifier = new LinkExternalVerifier({ timeout: 5000 });
    verifier.setCacheDir(cacheDir);
    const url = `${baseUrl}/not-found`;

    const result1 = await verifier.check(makeRef(url), ctx, resolvers);
    expect(result1).not.toBeNull();

    // Second call should use cache — we verify it still returns the same result
    const result2 = await verifier.check(makeRef(url), ctx, resolvers);
    expect(result2).not.toBeNull();
    expect(result2!.severity).toBe(result1!.severity);
    expect(result2!.message).toBe(result1!.message);
  });

  it('returns null for non-link-external refs', async () => {
    const verifier = new LinkExternalVerifier({ timeout: 5000 });
    verifier.setCacheDir(cacheDir);
    const ref: DocReference = {
      id: 'test',
      source: { path: '/fake/README.md', line: 1, column: 1 },
      kind: 'link-file',
      target: './other.md',
      context: '[other](./other.md)',
    };
    const result = await verifier.check(ref, ctx, resolvers);
    expect(result).toBeNull();
  });

  it('retries with GET when HEAD returns 405', async () => {
    const verifier = new LinkExternalVerifier({ timeout: 5000 });
    verifier.setCacheDir(cacheDir);
    const result = await verifier.check(makeRef(`${baseUrl}/head-not-allowed`), ctx, resolvers);
    expect(result).toBeNull();
  });

  it('returns MEDIUM for 403 Forbidden', async () => {
    const verifier = new LinkExternalVerifier({ timeout: 5000 });
    verifier.setCacheDir(cacheDir);
    const result = await verifier.check(makeRef(`${baseUrl}/forbidden`), ctx, resolvers);
    expect(result).not.toBeNull();
    expect(result!.severity).toBe('medium');
  });

  it('has autoFixable set to false', async () => {
    const verifier = new LinkExternalVerifier({ timeout: 5000 });
    verifier.setCacheDir(cacheDir);
    const result = await verifier.check(makeRef(`${baseUrl}/not-found`), ctx, resolvers);
    expect(result).not.toBeNull();
    expect(result!.autoFixable).toBe(false);
  });

  it('provides suggestion for 404', async () => {
    const verifier = new LinkExternalVerifier({ timeout: 5000 });
    verifier.setCacheDir(cacheDir);
    const result = await verifier.check(makeRef(`${baseUrl}/not-found`), ctx, resolvers);
    expect(result).not.toBeNull();
    expect(result!.suggestion).toBe('Remove the link or update to a valid URL');
  });
});
