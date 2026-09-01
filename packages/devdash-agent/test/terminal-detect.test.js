const test = require('node:test');
const assert = require('node:assert');
const { detectTerminals, currentTerminalToken } = require('../dist/terminal-detect');

// --- currentTerminalToken ---

test('currentTerminalToken reads TERM_PROGRAM', () => {
  assert.strictEqual(currentTerminalToken({ TERM_PROGRAM: 'Hyper' }), 'Hyper');
  assert.strictEqual(currentTerminalToken({ TERM_PROGRAM: 'iTerm.app' }), 'iTerm.app');
});

test('currentTerminalToken falls back to marker env when TERM_PROGRAM empty', () => {
  assert.strictEqual(currentTerminalToken({ KITTY_WINDOW_ID: '3' }), 'kitty');
  assert.strictEqual(currentTerminalToken({ ALACRITTY_WINDOW_ID: '1' }), 'alacritty');
  assert.strictEqual(currentTerminalToken({ WEZTERM_PANE: '0' }), 'WezTerm');
});

test('currentTerminalToken returns "" inside tmux', () => {
  assert.strictEqual(currentTerminalToken({ TERM_PROGRAM: 'tmux' }), '');
  assert.strictEqual(currentTerminalToken({ TMUX: '/tmp/tmux-501/default,123,0', TERM_PROGRAM: 'Hyper' }), '');
});

test('currentTerminalToken returns "" when nothing is known', () => {
  assert.strictEqual(currentTerminalToken({}), '');
});

test('currentTerminalToken resolves Konsole via the shared ENV_MARKERS table', () => {
  assert.strictEqual(currentTerminalToken({ KONSOLE_VERSION: '22.04.0' }), 'konsole');
});

test('currentTerminalToken resolves GNOME Terminal via the shared ENV_MARKERS table', () => {
  assert.strictEqual(
    currentTerminalToken({ GNOME_TERMINAL_SCREEN: '/org/gnome/Terminal/screen/abc' }),
    'gnome-terminal'
  );
});

test('currentTerminalToken falls back to the /proc walk on linux when env yields nothing', () => {
  const token = currentTerminalToken(
    {},
    {
      platform: 'linux',
      ppid: 4242,
      procDeps: { readComm: () => 'xfce4-terminal', readPPid: () => 1 },
    }
  );
  assert.strictEqual(token, 'xfce4-terminal');
});

test('currentTerminalToken does NOT consult the /proc fallback on darwin', () => {
  const token = currentTerminalToken(
    {},
    {
      platform: 'darwin',
      ppid: 4242,
      procDeps: {
        readComm: () => {
          throw new Error('/proc must not be consulted on darwin');
        },
      },
    }
  );
  assert.strictEqual(token, '');
});

// --- the generic "vte" token is PROVISIONAL, not final (finding I1) ---

test('currentTerminalToken prefers a /proc match over the provisional generic vte token', () => {
  // xfce4-terminal is VTE-based: it exports VTE_VERSION *and* is in PROC_NAMES.
  // The generic vte catch-all must not end resolution before the walk runs.
  const token = currentTerminalToken(
    { VTE_VERSION: '6003' },
    {
      platform: 'linux',
      ppid: 4242,
      procDeps: {
        readComm: (pid) => (pid === 4242 ? 'bash' : 'xfce4-terminal'),
        readPPid: () => 4243,
      },
    }
  );
  assert.strictEqual(token, 'xfce4-terminal');
});

test('currentTerminalToken keeps the generic vte token when the /proc walk finds nothing', () => {
  const token = currentTerminalToken(
    { VTE_VERSION: '6003' },
    {
      platform: 'linux',
      ppid: 4242,
      procDeps: { readComm: () => 'some-vte-term', readPPid: () => 1 },
    }
  );
  assert.strictEqual(token, 'vte');
});

test('currentTerminalToken does not consult /proc for the vte token on darwin', () => {
  const token = currentTerminalToken(
    { VTE_VERSION: '6003' },
    {
      platform: 'darwin',
      ppid: 4242,
      procDeps: {
        readComm: () => {
          throw new Error('/proc must not be consulted on darwin');
        },
      },
    }
  );
  assert.strictEqual(token, 'vte');
});

