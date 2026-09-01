const test = require('node:test');
const assert = require('node:assert');
const {
  clampCursor, moveCursor, toggleAt, toggleAll, selectedTokens, renderChecklist,
} = require('../dist/checklist');

function mk() {
  return {
    items: [
      { label: 'Hyper', token: 'Hyper', hint: 'this terminal', checked: false },
      { label: 'iTerm', token: 'iTerm.app', checked: false },
      { label: 'VS Code', token: 'vscode', hint: 'not installed', checked: true },
    ],
    cursor: 0,
  };
}

test('clampCursor bounds to [0, len-1] and handles empty', () => {
  assert.strictEqual(clampCursor(3, -1), 0);
  assert.strictEqual(clampCursor(3, 5), 2);
  assert.strictEqual(clampCursor(3, 1), 1);
  assert.strictEqual(clampCursor(0, 2), 0);
});

test('moveCursor clamps at both ends', () => {
  const s = mk();
  assert.strictEqual(moveCursor(s, -1).cursor, 0);
  assert.strictEqual(moveCursor(s, 1).cursor, 1);
  assert.strictEqual(moveCursor({ ...s, cursor: 2 }, 1).cursor, 2);
});

test('toggleAt flips the cursor row by default', () => {
  const s = mk();
  const t = toggleAt(s);
  assert.strictEqual(t.items[0].checked, true);
  assert.strictEqual(s.items[0].checked, false, 'original state not mutated');
});

test('toggleAt flips a specific index and no-ops out of range', () => {
  const s = mk();
  assert.strictEqual(toggleAt(s, 1).items[1].checked, true);
  assert.deepStrictEqual(toggleAt(s, 9).items, s.items);
});

test('toggleAll checks all when not all checked, else unchecks all', () => {
  const s = mk(); // mixed → all checked
  assert.ok(toggleAll(s).items.every((i) => i.checked));
  const allOn = { items: mk().items.map((i) => ({ ...i, checked: true })), cursor: 0 };
  assert.ok(toggleAll(allOn).items.every((i) => !i.checked));
});

test('selectedTokens returns checked tokens in order', () => {
  const s = { items: mk().items.map((i, idx) => ({ ...i, checked: idx !== 1 })), cursor: 0 };
  assert.deepStrictEqual(selectedTokens(s), ['Hyper', 'vscode']);
});

test('renderChecklist marks cursor row and check state and hints', () => {
  const s = { ...mk(), cursor: 1 };
  const lines = renderChecklist(s).split('\n');
  assert.match(lines[0], /^\s{2}\[ \] Hyper {2}\(this terminal\)$/);
  assert.match(lines[1], /^› \[ \] iTerm$/);
  assert.match(lines[2], /^\s{2}\[x\] VS Code {2}\(not installed\)$/);
});
