import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { SymbolResolver, ProjectContext, DocReference, ResolveResult } from '../types.js';

const execFileAsync = promisify(execFile);

export class GrepResolver implements SymbolResolver {
  language = 'grep' as const;
  private root = '';

  canHandle(project: ProjectContext): boolean {
    this.root = project.root;
    return true;
  }

  async resolve(symbol: string, _context: DocReference): Promise<ResolveResult> {
    // Strip trailing parens and take last part for member lookups
    const cleaned = symbol.replace(/\(\)$/, '');
    const searchTerm = cleaned.includes('.') ? cleaned.split('.').pop()! : cleaned;

    const { rgPath } = await import('@vscode/ripgrep');

    try {
      const { stdout } = await execFileAsync(rgPath, [
        '--word-regexp',
        '--line-number',
        '--no-heading',
        '--color', 'never',
        '--glob', '!node_modules',
        '--glob', '!dist',
        '--glob', '!build',
        '--glob', '!.git',
        '--glob', '!*.md',
        searchTerm,
        this.root,
      ]);

      const locations = stdout
        .split('\n')
        .filter(Boolean)
        .map((line) => parseRgLine(line))
        .filter((loc): loc is { file: string; line: number; column: number } => loc !== null);

      return { found: locations.length > 0, locations, deprecated: false };
    } catch (err: unknown) {
      // ripgrep exits with code 1 when no matches found
      if (isExecError(err) && err.code === 1) {
        return { found: false, locations: [], deprecated: false };
      }
      throw err;
    }
  }
}

function isExecError(err: unknown): err is Error & { code: number } {
  return err instanceof Error && 'code' in err;
}

/** Parse a ripgrep output line, handling Windows drive-letter paths (e.g. C:\...). */
function parseRgLine(line: string): { file: string; line: number; column: number } | null {
  // Match   <path>:<lineNum>:<content>
  // Windows paths start with a drive letter like C:\, so skip index 0-1 when looking for ':'
  const searchStart = /^[A-Za-z]:/.test(line) ? 2 : 0;
  const pathEnd = line.indexOf(':', searchStart);
  if (pathEnd === -1) return null;
  const lineEnd = line.indexOf(':', pathEnd + 1);
  if (lineEnd === -1) return null;

  const file = line.slice(0, pathEnd);
  const lineNum = parseInt(line.slice(pathEnd + 1, lineEnd), 10);
  if (isNaN(lineNum)) return null;

  return { file, line: lineNum, column: 1 };
}
