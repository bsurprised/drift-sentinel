import { access, readFile } from 'node:fs/promises';
import { dirname, resolve, join, basename } from 'node:path';
import type {
  Verifier,
  DriftIssue,
  DriftKind,
  DocReference,
  ProjectContext,
  SymbolResolver,
} from '../types.js';

export function headingToAnchor(heading: string): string {
  return heading
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .trim();
}

export function extractAnchors(content: string): string[] {
  const anchors: string[] = [];

  // Markdown headings: # Heading → heading
  const headingRegex = /^#{1,6}\s+(.+)$/gm;
  let match;
  while ((match = headingRegex.exec(content))) {
    anchors.push(headingToAnchor(match[1]));
  }

  // HTML id attributes: id="anchor"
  const idRegex = /id=["']([^"']+)["']/g;
  while ((match = idRegex.exec(content))) {
    anchors.push(match[1]);
  }

  return anchors;
}

/** Strip query string and decode URL-encoded path components. */
export function decodeAndStripQuery(target: string): string {
  const noQuery = target.split('?')[0];
  try { return decodeURIComponent(noQuery); } catch { return noQuery; }
}

/** Well-known root-level files whose bare mention in docs should never be flagged. */
export const ROOT_ALLOWLIST = new Set([
  'package.json', 'package-lock.json', 'tsconfig.json', 'tsconfig.base.json',
  'README.md', 'CHANGELOG.md', 'CONTRIBUTING.md', 'LICENSE', 'LICENSE.md',
  'Dockerfile', '.gitignore', '.editorconfig', 'pnpm-lock.yaml', 'yarn.lock',
  'Cargo.toml', 'go.mod', 'requirements.txt', 'pyproject.toml',
]);

export class LinkFileVerifier implements Verifier {
  kind: DriftKind = 'dead-file-ref';

  async check(
    ref: DocReference,
    ctx: ProjectContext,
    _resolvers: Map<string, SymbolResolver>,
  ): Promise<DriftIssue | null> {
    if (ref.kind !== 'link-file') return null;

    // Separate anchor from file path
    const hashIdx = ref.target.indexOf('#');
    const rawFilePath = hashIdx >= 0 ? ref.target.slice(0, hashIdx) : ref.target;
    const anchor = hashIdx >= 0 ? ref.target.slice(hashIdx + 1) : null;

    // Decode URL encoding and strip query strings
    const filePath = decodeAndStripQuery(rawFilePath);
    if (!filePath) return null;

    // Tier 1: doc-relative resolution
    const docDir = dirname(ref.source.path);
    const docRelative = resolve(docDir, filePath);
    if (await fileExists(docRelative)) {
      if (anchor) {
        const content = await readFile(docRelative, 'utf-8');
        const anchors = extractAnchors(content);
        if (!anchors.includes(anchor)) {
          return {
            reference: ref,
            kind: 'dead-file-ref',
            severity: 'medium',
            message: `Anchor #${anchor} not found in ${rawFilePath}`,
            suggestion: 'Check the heading text or remove the anchor',
            autoFixable: false,
          };
        }
      }
      return null;
    }

    // Determine if strict (markdown-link) or loose (inline-code) resolution
    const isMarkdownLink =
      ref.origin === 'markdown-link' ||
      filePath.startsWith('./') ||
      filePath.startsWith('../') ||
      filePath.startsWith('/');

    if (!isMarkdownLink) {
      const isBareName = !filePath.includes('/') && !filePath.includes('\\');
      if (isBareName) {
        // Tier 2: root-relative resolution
        const rootCandidate = join(ctx.root, filePath);
        if (await fileExists(rootCandidate)) return null;

        if (ROOT_ALLOWLIST.has(filePath)) {
          // Already tried root; if we got here it really is missing — fall through to issue
        } else {
          // Tier 4: exactly-one tracked-basename match across the project
          const matches = await ctx.findFilesByBasename?.(basename(filePath)) ?? [];
          if (matches.length === 1) return null;
        }
      }
    }

    return {
      reference: ref,
      kind: 'dead-file-ref',
      severity: 'high',
      message: `Referenced file does not exist: ${ref.target}`,
      suggestion: 'Check the file path or remove the broken link',
      autoFixable: false,
    };
  }
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}
