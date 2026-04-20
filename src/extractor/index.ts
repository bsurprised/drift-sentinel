import { createHash } from 'node:crypto';
import { visit } from 'unist-util-visit';
import type { Node, Parent } from 'unist';
import type { ParsedDoc, DocReference } from '../types.js';
import {
  SYMBOL_PATTERN,
  FUNCTION_CALL_PATTERN,
  VERSION_PATTERN,
  CLI_PREFIXES,
  CLI_LANGS,
  BADGE_PATTERN,
} from './patterns.js';

/* ------------------------------------------------------------------ */
/*  MDAST node type guards                                             */
/* ------------------------------------------------------------------ */

interface MdastPosition {
  start: { line: number; column: number };
  end: { line: number; column: number };
}

interface LinkNode extends Node {
  type: 'link';
  url: string;
  children: Node[];
  position?: MdastPosition;
}

interface InlineCodeNode extends Node {
  type: 'inlineCode';
  value: string;
  position?: MdastPosition;
}

interface CodeNode extends Node {
  type: 'code';
  value: string;
  lang?: string | null;
  position?: MdastPosition;
}

interface ImageNode extends Node {
  type: 'image';
  url: string;
  alt?: string;
  position?: MdastPosition;
}

interface TextNode extends Node {
  type: 'text';
  value: string;
  position?: MdastPosition;
}

interface HeadingNode extends Node {
  type: 'heading';
  depth: number;
  children: Node[];
  position?: MdastPosition;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function shortHash(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 8);
}

function makeId(path: string, line: number, kind: string, target: string): string {
  return `${path}:${line}:${kind}:${shortHash(target)}`;
}

function pos(node: Node): { line: number; column: number } {
  const p = node.position as MdastPosition | undefined;
  return { line: p?.start.line ?? 1, column: p?.start.column ?? 1 };
}

/** Collect plain-text content from a node tree */
function collectText(node: Node): string {
  if ((node as TextNode).type === 'text') return (node as TextNode).value;
  if ((node as InlineCodeNode).type === 'inlineCode') return (node as InlineCodeNode).value;
  const parent = node as Parent;
  if (parent.children) {
    return parent.children.map(collectText).join('');
  }
  return '';
}

/** Walk up to find the nearest heading text */
function findNearestHeading(root: Node, targetLine: number): string | undefined {
  let lastHeading: string | undefined;

  visit(root, 'heading', (node: Node) => {
    const h = node as HeadingNode;
    const line = h.position?.start.line ?? 0;
    if (line <= targetLine) {
      lastHeading = collectText(h);
    }
  });

  return lastHeading;
}

/** Strip trailing parenthesised args for symbol resolution target */
function stripArgs(s: string): string {
  const idx = s.indexOf('(');
  return idx === -1 ? s : s.slice(0, idx);
}

/** Get a context string (first 100 chars of parent text) */
function parentContext(node: Node, root: Node): string {
  // Walk all paragraphs to find one that contains this node
  let ctx = '';
  visit(root, (n: Node) => {
    const p = n as Parent;
    if (p.children && p.children.includes(node)) {
      ctx = collectText(p).slice(0, 100);
    }
  });
  return ctx || '';
}

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

export function extractReferences(doc: ParsedDoc): DocReference[] {
  if (doc.source.type === 'markdown') {
    return extractMarkdownReferences(doc);
  }
  return [];
}

