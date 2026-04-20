import { describe, it, expect } from 'vitest';
import { extractReferences } from '../../src/extractor/index.js';
import { parseMarkdown } from '../../src/parsers/markdown.js';
import type { DocSource, DocReference } from '../../src/types.js';

async function extract(content: string, path = 'test.md'): Promise<DocReference[]> {
  const source: DocSource = { path, type: 'markdown', content };
  const parsed = await parseMarkdown(source);
  return extractReferences(parsed);
}

function byKind(refs: DocReference[], kind: DocReference['kind']): DocReference[] {
  return refs.filter((r) => r.kind === kind);
}

describe('extractReferences', () => {
  // ---- link-external ----
  it('extracts link-external from markdown links', async () => {
    const refs = await extract('[link](https://example.com)');
    const ext = byKind(refs, 'link-external');
    expect(ext).toHaveLength(1);
    expect(ext[0].target).toBe('https://example.com');
    expect(ext[0].context).toBe('link');
  });

  it('extracts http links as link-external', async () => {
    const refs = await extract('[docs](http://docs.example.com)');
    const ext = byKind(refs, 'link-external');
    expect(ext).toHaveLength(1);
    expect(ext[0].target).toBe('http://docs.example.com');
  });

  // ---- link-file ----
  it('extracts link-file from relative paths', async () => {
    const refs = await extract('[guide](./docs/guide.md)');
    const file = byKind(refs, 'link-file');
    expect(file).toHaveLength(1);
    expect(file[0].target).toBe('./docs/guide.md');
    expect(file[0].context).toBe('guide');
  });

  it('extracts link-file with anchor', async () => {
    const refs = await extract('[api](./api.md#users)');
    const file = byKind(refs, 'link-file');
    expect(file).toHaveLength(1);
    expect(file[0].target).toBe('./api.md#users');
  });

  it('ignores fragment-only links', async () => {
    const refs = await extract('[section](#overview)');
    const file = byKind(refs, 'link-file');
    expect(file).toHaveLength(0);
  });

  // ---- symbol ----
  it('extracts symbol from dot-notation inline code', async () => {
    const refs = await extract('Use `UserService.createUser()` to create.');
    const syms = byKind(refs, 'symbol');
    expect(syms).toHaveLength(1);
    expect(syms[0].target).toBe('UserService.createUser');
  });

  it('extracts symbol from chained dot notation', async () => {
    const refs = await extract('See `Config.database.host` for config.');
    const syms = byKind(refs, 'symbol');
    expect(syms).toHaveLength(1);
    expect(syms[0].target).toBe('Config.database.host');
  });

  it('extracts symbol from function call pattern', async () => {
    const refs = await extract('Call `createUser()` first.');
    const syms = byKind(refs, 'symbol');
    expect(syms).toHaveLength(1);
    expect(syms[0].target).toBe('createUser');
  });

  // ---- code-block ----
  it('extracts code-block with language tag', async () => {
    const refs = await extract('```typescript\nconst x = 1;\n```');
    const blocks = byKind(refs, 'code-block');
    expect(blocks).toHaveLength(1);
    expect(blocks[0].language).toBe('typescript');
    expect(blocks[0].target).toBe('const x = 1;');
    expect(blocks[0].context).toBe('typescript');
  });

  // ---- cli-command from bash block ----
  it('extracts cli-command from bash code block', async () => {
    const refs = await extract('```bash\n$ npm run build\n```');
    const cmds = byKind(refs, 'cli-command');
    expect(cmds).toHaveLength(1);
    expect(cmds[0].target).toBe('npm run build');
  });

  it('extracts multiple commands from shell block', async () => {
    const refs = await extract('```sh\n$ npm install\n$ npm test\n```');
    const cmds = byKind(refs, 'cli-command');
    expect(cmds).toHaveLength(2);
    expect(cmds[0].target).toBe('npm install');
    expect(cmds[1].target).toBe('npm test');
  });

  it('skips comment lines in shell blocks', async () => {
    const refs = await extract('```bash\n# this is a comment\n$ echo hello\n```');
    const cmds = byKind(refs, 'cli-command');
    expect(cmds).toHaveLength(1);
    expect(cmds[0].target).toBe('echo hello');
  });

  // ---- cli-command from inline code ----
  it('extracts cli-command from inline code with npm prefix', async () => {
    const refs = await extract('Run `npm start` to begin.');
    const cmds = byKind(refs, 'cli-command');
    expect(cmds).toHaveLength(1);
    expect(cmds[0].target).toBe('npm start');
  });

  it('extracts cli-command from inline code with $ prefix', async () => {
    const refs = await extract('Run `$ cargo build` to compile.');
    const cmds = byKind(refs, 'cli-command');
    expect(cmds).toHaveLength(1);
    expect(cmds[0].target).toBe('cargo build');
  });

  // ---- version-ref ----
  it('extracts version-ref from badge URL in image', async () => {
    const refs = await extract('![badge](https://img.shields.io/badge/version-1.2.3-blue)');
    const vers = byKind(refs, 'version-ref');
    expect(vers).toHaveLength(1);
    expect(vers[0].target).toBe('1.2.3');
  });

  it('extracts version-ref from inline code', async () => {
    const refs = await extract('Current version is `v1.2.3`.');
    const vers = byKind(refs, 'version-ref');
    expect(vers).toHaveLength(1);
    expect(vers[0].target).toBe('1.2.3');
  });

  it('extracts version-ref from text node', async () => {
    const refs = await extract('This is version 2.0.0 of the API.');
    const vers = byKind(refs, 'version-ref');
    expect(vers).toHaveLength(1);
    expect(vers[0].target).toBe('2.0.0');
  });

  // ---- no false positives ----
  it('classifies file-like inline code as link-file, not symbol', async () => {
    const refs = await extract('See `DRIFT_REPORT.md` for details.');
    const syms = byKind(refs, 'symbol');
    const files = byKind(refs, 'link-file');
    expect(syms).toHaveLength(0);
    expect(files).toHaveLength(1);
    expect(files[0].target).toBe('DRIFT_REPORT.md');
  });

  it('classifies path-like inline code as link-file', async () => {
    const refs = await extract('Edit `./src/index.ts` to start.');
    const syms = byKind(refs, 'symbol');
    const files = byKind(refs, 'link-file');
    expect(syms).toHaveLength(0);
    expect(files).toHaveLength(1);
    expect(files[0].target).toBe('./src/index.ts');
  });

  it('does not extract regular inline code as symbol', async () => {
    const refs = await extract('Use `const x = 1` in your code.');
    const syms = byKind(refs, 'symbol');
    expect(syms).toHaveLength(0);
  });

  it('does not extract plain words as symbol', async () => {
    const refs = await extract('The `database` config is important.');
    const syms = byKind(refs, 'symbol');
    expect(syms).toHaveLength(0);
  });

  // ---- multiple references ----
  it('extracts multiple reference kinds from one doc', async () => {
    const content = [
      '# Getting Started',
      '',
      '[Home](https://example.com)',
      '',
      'See `UserService.create()` and [guide](./guide.md).',
      '',
      '```typescript',
      'const x = 1;',
      '```',
      '',
      '```bash',
      '$ npm install',
      '```',
    ].join('\n');

    const refs = await extract(content);
    const kinds = new Set(refs.map((r) => r.kind));
    expect(kinds.has('link-external')).toBe(true);
    expect(kinds.has('link-file')).toBe(true);
    expect(kinds.has('symbol')).toBe(true);
    expect(kinds.has('code-block')).toBe(true);
    expect(kinds.has('cli-command')).toBe(true);
  });

  // ---- position tracking ----
  it('tracks correct line numbers', async () => {
    const content = 'line1\n\n[link](https://example.com)\n';
    const refs = await extract(content);
    const ext = byKind(refs, 'link-external');
    expect(ext).toHaveLength(1);
    expect(ext[0].source.line).toBe(3);
  });

  // ---- ID format ----
  it('generates deterministic IDs', async () => {
    const refs = await extract('[link](https://example.com)', 'readme.md');
    expect(refs[0].id).toMatch(/^readme\.md:\d+:link-external:[a-f0-9]{8}$/);
  });

  it('returns empty array for non-markdown types', () => {
    const refs = extractReferences({
      source: { path: 'test.rs', type: 'rustdoc', content: '' },
      ast: null,
    });
    expect(refs).toEqual([]);
  });

  it('returns empty array when ast is null', () => {
    const refs = extractReferences({
      source: { path: 'test.md', type: 'markdown', content: '' },
      ast: null,
    });
    expect(refs).toEqual([]);
  });
});
