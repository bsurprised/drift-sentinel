import { readFile, readdir } from 'node:fs/promises';
import { join, relative, basename } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { ProjectContext, PackageJson, TsConfig, CargoToml, Pyproject } from '../types.js';
import { extractMakefileTargets } from './makefile.js';
import { getLogger } from '../util/logger.js';

const execFileAsync = promisify(execFile);

function stripJsonComments(content: string): string {
  let result = '';
  let i = 0;
  while (i < content.length) {
    // String literal — copy verbatim
    if (content[i] === '"') {
      result += '"';
      i++;
      while (i < content.length && content[i] !== '"') {
        if (content[i] === '\\') {
          result += content[i] + (content[i + 1] ?? '');
          i += 2;
        } else {
          result += content[i];
          i++;
        }
      }
      if (i < content.length) {
        result += '"';
        i++;
      }
    } else if (content[i] === '/' && content[i + 1] === '/') {
      // Line comment — skip to end of line
      while (i < content.length && content[i] !== '\n') i++;
    } else if (content[i] === '/' && content[i + 1] === '*') {
      // Block comment — skip to closing */
      i += 2;
      while (i < content.length && !(content[i] === '*' && content[i + 1] === '/')) i++;
      i += 2; // skip closing */
    } else {
      result += content[i];
      i++;
    }
  }
  return result;
}

/** Regex-extract name and version from a TOML [package] or [project] section. */
function extractTomlSection(
  content: string,
  sectionName: string,
): { name?: string; version?: string } {
  const sectionRe = new RegExp(
    `^\\[${sectionName}\\]\\s*$`,
    'm',
  );
  const sectionMatch = sectionRe.exec(content);
  if (!sectionMatch) return {};

  // Grab text from section header until the next top-level section or EOF
  const after = content.slice(sectionMatch.index + sectionMatch[0].length);
  const nextSection = after.search(/^\[/m);
  const block = nextSection === -1 ? after : after.slice(0, nextSection);

  const nameMatch = block.match(/^\s*name\s*=\s*"([^"]*)"/m);
  const versionMatch = block.match(/^\s*version\s*=\s*"([^"]*)"/m);

  return {
    name: nameMatch?.[1],
    version: versionMatch?.[1],
  };
}

/** Regex-extract [[bin]] entries from Cargo.toml. */
function extractCargoBinEntries(
  content: string,
): Array<{ name: string; path?: string }> {
  const entries: Array<{ name: string; path?: string }> = [];
  const binHeaderRe = /^\[\[bin\]\]\s*$/gm;
  let match: RegExpExecArray | null;

  while ((match = binHeaderRe.exec(content)) !== null) {
    const after = content.slice(match.index + match[0].length);
    const nextSection = after.search(/^\[/m);
    const block = nextSection === -1 ? after : after.slice(0, nextSection);

    const nameMatch = block.match(/^\s*name\s*=\s*"([^"]*)"/m);
    if (nameMatch) {
      const pathMatch = block.match(/^\s*path\s*=\s*"([^"]*)"/m);
      entries.push({ name: nameMatch[1], path: pathMatch?.[1] });
    }
  }
  return entries;
}

/** Recursively find .csproj files, skipping common excluded dirs. */
async function findCsprojFiles(root: string): Promise<string[]> {
  const results: string[] = [];
  const excluded = new Set([
    'node_modules', 'dist', 'bin', 'obj', '.git', 'target', '__pycache__',
  ]);

  async function walk(dir: string): Promise<void> {
    let entries: import('node:fs').Dirent[];
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (!excluded.has(entry.name)) {
          await walk(join(dir, entry.name));
        }
      } else if (entry.isFile() && entry.name.endsWith('.csproj')) {
        results.push(join(dir, entry.name));
      }
    }
  }

  await walk(root);
  return results;
}

async function tryReadFile(path: string): Promise<string | null> {
  try {
    return await readFile(path, 'utf-8');
  } catch {
    return null;
  }
}

async function buildBasenameMap(root: string): Promise<Map<string, string[]>> {
  try {
    const { stdout } = await execFileAsync('git', ['ls-files'], {
      cwd: root,
      maxBuffer: 10 * 1024 * 1024,
    });
    const map = new Map<string, string[]>();
    for (const line of stdout.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const base = basename(trimmed);
      const list = map.get(base) ?? [];
      list.push(trimmed);
      map.set(base, list);
    }
    return map;
  } catch {
    return new Map();
  }
}

