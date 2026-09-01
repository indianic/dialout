// Raw byte sequences for the mobile KeyChipBar (spec §12.2).
// Chips send these verbatim to the PTY via TerminalHandle.sendInput.

export interface KeyChip {
  id: string;
  label: string;
  /** Bytes sent when tapped. Absent for modifier/paste chips. */
  seq?: string;
  kind?: 'modifier-ctrl' | 'paste';
}

export const KEY_CHIPS: KeyChip[] = [
  { id: 'esc', label: 'Esc', seq: '\x1b' },
  { id: 'tab', label: 'Tab', seq: '\t' },
  { id: 'ctrl', label: 'Ctrl', kind: 'modifier-ctrl' },
  { id: 'up', label: '↑', seq: '\x1b[A' },
  { id: 'down', label: '↓', seq: '\x1b[B' },
  { id: 'left', label: '←', seq: '\x1b[D' },
  { id: 'right', label: '→', seq: '\x1b[C' },
  { id: 'pipe', label: '|', seq: '|' },
  { id: 'tilde', label: '~', seq: '~' },
  { id: 'slash', label: '/', seq: '/' },
  { id: 'dash', label: '-', seq: '-' },
  { id: 'home', label: 'Home', seq: '\x1b[H' },
  { id: 'end', label: 'End', seq: '\x1b[F' },
  { id: 'pgup', label: 'PgUp', seq: '\x1b[5~' },
  { id: 'pgdn', label: 'PgDn', seq: '\x1b[6~' },
  { id: 'ctrl-c', label: '^C', seq: '\x03' },
  { id: 'ctrl-d', label: '^D', seq: '\x04' },
  { id: 'ctrl-z', label: '^Z', seq: '\x1a' },
  { id: 'ctrl-r', label: '^R', seq: '\x12' },
  { id: 'ctrl-l', label: '^L', seq: '\x0c' },
  { id: 'paste', label: 'Paste', kind: 'paste' },
];

/** Ctrl+<letter> control byte, e.g. 'c' → 0x03. Returns null for non-letters. */
export function ctrlByte(ch: string): string | null {
  if (!ch) return null;
  const c = ch.toLowerCase().charCodeAt(0);
  if (c < 97 || c > 122) return null;
  return String.fromCharCode(c - 96);
}

// Which chips show by default in the KeyChipBar (user-overridable, persisted).
export const DEFAULT_ENABLED_KEYS: Record<string, boolean> = {
  esc: true, tab: true, ctrl: true,
  up: true, down: true, left: true, right: true,
  pipe: true, tilde: true, slash: true, dash: true,
  home: false, end: false, pgup: false, pgdn: false,
  'ctrl-c': true, 'ctrl-d': true, 'ctrl-z': true, 'ctrl-r': true, 'ctrl-l': true,
  paste: true,
};
