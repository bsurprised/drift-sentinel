import { readFile, stat } from 'node:fs/promises';
import { join, resolve, extname } from 'node:path';
import { globby } from 'globby';
import { getLogger } from '../util/logger.js';
import type { DocSource } from '../types.js';

export interface DiscoverOptions {
  root: string;
  include: string[];
  exclude: string[];
  ignorePaths: string[];
}

const MAX_FILE_SIZE = 1_048_576; // 1 MB

type DocType = DocSource['type'];

function classifyFile(filePath: string): DocType | null {
  const ext = extname(filePath).toLowerCase();
  switch (ext) {
    case '.md':
    case '.mdx':
      return 'markdown';
    default:
      return null;
  }
}

export async function discoverDocs(options: DiscoverOptions): Promise<DocSource[]> {
  const logger = getLogger();
  const root = resolve(options.root);

  // Verify root exists
  try {
    const rootStat = await stat(root);
    if (!rootStat.isDirectory()) {
      throw new Error(`Root path is not a directory: ${root}`);
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(`Root path does not exist: ${root}`);
    }
    throw err;
  }

  const paths = await globby(options.include, {
    cwd: root,
    ignore: [...options.exclude, ...options.ignorePaths],
    gitignore: true,
    absolute: false,
    dot: false,
  });

  const sources: DocSource[] = [];
  const typeCounts = new Map<string, number>();

  for (const relPath of paths) {
    const absPath = join(root, relPath);
    const docType = classifyFile(absPath);
    if (docType === null) {
      continue;
    }

    let content: string;
    try {
      const fileStat = await stat(absPath);
      if (fileStat.size > MAX_FILE_SIZE) {
        logger.warn({ path: absPath, size: fileStat.size }, 'File exceeds 1MB, truncating content');
      }

      const raw = await readFile(absPath, 'utf-8');
      content = fileStat.size > MAX_FILE_SIZE ? raw.slice(0, MAX_FILE_SIZE) : raw;
    } catch (err) {
      logger.warn({ path: absPath, error: (err as Error).message }, 'Failed to read file, skipping');
      continue;
    }

    sources.push({ path: absPath, type: docType, content });
    typeCounts.set(docType, (typeCounts.get(docType) ?? 0) + 1);
  }

  sources.sort((a, b) => a.path.localeCompare(b.path));

  logger.info(
    { total: sources.length, types: Object.fromEntries(typeCounts) },
    'Discovery complete',
  );

  return sources;
}