function extractMarkdownReferences(doc: ParsedDoc): DocReference[] {
  const tree = doc.ast as Node;
  if (!tree) return [];

  const refs: DocReference[] = [];
  const path = doc.source.path;

  // ---- link-external & link-file ----
  visit(tree, 'link', (node: Node) => {
    const link = node as LinkNode;
    const { line, column } = pos(link);
    const text = collectText(link);
    const url = link.url;

    if (url.startsWith('http://') || url.startsWith('https://')) {
      refs.push({
        id: makeId(path, line, 'link-external', url),
        source: { path, line, column },
        kind: 'link-external',
        target: url,
        context: text,
      });
    } else if (!url.startsWith('#') && !url.startsWith('mailto:')) {
      refs.push({
        id: makeId(path, line, 'link-file', url),
        source: { path, line, column },
        kind: 'link-file',
        target: url,
        context: text,
      });
    }
  });

  // ---- inlineCode → symbol | cli-command | version-ref ----
  visit(tree, 'inlineCode', (node: Node) => {
    const ic = node as InlineCodeNode;
    const { line, column } = pos(ic);
    const value = ic.value;

    // cli-command check (highest priority)
    if (CLI_PREFIXES.some((p) => value.startsWith(p))) {
      const target = value.startsWith('$ ') ? value.slice(2) : value;
      const heading = findNearestHeading(tree, line);
      refs.push({
        id: makeId(path, line, 'cli-command', target),
        source: { path, line, column },
        kind: 'cli-command',
        target,
        context: heading ?? '',
      });
      return;
    }

    // symbol check
    if (SYMBOL_PATTERN.test(value) || FUNCTION_CALL_PATTERN.test(value)) {
      const target = stripArgs(value);
      const ctx = parentContext(ic, tree);
      refs.push({
        id: makeId(path, line, 'symbol', target),
        source: { path, line, column },
        kind: 'symbol',
        target,
        context: ctx,
      });
      return;
    }

    // version-ref check
    const vm = VERSION_PATTERN.exec(value);
    if (vm && /^v?\d+\.\d+/.test(value)) {
      const ctx = parentContext(ic, tree);
      refs.push({
        id: makeId(path, line, 'version-ref', vm[1]),
        source: { path, line, column },
        kind: 'version-ref',
        target: vm[1],
        context: ctx,
      });
    }
  });

  // ---- code blocks → code-block | cli-command ----
  visit(tree, 'code', (node: Node) => {
    const code = node as CodeNode;
    const { line, column } = pos(code);
    const lang = code.lang ?? undefined;

    if (lang && CLI_LANGS.includes(lang)) {
      // Extract individual commands from shell blocks
      const lines = code.value.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const raw = lines[i].trim();
        if (!raw || raw.startsWith('#')) continue;
        const cmdLine = raw.startsWith('$ ') ? raw.slice(2) : raw;
        refs.push({
          id: makeId(path, line + i, 'cli-command', cmdLine),
          source: { path, line: line + i, column },
          kind: 'cli-command',
          target: cmdLine,
          context: findNearestHeading(tree, line) ?? '',
          language: lang,
        });
      }
    } else if (lang) {
      // Regular code block
      refs.push({
        id: makeId(path, line, 'code-block', code.value),
        source: { path, line, column },
        kind: 'code-block',
        target: code.value,
        context: lang,
        language: lang,
      });
    }
  });

  // ---- images → version-ref from badge URLs ----
  visit(tree, 'image', (node: Node) => {
    const img = node as ImageNode;
    const { line, column } = pos(img);
    const bm = BADGE_PATTERN.exec(img.url);
    if (bm) {
      refs.push({
        id: makeId(path, line, 'version-ref', bm[1]),
        source: { path, line, column },
        kind: 'version-ref',
        target: bm[1],
        context: img.alt ?? img.url,
      });
    }
  });

  // ---- text nodes → version-ref ----
  visit(tree, 'text', (node: Node) => {
    const text = node as TextNode;
    const { line, column } = pos(text);
    const versionInText = /\bversion\s+v?(\d+\.\d+(?:\.\d+)?(?:-[a-zA-Z0-9.]+)?)\b/gi;
    let match: RegExpExecArray | null;
    while ((match = versionInText.exec(text.value)) !== null) {
      refs.push({
        id: makeId(path, line, 'version-ref', match[1]),
        source: { path, line, column: column + match.index },
        kind: 'version-ref',
        target: match[1],
        context: text.value.slice(0, 100),
      });
    }
  });

  return refs;
}
