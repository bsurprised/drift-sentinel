import fs from 'node:fs/promises';
import path from 'node:path';

const TEMPLATE_MJS = `// drift-sentinel config — see https://github.com/bsurprised/drift-sentinel
/** @type {import('drift-sentinel').DriftConfig} */
export default {
  ignorePaths: ['node_modules/**', 'dist/**', 'coverage/**'],
  // include: ['**/*.md'],
  // kinds: ['missing-symbol', 'dead-file-ref'],
  // writeReport: true,
};
`;

export async function runInit(root: string, force: boolean): Promise<void> {
  const target = path.join(root, 'drift.config.mjs');
  try {
    await fs.access(target);
    // File exists — only allowed when --force
    if (!force) {
      throw new Error(`${target} already exists. Use --force to overwrite.`);
    }
  } catch (err) {
    // ENOENT means file does not exist — that's the happy path
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT' && !force) throw err;
  }
  await fs.writeFile(target, TEMPLATE_MJS);
  console.log(`Wrote ${target}`);
}
