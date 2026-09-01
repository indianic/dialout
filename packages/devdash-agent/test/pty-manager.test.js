const test = require('node:test');
const assert = require('node:assert');
const { copyVerb, clipboardCommand, clipboardBindings } = require('../dist/pty-manager');

// Regression: 2.3.5 switched the mouse copy verb to the -no-clear variant so the
// selection would stay highlighted after a drag. In tmux that flag does not just
// keep the highlight — it also does NOT exit copy-mode. Every drag-select left
// the user stranded in copy-mode, where keystrokes are copy-mode commands and
// paste never reaches the shell. Measured directly:
//
//   copy-pipe-and-cancel pbcopy -> #{pane_in_mode} = 0   (back at the shell)
//   copy-pipe-no-clear   pbcopy -> #{pane_in_mode} = 1   (stuck)
//
// The copy verb must always return control to the shell.

test('copy verb exits copy-mode so the shell keeps taking input', () => {
  const verb = copyVerb()[0];
  assert.ok(
    verb.endsWith('-and-cancel'),
    `copy verb must end copy-mode, got "${verb}". A -no-clear/-no-cancel variant strands the user in copy-mode.`
  );
});

test('copy verb never uses a no-clear variant', () => {
  const verb = copyVerb()[0];
  assert.ok(!verb.includes('no-clear'), `"${verb}" keeps the pane in copy-mode — see 2.3.5 regression`);
});

test('macOS pipes the copy through pbcopy; other platforms fall back with no clipboard tool installed', () => {
  if (process.platform === 'darwin') {
    // pbcopy reaches the pasteboard of the machine the agent runs on, and covers
    // Apple Terminal, which has no OSC 52 at all.
    assert.deepStrictEqual(copyVerb(), ['copy-pipe-and-cancel', 'pbcopy']);
  } else {
    // hasCommand is injected (rather than relying on the CI box's actual
    // installed tools) so this assertion is deterministic everywhere.
    assert.deepStrictEqual(copyVerb({ hasCommand: () => false }), ['copy-selection-and-cancel']);
  }
});

// --- copyVerb: injectable platform + hasCommand deps ---

test('copyVerb returns the pbcopy pipe when platform is injected as darwin, regardless of hasCommand', () => {
  const verb = copyVerb({ platform: 'darwin', hasCommand: () => false });
  assert.deepStrictEqual(verb, ['copy-pipe-and-cancel', 'pbcopy']);
});

test('copyVerb picks wl-copy when present on linux', () => {
  const verb = copyVerb({ platform: 'linux', hasCommand: (bin) => bin === 'wl-copy' });
  assert.deepStrictEqual(verb, ['copy-pipe-and-cancel', 'wl-copy']);
});

test('copyVerb falls back to xclip when wl-copy is absent', () => {
  const verb = copyVerb({ platform: 'linux', hasCommand: (bin) => bin === 'xclip' });
  // Must stay ONE array element: tmux's `send-keys -X copy-pipe-and-cancel`
  // only accepts a single following argument (verified against tmux 3.7b —
  // extra argv positions are misparsed as a second command reference and
  // the copy silently never fires). The single string is run through the
  // pane's shell, which word-splits it back into "xclip -selection clipboard".
  assert.deepStrictEqual(verb, ['copy-pipe-and-cancel', 'xclip -selection clipboard']);
});

test('copyVerb falls back to xsel when only xsel is present', () => {
  const verb = copyVerb({ platform: 'linux', hasCommand: (bin) => bin === 'xsel' });
  assert.deepStrictEqual(verb, ['copy-pipe-and-cancel', 'xsel --clipboard --input']);
});

test('copyVerb prefers wl-copy over xclip when both are present', () => {
  const verb = copyVerb({ platform: 'linux', hasCommand: (bin) => bin === 'wl-copy' || bin === 'xclip' });
  assert.deepStrictEqual(verb, ['copy-pipe-and-cancel', 'wl-copy']);
});

test('copyVerb falls back to copy-selection-and-cancel when no linux clipboard tool is installed', () => {
  const verb = copyVerb({ platform: 'linux', hasCommand: () => false });
  assert.deepStrictEqual(verb, ['copy-selection-and-cancel']);
});

// --- Resume: exact session-name matching ---
//
// A browser session resumes by name (dd-<sessionId>), so the existence check
// decides between "attach to the user's running work" and "create a second
// session". tmux's own `has-session -t <name>` is NOT safe here: its target
// resolution falls back to prefix and fnmatch matching, so a lookup for
// dd-abc succeeds against an unrelated dd-abcdef and the browser would attach
// to someone else's shell. These lock the exact-match contract.

const { tmuxSessionExists } = require('../dist/pty-manager');

