import { mkdir, writeFile, access } from 'node:fs/promises';
import path from 'node:path';

const HOOK_CONTENT = `#!/usr/bin/env bash
# Installed by drift-sentinel
drift audit --since origin/HEAD --max-severity=high
`;

export async function installPrePushHook(root: string): Promise<void> {
  const gitDir = path.join(root, '.git');
  try {
    await access(gitDir);
  } catch {
    throw new Error('Not a git repository');
  }

  const hooksDir = path.join(gitDir, 'hooks');
  await mkdir(hooksDir, { recursive: true });

  const hookPath = path.join(hooksDir, 'pre-push');
  await writeFile(hookPath, HOOK_CONTENT, { mode: 0o755 });
  console.log(`Pre-push hook installed at ${hookPath}`);
}
