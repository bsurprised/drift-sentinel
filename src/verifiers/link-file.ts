import { access, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
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

export class LinkFileVerifier implements Verifier {
  kind: DriftKind = 'dead-file-ref';

  async check(
    ref: DocReference,
    _ctx: ProjectContext,
    _resolvers: Map<string, SymbolResolver>,
  ): Promise<DriftIssue | null> {
    if (ref.kind !== 'link-file') return null;

    // Separate file path from anchor
    const hashIdx = ref.target.indexOf('#');
    const filePath = hashIdx >= 0 ? ref.target.slice(0, hashIdx) : ref.target;
    const anchor = hashIdx >= 0 ? ref.target.slice(hashIdx + 1) : null;

    // Resolve relative to the doc file's directory
    const docDir = dirname(ref.source.path);
    const resolvedPath = resolve(docDir, filePath);

    // Check file existence
    const exists = await fileExists(resolvedPath);
    if (!exists) {
      return {
        reference: ref,
        kind: 'dead-file-ref',
        severity: 'high',
        message: `Referenced file does not exist: ${ref.target}`,
        suggestion: 'Check the file path or remove the broken link',
        autoFixable: false,
      };
    }

    // Check anchor if present
    if (anchor) {
      const content = await readFile(resolvedPath, 'utf-8');
      const anchors = extractAnchors(content);
      if (!anchors.includes(anchor)) {
        return {
          reference: ref,
          kind: 'dead-file-ref',
          severity: 'medium',
          message: `Anchor #${anchor} not found in ${filePath}`,
          suggestion: 'Check the heading text or remove the anchor',
          autoFixable: false,
        };
      }
    }

    return null;
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