test('an existing session is found by exact name', () => {
  const list = () => 'dd-abc\ndd-xyz\nwork\n';
  assert.strictEqual(tmuxSessionExists('dd-abc', { list }), true);
});

test('a longer session sharing the prefix is NOT a match', () => {
  // The `tmux has-session` trap: prefix matching would report true here and
  // attach the browser to an unrelated session.
  const list = () => 'dd-abcdef\n';
  assert.strictEqual(tmuxSessionExists('dd-abc', { list }), false);
});

test('a glob-looking name matches only itself', () => {
  // fnmatch fallback would let 'dd-a*' match 'dd-abc'.
  const list = () => 'dd-abc\n';
  assert.strictEqual(tmuxSessionExists('dd-a*', { list }), false);
});

test('no tmux server means no session, not a crash', () => {
  const list = () => { throw new Error('no server running on /tmp/tmux-501/default'); };
  assert.strictEqual(tmuxSessionExists('dd-abc', { list }), false);
});

test('trailing whitespace in tmux output does not defeat the match', () => {
  const list = () => 'dd-abc \n';
  assert.strictEqual(tmuxSessionExists('dd-abc', { list }), true);
});

// --- copy-command: the un-argumented copy path (double-click / triple-click) ---
//
// tmux's OWN DoubleClick1Pane and TripleClick1Pane defaults run
// `send-keys -X copy-pipe-and-cancel` with NO argument. We deliberately do not
// rebind them (their if-shell guards are why vim/less still work), so the only
// way those copies reach the system clipboard is the `copy-command` server
// option. It was never set, so a double-clicked word landed in the tmux paste
// buffer and an OSC 52 escape only — and xterm.js does not act on OSC 52.
// Measured on tmux 3.6a / macOS before the fix: pasteboard unchanged.

test('clipboardCommand and copyVerb agree on the tool, on every platform', () => {
  const cases = [
    { deps: { platform: 'darwin', hasCommand: () => false }, expected: 'pbcopy' },
    { deps: { platform: 'linux', hasCommand: (b) => b === 'wl-copy' }, expected: 'wl-copy' },
    { deps: { platform: 'linux', hasCommand: (b) => b === 'xclip' }, expected: 'xclip -selection clipboard' },
    { deps: { platform: 'linux', hasCommand: (b) => b === 'xsel' }, expected: 'xsel --clipboard --input' },
  ];
  for (const { deps, expected } of cases) {
    assert.strictEqual(clipboardCommand(deps), expected);
    // The bind verb must pipe through the SAME command copy-command gets;
    // a divergence is what silently routed macOS copies through xclip once.
    assert.deepStrictEqual(copyVerb(deps), ['copy-pipe-and-cancel', expected]);
  }
});

test('clipboardCommand returns null when no clipboard tool exists, and copyVerb degrades', () => {
  const deps = { platform: 'linux', hasCommand: () => false };
  assert.strictEqual(clipboardCommand(deps), null);
  assert.deepStrictEqual(copyVerb(deps), ['copy-selection-and-cancel']);
});

test('clipboardBindings sets copy-command so un-argumented copies reach the clipboard', () => {
  const cmds = clipboardBindings();
  const copyCommand = cmds.filter((c) => c[0] === 'set-option' && c[2] === 'copy-command');
  const expected = clipboardCommand();

  if (expected === null) {
    assert.strictEqual(copyCommand.length, 0, 'no tool installed: nothing to point copy-command at');
    return;
  }
  assert.strictEqual(copyCommand.length, 1, 'exactly one copy-command, never a duplicate that could flip-flop');
  assert.deepStrictEqual(copyCommand[0], ['set-option', '-g', 'copy-command', expected]);
});

test('clipboardBindings still emits all four explicit copy bindings', () => {
  const binds = clipboardBindings().filter((c) => c[0] === 'bind-key');
  assert.strictEqual(binds.length, 4);
  // Every one must use an -and-cancel verb: -no-clear strands the pane in
  // copy-mode, where paste never reaches the shell (see copyVerb's note).
  for (const b of binds) {
    const verb = b[b.indexOf('-X') + 1];
    assert.match(verb, /-and-cancel$/, `binding verb must cancel copy-mode: ${verb}`);
  }
});

test('copy-command and the drag binding route through the identical command', () => {
  const cmds = clipboardBindings();
  const copyCommand = cmds.find((c) => c[0] === 'set-option' && c[2] === 'copy-command');
  const drag = cmds.find((c) => c[0] === 'bind-key' && c.includes('MouseDragEnd1Pane'));
  if (!copyCommand) return; // no clipboard tool on this machine
  assert.strictEqual(copyCommand[3], drag[drag.length - 1]);
});
