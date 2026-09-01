import * as fs from 'fs';
import * as path from 'path';

export interface DirEntry {
  name: string;
  type: 'directory' | 'file';
}

export function listDirectory(dirPath: string): DirEntry[] {
  const resolvedPath = path.resolve(dirPath);

  if (!fs.existsSync(resolvedPath)) {
    return [];
  }

  const stat = fs.statSync(resolvedPath);
  if (!stat.isDirectory()) {
    return [];
  }

  const entries = fs.readdirSync(resolvedPath, { withFileTypes: true });

  return entries
    .filter((entry) => !entry.name.startsWith('.'))
    .map((entry) => ({
      name: entry.name,
      type: entry.isDirectory() ? 'directory' as const : 'file' as const,
    }))
    .sort((a, b) => {
      if (a.type === b.type) return a.name.localeCompare(b.name);
      return a.type === 'directory' ? -1 : 1;
    });
}