test('a specific env marker is still final: tilix beats an xterm proc chain', () => {
  const token = currentTerminalToken(
    { TILIX_ID: 'abc', VTE_VERSION: '7002' },
    {
      platform: 'linux',
      ppid: 4242,
      procDeps: { readComm: () => 'xterm', readPPid: () => 1 },
    }
  );
  assert.strictEqual(token, 'tilix');
});

// --- detectTerminals ---

test('detectTerminals flags an installed macOS bundle', () => {
  const rows = detectTerminals({
    platform: 'darwin',
    env: {},
    appExists: (b) => b === 'iTerm.app',
  });
  const iterm = rows.find((r) => r.token === 'iTerm.app');
  assert.ok(iterm, 'iTerm row present');
  assert.strictEqual(iterm.installed, true);
  const hyper = rows.find((r) => r.token === 'Hyper');
  assert.strictEqual(hyper.installed, false);
});

test('detectTerminals marks the current terminal', () => {
  const rows = detectTerminals({
    platform: 'darwin',
    env: { TERM_PROGRAM: 'Hyper' },
    appExists: () => true,
  });
  const hyper = rows.find((r) => r.token === 'Hyper');
  assert.strictEqual(hyper.current, true);
  const iterm = rows.find((r) => r.token === 'iTerm.app');
  assert.strictEqual(iterm.current, false);
});

test('detectTerminals appends a synthetic row for an unknown current terminal', () => {
  const rows = detectTerminals({
    platform: 'darwin',
    env: { TERM_PROGRAM: 'WarpTerminalXYZ' },
    appExists: () => false,
  });
  const synth = rows.find((r) => r.token === 'WarpTerminalXYZ');
  assert.ok(synth, 'synthetic row present');
  assert.strictEqual(synth.installed, true);
  assert.strictEqual(synth.current, true);
  assert.strictEqual(synth.name, 'WarpTerminalXYZ');
});

test('detectTerminals uses hasCommand on linux', () => {
  const rows = detectTerminals({
    platform: 'linux',
    env: {},
    hasCommand: (bin) => bin === 'kitty',
  });
  const kitty = rows.find((r) => r.token === 'kitty');
  assert.strictEqual(kitty.installed, true);
  const hyper = rows.find((r) => r.token === 'Hyper');
  assert.strictEqual(hyper.installed, false);
});

// --- rewired onto terminal-markers.ts (Task 4) ---

test('detectTerminals marks GNOME Terminal current on linux via env marker', () => {
  const rows = detectTerminals({
    platform: 'linux',
    env: { GNOME_TERMINAL_SCREEN: '/org/gnome/Terminal/screen/abc' },
    hasCommand: () => false,
  });
  const row = rows.find((r) => r.token === 'gnome-terminal');
  assert.ok(row, 'gnome-terminal row present');
  assert.strictEqual(row.current, true);
});

test('detectTerminals marks Konsole current on linux via env marker', () => {
  const rows = detectTerminals({
    platform: 'linux',
    env: { KONSOLE_VERSION: '22.04.0' },
    hasCommand: () => false,
  });
  const row = rows.find((r) => r.token === 'konsole');
  assert.ok(row, 'konsole row present');
  assert.strictEqual(row.current, true);
});

test('detectTerminals resolves xfce4-terminal via the /proc fallback when env has no markers', () => {
  const rows = detectTerminals({
    platform: 'linux',
    env: {},
    hasCommand: () => false,
    ppid: 4242,
    procDeps: { readComm: () => 'xfce4-terminal', readPPid: () => 1 },
  });
  const row = rows.find((r) => r.token === 'xfce4-terminal');
  assert.ok(row, 'xfce4-terminal row present');
  assert.strictEqual(row.current, true);
});

