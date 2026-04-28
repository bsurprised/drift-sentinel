import path from 'node:path';

export function toRelativePosix(absPath: string, root: string): string {
  if (!path.isAbsolute(absPath)) {
    // Already relative — just normalise separators
    return absPath.split(path.sep).join('/');
  }
  const rel = path.relative(root, absPath);
  return rel.split(path.sep).join('/');
}

// RFC3986 path encoding (encodes each segment but preserves '/')
export function toRelativeUri(absPath: string, root: string): string {
  return toRelativePosix(absPath, root)
    .split('/')
    .map(seg => encodeURIComponent(seg))
    .join('/');
}
