import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import type { DocSource, ParsedDoc } from '../types.js';

const processor = unified().use(remarkParse).use(remarkGfm);

export async function parseMarkdown(source: DocSource): Promise<ParsedDoc> {
  try {
    const ast = processor.parse(source.content);
    return { source, ast };
  } catch {
    // Graceful fallback: return an empty root node
    return {
      source,
      ast: { type: 'root', children: [] },
    };
  }
}