test('detectTerminals on darwin with TERM_PROGRAM=Apple_Terminal is unchanged and does not consult /proc', () => {
  let procCalled = false;
  const rows = detectTerminals({
    platform: 'darwin',
    env: { TERM_PROGRAM: 'Apple_Terminal' },
    appExists: () => false,
    procDeps: {
      readComm: () => {
        procCalled = true;
        return 'xterm';
      },
    },
  });
  const row = rows.find((r) => r.token === 'Apple_Terminal');
  assert.ok(row, 'Apple_Terminal row present');
  assert.strictEqual(row.current, true);
  assert.strictEqual(procCalled, false, '/proc fallback must not be consulted on darwin');
});

test('detectTerminals marks the XFCE Terminal row current under VTE_VERSION + an xfce4 proc chain', () => {
  // The row exists only because of the /proc fallback; with the generic vte
  // catch-all treated as final it could never be `current`, so ticking it was
  // a silent no-op (finding I1).
  const rows = detectTerminals({
    platform: 'linux',
    env: { VTE_VERSION: '6003' },
    hasCommand: (bin) => bin === 'xfce4-terminal',
    ppid: 4242,
    procDeps: {
      readComm: (pid) => (pid === 4242 ? 'bash' : 'xfce4-terminal'),
      readPPid: () => 4243,
    },
  });
  const xfce = rows.find((r) => r.token === 'xfce4-terminal');
  assert.ok(xfce, 'xfce4-terminal row present');
  assert.strictEqual(xfce.installed, true);
  assert.strictEqual(xfce.current, true);
  assert.strictEqual(rows.filter((r) => r.current).length, 1);
  assert.strictEqual(rows.some((r) => r.token === 'vte'), false, 'no shadowing synthetic vte row');
});

test('always-include rule still appends a synthetic row for a VTE-only terminal (token "vte" is not a KNOWN_TERMINALS entry)', () => {
  const rows = detectTerminals({
    platform: 'linux',
    env: { VTE_VERSION: '6003' },
    hasCommand: () => false,
    // Models a VTE terminal whose process name is NOT in PROC_NAMES. Injected
    // (rather than left to the real /proc) so the assertion cannot depend on
    // which terminal the suite happens to be run from on a Linux host — the
    // provisional-vte fix means this case now reaches the walk.
    ppid: 4242,
    procDeps: { readComm: () => 'some-vte-term', readPPid: () => 1 },
  });
  const vte = rows.find((r) => r.token === 'vte');
  assert.ok(vte, 'synthetic vte row present');
  assert.strictEqual(vte.current, true);
  assert.strictEqual(vte.installed, true);
  assert.strictEqual(rows.filter((r) => r.current).length, 1);
});

test('detectTerminals checklist order: new linux terminals append after Konsole, macOS ordering unchanged', () => {
  const rows = detectTerminals({ platform: 'darwin', env: {}, appExists: () => false });
  const tokens = rows.map((r) => r.token);
  assert.deepStrictEqual(tokens.slice(0, 10), [
    'Hyper',
    'iTerm.app',
    'Apple_Terminal',
    'vscode',
    'ghostty',
    'WezTerm',
    'kitty',
    'alacritty',
    'gnome-terminal',
    'konsole',
  ]);
  assert.deepStrictEqual(tokens.slice(10), [
    'tilix',
    'terminator',
    'xfce4-terminal',
    'foot',
    'urxvt',
    'xterm',
  ]);
});

test('detectTerminals uses hasCommand for the new Linux entries', () => {
  const rows = detectTerminals({
    platform: 'linux',
    env: {},
    hasCommand: (bin) => bin === 'tilix' || bin === 'foot',
  });
  assert.strictEqual(rows.find((r) => r.token === 'tilix').installed, true);
  assert.strictEqual(rows.find((r) => r.token === 'foot').installed, true);
  assert.strictEqual(rows.find((r) => r.token === 'terminator').installed, false);
  assert.strictEqual(rows.find((r) => r.token === 'xfce4-terminal').installed, false);
  assert.strictEqual(rows.find((r) => r.token === 'urxvt').installed, false);
  assert.strictEqual(rows.find((r) => r.token === 'xterm').installed, false);
});
