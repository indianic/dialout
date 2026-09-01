// Pure state + rendering for the interactive terminal-app multi-select used by
// `setup-cowork`. All functions are immutable (return new state) so the
// raw-mode driver in cli.ts stays a thin keypress→state→redraw loop.

export interface ChecklistItem {
  /** Display name, e.g. "Hyper". */
  label: string;
  /** Canonical token stored in config and matched at runtime. */
  token: string;
  /** Optional parenthetical, e.g. "not installed" / "this terminal". */
  hint?: string;
  checked: boolean;
}

export interface ChecklistState {
  items: ChecklistItem[];
  cursor: number;
}

export function clampCursor(len: number, cursor: number): number {
  if (len <= 0) return 0;
  if (cursor < 0) return 0;
  if (cursor > len - 1) return len - 1;
  return cursor;
}

export function moveCursor(state: ChecklistState, delta: number): ChecklistState {
  return { ...state, cursor: clampCursor(state.items.length, state.cursor + delta) };
}

export function toggleAt(state: ChecklistState, index?: number): ChecklistState {
  const i = index ?? state.cursor;
  if (i < 0 || i >= state.items.length) return state;
  const items = state.items.map((it, idx) => (idx === i ? { ...it, checked: !it.checked } : it));
  return { ...state, items };
}

export function toggleAll(state: ChecklistState): ChecklistState {
  const allChecked = state.items.length > 0 && state.items.every((it) => it.checked);
  const items = state.items.map((it) => ({ ...it, checked: !allChecked }));
  return { ...state, items };
}

export function selectedTokens(state: ChecklistState): string[] {
  return state.items.filter((it) => it.checked).map((it) => it.token);
}

// One line per item: '› ' marks the cursor row (two spaces otherwise), then
// '[x]'/'[ ]', the label, and an optional '(hint)'.
export function renderChecklist(state: ChecklistState): string {
  return state.items
    .map((it, i) => {
      const pointer = i === state.cursor ? '›' : ' ';
      const box = it.checked ? '[x]' : '[ ]';
      const hint = it.hint ? `  (${it.hint})` : '';
      return `${pointer} ${box} ${it.label}${hint}`;
    })
    .join('\n');
}
