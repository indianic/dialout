// A tool's colour says what it DID, not which vendor produced it. Reading a
// twenty-step run should show its shape without reading a word.

export type ToolClass = 'read' | 'search' | 'run' | 'write' | 'failure' | 'other';

export interface ToolAppearance {
  cls: ToolClass;
  glyph: string;
  colorVar: string; // a CSS custom property name, never a literal
}

const BY_NAME: Record<string, ToolClass> = {
  read: 'read', glob: 'read', ls: 'read', notebookread: 'read',
  grep: 'search', websearch: 'search', webfetch: 'search',
  bash: 'run', task: 'run', agent: 'run',
  edit: 'write', write: 'write', multiedit: 'write', notebookedit: 'write',
};

const GLYPH: Record<ToolClass, string> = {
  read: '◇', search: '⌕', run: '▸', write: '✎', failure: '✕', other: '·',
};

const COLOR: Record<ToolClass, string> = {
  read: '--accent',
  search: '--tool-search',
  run: '--tool-run',
  write: '--static',
  failure: '--offline',
  other: '--dim',
};

export function toolClass(name: string): ToolClass {
  return BY_NAME[String(name || '').trim().toLowerCase()] ?? 'other';
}

export function toolAppearance(name: string, ok = true): ToolAppearance {
  const cls: ToolClass = ok ? toolClass(name) : 'failure';
  return { cls, glyph: GLYPH[cls], colorVar: COLOR[cls] };
}
