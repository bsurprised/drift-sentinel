import type { DocSource, ParsedDoc } from '../types.js';
import { parseMarkdown } from './markdown.js';

export { parseMarkdown } from './markdown.js';

export async function parseDoc(source: DocSource): Promise<ParsedDoc> {
  switch (source.type) {
    case 'markdown':
      return parseMarkdown(source);
    case 'jsdoc':
    case 'tsdoc':
    case 'rustdoc':
    case 'xmldoc':
      // Markdown-only in v1; other doc types return null AST
      return { source, ast: null };
    default:
      return { source, ast: null };
  }
}
