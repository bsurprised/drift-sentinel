import { describe, it, expect } from 'vitest';
import { parseMarkdown } from '../../src/parsers/markdown.js';
import { parseDoc } from '../../src/parsers/index.js';
import type { DocSource } from '../../src/types.js';

function md(content: string): DocSource {
  return { path: 'test.md', type: 'markdown', content };
}

describe('parseMarkdown', () => {
  it('parses a simple markdown file into MDAST', async () => {
    const result = await parseMarkdown(md('# Hello\n\nWorld'));
    expect(result.source.path).toBe('test.md');
    const ast = result.ast as { type: string; children: unknown[] };
    expect(ast.type).toBe('root');
    expect(ast.children.length).toBeGreaterThan(0);
  });

  it('handles GFM tables', async () => {
    const table = '| A | B |\n| - | - |\n| 1 | 2 |';
    const result = await parseMarkdown(md(table));
    const ast = result.ast as { type: string; children: Array<{ type: string }> };
    expect(ast.children.some((c) => c.type === 'table')).toBe(true);
  });

  it('handles fenced code blocks with language tags', async () => {
    const content = '```typescript\nconst x = 1;\n```';
    const result = await parseMarkdown(md(content));
    const ast = result.ast as { type: string; children: Array<{ type: string; lang?: string }> };
    const codeNode = ast.children.find((c) => c.type === 'code');
    expect(codeNode).toBeDefined();
    expect(codeNode!.lang).toBe('typescript');
  });

  it('returns a tree for empty content', async () => {
    const result = await parseMarkdown(md(''));
    const ast = result.ast as { type: string; children: unknown[] };
    expect(ast.type).toBe('root');
  });
});

describe('parseDoc', () => {
  it('dispatches markdown sources to parseMarkdown', async () => {
    const result = await parseDoc(md('# Test'));
    const ast = result.ast as { type: string };
    expect(ast.type).toBe('root');
  });

  it('returns null ast for unsupported types', async () => {
    const source: DocSource = { path: 'test.rs', type: 'rustdoc', content: '' };
    const result = await parseDoc(source);
    expect(result.ast).toBeNull();
  });
});