function createFindFilesByBasename(root: string): (name: string) => Promise<string[]> {
  let cachePromise: Promise<Map<string, string[]>> | null = null;
  return async (name: string): Promise<string[]> => {
    if (!cachePromise) cachePromise = buildBasenameMap(root);
    const map = await cachePromise;
    return map.get(name) ?? [];
  };
}

export async function detectProjectContext(root: string): Promise<ProjectContext> {
  const log = getLogger();
  const ctx: ProjectContext = {
    root,
    makefileTargets: [],
    detectedLanguages: [],
    findFilesByBasename: createFindFilesByBasename(root),
  };

  // 1. package.json
  try {
    const raw = await tryReadFile(join(root, 'package.json'));
    if (raw !== null) {
      const pkg = JSON.parse(raw) as PackageJson;
      ctx.packageJson = pkg;
      ctx.detectedLanguages.push('javascript');

      const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
      if ('typescript' in allDeps) {
        ctx.detectedLanguages.push('typescript');
      }
    }
  } catch (err) {
    log.warn({ err }, 'Failed to parse package.json');
  }

  // 2. tsconfig.json
  try {
    const raw = await tryReadFile(join(root, 'tsconfig.json'));
    if (raw !== null) {
      const cleaned = stripJsonComments(raw);
      const parsed = JSON.parse(cleaned) as TsConfig;
      ctx.tsconfig = parsed;
      if (!ctx.detectedLanguages.includes('typescript')) {
        ctx.detectedLanguages.push('typescript');
      }
    }
  } catch (err) {
    log.warn({ err }, 'Failed to parse tsconfig.json');
  }

  // 3. Cargo.toml
  try {
    const raw = await tryReadFile(join(root, 'Cargo.toml'));
    if (raw !== null) {
      const pkg = extractTomlSection(raw, 'package');
      const bins = extractCargoBinEntries(raw);
      const cargo: CargoToml = {};
      if (pkg.name || pkg.version) {
        cargo.package = { name: pkg.name, version: pkg.version };
      }
      if (bins.length > 0) {
        cargo.bin = bins;
      }
      ctx.cargoToml = cargo;
      ctx.detectedLanguages.push('rust');
    }
  } catch (err) {
    log.warn({ err }, 'Failed to parse Cargo.toml');
  }

  // 4. pyproject.toml
  try {
    const raw = await tryReadFile(join(root, 'pyproject.toml'));
    if (raw !== null) {
      const proj = extractTomlSection(raw, 'project');
      const pyproject: Pyproject = {};
      if (proj.name || proj.version) {
        pyproject.project = { name: proj.name, version: proj.version };
      }
      ctx.pyproject = pyproject;
      ctx.detectedLanguages.push('python');
    }
  } catch (err) {
    log.warn({ err }, 'Failed to parse pyproject.toml');
  }

  // 5. .csproj files
  try {
    const csprojPaths = await findCsprojFiles(root);
    if (csprojPaths.length > 0) {
      ctx.csprojs = [];
      for (const csprojPath of csprojPaths) {
        const content = await tryReadFile(csprojPath);
        const rel = relative(root, csprojPath);
        const versionMatch = content?.match(/<Version>(.*?)<\/Version>/);
        ctx.csprojs.push({
          path: rel,
          version: versionMatch?.[1],
        });
      }
      ctx.detectedLanguages.push('dotnet');
    }
  } catch (err) {
    log.warn({ err }, 'Failed to detect .csproj files');
  }

  // 6. Makefile
  try {
    const raw = await tryReadFile(join(root, 'Makefile'));
    if (raw !== null) {
      ctx.makefileTargets = extractMakefileTargets(raw);
    }
  } catch (err) {
    log.warn({ err }, 'Failed to parse Makefile');
  }

  // 7. go.mod
  try {
    const goMod = await tryReadFile(join(root, 'go.mod'));
    if (goMod !== null) {
      ctx.detectedLanguages.push('go');
    }
  } catch (err) {
    log.warn({ err }, 'Failed to detect go.mod');
  }

  // 8. Deduplicate languages
  ctx.detectedLanguages = [...new Set(ctx.detectedLanguages)];

  log.info(
    { languages: ctx.detectedLanguages, root },
    'Project context detected',
  );

  return ctx;
}
