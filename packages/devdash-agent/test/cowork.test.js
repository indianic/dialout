const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');
const {
  sanitizeTokens, renderMatchGate, renderCoworkBlock,
  removeCoworkBlock, pickTmuxInstall, unmatchableTokens,
  coworkViability,
  COWORK_BEGIN, COWORK_END, TOKEN_RE,
} = require('../dist/cowork');
const { ENV_MARKERS, PROC_NAMES, tokenFromEnv } = require('../dist/terminal-markers');
// Used by the shell⇄Node parity test below (Constraint 5).
const { currentTerminalToken } = require('../dist/terminal-detect');

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// --- sanitizeTokens ---

test('sanitizeTokens keeps legal tokens and dedups', () => {
  assert.deepStrictEqual(
    sanitizeTokens(['Hyper', 'iTerm.app', 'Hyper', 'Apple_Terminal']),
    ['Hyper', 'iTerm.app', 'Apple_Terminal']
  );
});

test('sanitizeTokens drops tokens with illegal characters', () => {
  assert.deepStrictEqual(
    sanitizeTokens(['Hyper', 'foo; rm -rf ~', 'a b', '$(x)', 'ok-1']),
    ['Hyper', 'ok-1']
  );
});

// --- unmatchableTokens ---
//
// The reported bug shipped a green "Cowork enabled." for a selection that
// could never match at runtime (GNOME Terminal, gated on $TERM_PROGRAM,
// which it never sets). These lock down the guard rail that makes that
// class of mismatch loud instead of silent.

test('unmatchableTokens flags a macOS-only token selected on linux', () => {
  assert.deepStrictEqual(
    unmatchableTokens(['Apple_Terminal', 'gnome-terminal'], 'linux'),
    ['Apple_Terminal']
  );
});

test('unmatchableTokens flags a linux-only token selected on darwin', () => {
  assert.deepStrictEqual(
    unmatchableTokens(['gnome-terminal'], 'darwin'),
    ['gnome-terminal']
  );
});

test('unmatchableTokens never flags cross-platform tokens on linux', () => {
  assert.deepStrictEqual(unmatchableTokens(['vscode', 'kitty'], 'linux'), []);
});

test('unmatchableTokens never flags cross-platform tokens on darwin', () => {
  assert.deepStrictEqual(unmatchableTokens(['vscode', 'kitty'], 'darwin'), []);
});

test('unmatchableTokens is a no-op on an empty selection', () => {
  assert.deepStrictEqual(unmatchableTokens([], 'linux'), []);
});

test('unmatchableTokens never flags Hyper, ghostty, WezTerm, or alacritty on either platform', () => {
  const both = ['Hyper', 'ghostty', 'WezTerm', 'alacritty'];
  assert.deepStrictEqual(unmatchableTokens(both, 'linux'), []);
  assert.deepStrictEqual(unmatchableTokens(both, 'darwin'), []);
});

test('unmatchableTokens derives every ENV_MARKERS/PROC_NAMES token from the shared tables, not a second hardcoded list', () => {
  // Anything reachable via tokenFromEnv (beyond the first three, cross-platform
  // markers) or tokenFromProcTree must be reported unmatchable on darwin — this
  // is what prevents the shared tables and this guard rail from drifting apart.
  const crossPlatform = new Set(['kitty', 'alacritty', 'WezTerm']);
  const linuxOnlyFromTables = new Set([
    ...ENV_MARKERS.map((m) => m.token),
    ...Object.values(PROC_NAMES),
  ].filter((t) => !crossPlatform.has(t)));
  for (const token of linuxOnlyFromTables) {
    assert.deepStrictEqual(
      unmatchableTokens([token], 'darwin'),
      [token],
      `${token} (from the shared tables) must be unmatchable on darwin`
    );
  }
});

// --- coworkViability ---
//
// The reported bug: a headless SSH-only server showed a 16-row checklist,
// every row "(not installed)", and — even if the user ticked every box — the
// generated gate's `[ -z "$SSH_TTY" ]` precondition (renderCoworkBlock) means
// it can never fire over SSH anyway. These lock down the machine-readable
// classification cli.ts uses to make that loud instead of silent.

test('coworkViability flags an SSH session (SSH_TTY) even with an emulator installed', () => {
  const r = coworkViability({ SSH_TTY: '/dev/pts/0' }, true);
  assert.strictEqual(r.usable, false);
  assert.ok(r.reasons.includes('ssh-session'));
});

test('coworkViability flags an SSH session via SSH_CONNECTION', () => {
  const r = coworkViability({ SSH_CONNECTION: '1.2.3.4 5678 9.10.11.12 22' }, true);
  assert.strictEqual(r.usable, false);
  assert.ok(r.reasons.includes('ssh-session'));
});

test('coworkViability flags no-emulator when nothing is installed', () => {
  const r = coworkViability({}, false);
  assert.strictEqual(r.usable, false);
  assert.ok(r.reasons.includes('no-emulator'));
});

test('coworkViability reports both reasons, in documented priority order, when SSH and no emulator coincide', () => {
  const r = coworkViability({ SSH_TTY: '/dev/pts/0' }, false);
  assert.strictEqual(r.usable, false);
  assert.deepStrictEqual(r.reasons, ['ssh-session', 'no-emulator']);
});

test('coworkViability is usable with no SSH env and an emulator installed', () => {
  const r = coworkViability({}, true);
  assert.strictEqual(r.usable, true);
  assert.deepStrictEqual(r.reasons, []);
});

// --- renderMatchGate under sh -c (the runtime match decision) ---

function runGate(tokens, env) {
  const gate = renderMatchGate(tokens);
  const script = `${gate}\n[ -n "$_dd_match" ] && echo WRAP || echo NATIVE`;
  return execFileSync('sh', ['-c', script], {
    env: { PATH: process.env.PATH, ...env },
  }).toString().trim();
}

test('renderMatchGate WRAPs a matching TERM_PROGRAM', () => {
  assert.strictEqual(runGate(['Hyper', 'iTerm.app'], { TERM_PROGRAM: 'Hyper' }), 'WRAP');
  assert.strictEqual(runGate(['Hyper', 'iTerm.app'], { TERM_PROGRAM: 'iTerm.app' }), 'WRAP');
});

test('renderMatchGate leaves a non-listed TERM_PROGRAM NATIVE', () => {
  assert.strictEqual(runGate(['Hyper'], { TERM_PROGRAM: 'Apple_Terminal' }), 'NATIVE');
  assert.strictEqual(runGate(['Hyper'], { TERM_PROGRAM: 'vscode' }), 'NATIVE');
});

test('renderMatchGate resolves marker envs (kitty/alacritty/wezterm)', () => {
  assert.strictEqual(runGate(['kitty'], { KITTY_WINDOW_ID: '2' }), 'WRAP');
  assert.strictEqual(runGate(['alacritty'], { ALACRITTY_WINDOW_ID: '1' }), 'WRAP');
  assert.strictEqual(runGate(['WezTerm'], { WEZTERM_PANE: '0' }), 'WRAP');
});

test('renderMatchGate with an empty allowlist never WRAPs', () => {
  assert.strictEqual(runGate([], { TERM_PROGRAM: 'Hyper' }), 'NATIVE');
});

// --- renderMatchGate: token resolution, executed under a real shell ---
//
// These assert on _dd_tp/_dd_match printed by the shell itself, not on the
// generated source: a gate that "contains the right string" but does not
// resolve at runtime is exactly the production bug this suite locks down.

// Shells the rc block is really sourced by (.bashrc → bash, .zshrc → zsh) plus
// POSIX sh implementations (dash is /bin/sh on Debian/Ubuntu). Missing shells
// are skipped so the suite still runs on hosts without them.
const SHELLS = ['/bin/sh', '/bin/dash', '/bin/bash', '/bin/zsh'].filter((s) => fs.existsSync(s));

function probeGate(tokens, env, shell = '/bin/sh') {
  return probeSource(renderMatchGate(tokens), env, shell);
}

// Runs the gate and returns BOTH streams. stderr matters as much as stdout:
// this block runs on every interactive shell start, so a byte on stderr is a
// permanent smudge across the top of the user's terminal.
function runSource(gate, env, shell = '/bin/sh') {
  const probe = `${gate}\nprintf "tp=[%s] match=[%s]\\n" "$_dd_tp" "$_dd_match"`;
  const r = spawnSync(shell, ['-c', probe], {
    env: { PATH: process.env.PATH, ...env },
    encoding: 'utf8',
  });
  if (r.error) throw r.error;
  return { stdout: r.stdout.trim(), stderr: r.stderr };
}

function probeSource(gate, env, shell = '/bin/sh') {
  return runSource(gate, env, shell).stdout;
}

// Same as probeGate, but with the walk's /proc root pointed at a path that does
// not exist, so `[ -d ... ]` is false and the walk is skipped exactly as on
// macOS. Needed for the env-marker assertions that resolve to the *provisional*
// generic vte token: post-fix those deliberately fall through to the /proc
// walk, so on a Linux test host the real ancestor chain (i.e. whichever
// terminal the suite is run from) would otherwise decide the result.
function probeGateNoProc(tokens, env, shell = '/bin/sh') {
  const gate = renderMatchGate(tokens).split('/proc').join('/nonexistent-devdash-proc');
  return probeSource(gate, env, shell);
}

const GNOME_ENV = {
  VTE_VERSION: '7002',
  GNOME_TERMINAL_SCREEN: '/org/gnome/Terminal/screen/abc',
};

test('renderMatchGate resolves GNOME Terminal (the reported bug: no TERM_PROGRAM on Linux)', () => {
  for (const sh of SHELLS) {
    assert.strictEqual(
      probeGate(['gnome-terminal'], GNOME_ENV, sh),
      'tp=[gnome-terminal] match=[1]',
      `under ${sh}`
    );
  }
});

test('renderMatchGate resolves Konsole', () => {
  for (const sh of SHELLS) {
    assert.strictEqual(
      probeGate(['konsole'], { KONSOLE_VERSION: '221201' }, sh),
      'tp=[konsole] match=[1]',
      `under ${sh}`
    );
  }
});

test('renderMatchGate resolves tilix and terminator over the generic vte marker', () => {
  assert.strictEqual(
    probeGate(['tilix'], { TILIX_ID: 'abc', VTE_VERSION: '7002' }),
    'tp=[tilix] match=[1]'
  );
  assert.strictEqual(
    probeGate(['terminator'], { TERMINATOR_UUID: 'urn:uuid:x', VTE_VERSION: '7002' }),
    'tp=[terminator] match=[1]'
  );
});

test('renderMatchGate falls back to the generic vte token', () => {
  assert.strictEqual(probeGateNoProc(['vte'], { VTE_VERSION: '7002' }), 'tp=[vte] match=[1]');
});

test('renderMatchGate still resolves TERM_PROGRAM on macOS (regression lock)', () => {
  for (const sh of SHELLS) {
    assert.strictEqual(
      probeGate(['Apple_Terminal'], { TERM_PROGRAM: 'Apple_Terminal' }, sh),
      'tp=[Apple_Terminal] match=[1]',
      `under ${sh}`
    );
  }
});

test('renderMatchGate: TERM_PROGRAM wins over a marker env var (tokenFromEnv precedence)', () => {
  assert.strictEqual(
    probeGate(['Apple_Terminal', 'vte'], { TERM_PROGRAM: 'Apple_Terminal', VTE_VERSION: '7002' }),
    'tp=[Apple_Terminal] match=[1]'
  );
});

test('renderMatchGate: a detected but NOT selected terminal does not wrap', () => {
  assert.strictEqual(probeGate(['Apple_Terminal'], GNOME_ENV), 'tp=[gnome-terminal] match=[]');
});

test('renderMatchGate: an empty allowlist never matches, whatever is detected', () => {
  const envs = [
    GNOME_ENV,
    { KONSOLE_VERSION: '221201' },
    { TILIX_ID: 'abc' },
    { TERMINATOR_UUID: 'urn:uuid:x' },
    { TERM_PROGRAM: 'Apple_Terminal' },
    { KITTY_WINDOW_ID: '2' },
  ];
  for (const env of envs) {
    const out = probeGate([], env);
    assert.match(out, /match=\[\]$/, `env ${JSON.stringify(env)} must not match`);
  }
});

test('the emitted gate resolves the same token as tokenFromEnv for every ENV_MARKERS entry', () => {
  // Constraint 3: the shell gate and the Node-side table must never drift.
  for (const { envVar, token } of ENV_MARKERS) {
    const env = { [envVar]: '1' };
    const expected = tokenFromEnv(env);
    assert.strictEqual(
      probeGateNoProc([token], env),
      `tp=[${expected}] match=[1]`,
      `${envVar} must resolve to ${expected} in the shell, as it does in tokenFromEnv`
    );
  }
});

test('the emitted env probes are in ENV_MARKERS order', () => {
  const gate = renderMatchGate(['x']);
  const seen = ENV_MARKERS.map(({ envVar }) => gate.indexOf(`$\{${envVar}:-}`));
  for (const [i, at] of seen.entries()) {
    assert.notStrictEqual(at, -1, `${ENV_MARKERS[i].envVar} must be probed`);
    if (i > 0) {
      assert.ok(at > seen[i - 1], `${ENV_MARKERS[i].envVar} must be probed after ${ENV_MARKERS[i - 1].envVar}`);
    }
  }
});

// --- renderMatchGate: the /proc process-tree fallback ---
//
// The walk hardcodes /proc (there is no runtime knob to point it elsewhere, by
// design). To execute the real emitted logic on a host without /proc, these
// tests rewrite only the two host-specific literals — the /proc root and the
// $$ seed — and run everything else, verbatim, under a real shell.
// A chain entry is either a plain comm string, or an object modelling a read
// that FAILS the way a real /proc does:
//   { comm, drop: 'comm'|'stat' }    file absent   → ENOENT (hidepid=1/2,
//                                                    ProtectProc=, exited pid)
//   { comm, hide: 'comm'|'stat' }    mode 0000     → EACCES (root-owned
//                                                    ancestor: login, agetty,
//                                                    gdm-session-worker)
//   { comm, ppid }                   explicit ppid (e.g. out of integer range)
function runWalk(tokens, env, chain, shell = '/bin/sh') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ddproc-'));
  const chmodBack = [];
  try {
    const base = 5000;
    chain.forEach((entry, i) => {
      const e = typeof entry === 'string' ? { comm: entry } : entry;
      const pid = base - i;
      const ppid = e.ppid ?? (i + 1 < chain.length ? base - (i + 1) : 1);
      const dir = path.join(root, String(pid));
      fs.mkdirSync(dir);
      const files = {
        comm: `${e.comm}\n`,
        stat: `${pid} (${e.comm}) S ${ppid} ${pid} ${pid} 34816 1 4194304 100 0 0 0 0 0 0 20 0 1 0\n`,
      };
      for (const [name, body] of Object.entries(files)) {
        if (e.drop === name) continue;
        const file = path.join(dir, name);
        fs.writeFileSync(file, body);
        if (e.hide === name) {
          fs.chmodSync(file, 0o000);
          chmodBack.push(file);
        }
      }
    });
    const gate = renderMatchGate(tokens)
      .split('/proc').join(root)
      .replace('_dd_pid=$$', `_dd_pid=${base}`);
    return runSource(gate, env, shell);
  } finally {
    // Restore modes before unlinking so a failed run never leaves a temp tree
    // that is awkward to clean up.
    for (const f of chmodBack) {
      try { fs.chmodSync(f, 0o644); } catch { /* already gone */ }
    }
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function probeWalk(tokens, env, chain, shell = '/bin/sh') {
  return runWalk(tokens, env, chain, shell).stdout;
}

// mode 0000 is still readable by root, so the EACCES fixtures prove nothing there.
const IS_ROOT = typeof process.getuid === 'function' && process.getuid() === 0;

test('the /proc walk resolves a terminal that sets no env marker at all', () => {
  for (const sh of SHELLS) {
    assert.strictEqual(
      probeWalk(['xterm'], {}, ['zsh', 'bash', 'xterm'], sh),
      'tp=[xterm] match=[1]',
      `under ${sh}`
    );
  }
});

test('the /proc walk maps the truncated gnome-terminal-server comm', () => {
  assert.strictEqual(
    probeWalk(['gnome-terminal'], {}, ['zsh', 'gnome-terminal-']),
    'tp=[gnome-terminal] match=[1]'
  );
});

test('the /proc walk covers every PROC_NAMES pair', () => {
  for (const [comm, token] of Object.entries(PROC_NAMES)) {
    assert.strictEqual(
      probeWalk([token], {}, ['zsh', comm]),
      `tp=[${token}] match=[1]`,
      `comm "${comm}" must resolve to ${token}`
    );
  }
});

test('the /proc walk stops after 10 levels (self + 9 ancestors)', () => {
  const ten = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'xterm'];
  assert.strictEqual(probeWalk(['xterm'], {}, ten), 'tp=[xterm] match=[1]');
  const eleven = [...ten.slice(0, 9), 'j', 'xterm'];
  assert.strictEqual(probeWalk(['xterm'], {}, eleven), 'tp=[] match=[]');
});

test('the /proc walk parses ppid from the LAST ")" of stat', () => {
  // A comm containing ") (" would break a naive field split; the walk must
  // still find the parent. chainDeps writes the comm into stat verbatim.
  assert.strictEqual(probeWalk(['xterm'], {}, ['my) (weird', 'xterm']), 'tp=[xterm] match=[1]');
});

test('the /proc walk yields nothing for an unknown process chain', () => {
  assert.strictEqual(probeWalk(['xterm'], {}, ['bash', 'sshd', 'systemd']), 'tp=[] match=[]');
});

test('the /proc walk is skipped when an env marker already resolved the terminal', () => {
  // xterm sits in the (fake) process tree, but KONSOLE_VERSION is set: env
  // precedence must win, exactly as in tokenFromEnv → tokenFromProcTree order.
  assert.strictEqual(
    probeWalk(['konsole', 'xterm'], { KONSOLE_VERSION: '221201' }, ['zsh', 'xterm']),
    'tp=[konsole] match=[1]'
  );
});

// --- the generic "vte" token is PROVISIONAL, not final (finding I1) ---
//
// xfce4-terminal is VTE-based, so it exports VTE_VERSION and the generic vte
// catch-all fires for it — which used to end resolution before the /proc walk
// ever ran. The "XFCE Terminal" checklist row could therefore never be current
// and picking it was a silent no-op: byte-for-byte the reported bug, for a
// terminal this branch added specifically to fix it. So when env resolution
// produced ONLY the generic vte token, the walk must still run and a specific
// process-tree match must win — while vte survives as the last resort.

test('the /proc walk overrides the provisional generic vte token (xfce4-terminal sets VTE_VERSION)', () => {
  for (const sh of SHELLS) {
    assert.strictEqual(
      probeWalk(['xfce4-terminal'], { VTE_VERSION: '6003' }, ['bash', 'xfce4-terminal', 'systemd'], sh),
      'tp=[xfce4-terminal] match=[1]',
      `under ${sh}`
    );
  }
});

test('the generic vte token is restored when the walk finds nothing', () => {
  // A VTE terminal whose process name is not in PROC_NAMES must still resolve
  // to vte — the catch-all keeps working as a last resort.
  for (const sh of SHELLS) {
    assert.strictEqual(
      probeWalk(['vte'], { VTE_VERSION: '6003' }, ['bash', 'some-vte-term', 'systemd'], sh),
      'tp=[vte] match=[1]',
      `under ${sh}`
    );
  }
});

test('a specific env marker still beats the /proc walk even when VTE_VERSION is also set', () => {
  // Only the generic vte token is provisional. tilix/terminator/gnome-terminal
  // sit above VTE_VERSION in ENV_MARKERS and must remain final.
  assert.strictEqual(
    probeWalk(['tilix', 'xterm'], { TILIX_ID: 'abc', VTE_VERSION: '7002' }, ['zsh', 'xterm']),
    'tp=[tilix] match=[1]'
  );
  assert.strictEqual(
    probeWalk(['gnome-terminal', 'xterm'], GNOME_ENV, ['zsh', 'xterm']),
    'tp=[gnome-terminal] match=[1]'
  );
});

test('the provisional-vte walk is silent and leaves no temporaries behind', () => {
  for (const sh of SHELLS) {
    const r = runWalk(['vte'], { VTE_VERSION: '6003' }, ['bash', { comm: 'x', drop: 'comm' }], sh);
    assert.strictEqual(r.stderr, '', `${sh} must not write to the user's terminal, got: ${r.stderr}`);
    assert.strictEqual(r.stdout, 'tp=[vte] match=[1]', `under ${sh}`);
  }
});

test('the gate unsets every _dd_ temporary it introduces', () => {
  // _dd_tp and _dd_match are deliberately left set for the caller (the block
  // around the gate unsets them); everything else the gate touches must be
  // gone, or it leaks into the user's interactive shell.
  const gate = renderMatchGate(['gnome-terminal']);
  const names = [...new Set(gate.match(/_dd_[a-z_]+/g))]
    .filter((n) => n !== '_dd_tp' && n !== '_dd_match');
  assert.ok(names.length >= 6, `expected the walk temporaries, got ${names.join(',')}`);
  const probe = `${gate}\nfor v in ${names.join(' ')}; do eval "printf '%s=[%s]\\n' \\"\\$v\\" \\"\\$$v\\""; done`;
  const out = execFileSync('/bin/sh', ['-c', probe], { env: { PATH: process.env.PATH, ...GNOME_ENV } })
    .toString().trim();
  assert.strictEqual(out, names.map((n) => `${n}=[]`).join('\n'));
});

test('the shell gate and currentTerminalToken agree on the provisional-vte cases (Constraint 5)', () => {
  // The invariant: both sides resolve the SAME token from the SAME table.
  // Node walks its injected proc deps; the shell walks a fake /proc holding
  // the identical chain.
  const cases = [
    { chain: ['bash', 'xfce4-terminal', 'systemd'], expected: 'xfce4-terminal' },
    { chain: ['bash', 'some-vte-term', 'systemd'], expected: 'vte' },
    { chain: ['bash', 'foot', 'systemd'], expected: 'foot' },
  ];
  for (const { chain, expected } of cases) {
    const nodeToken = currentTerminalToken({ VTE_VERSION: '6003' }, {
      platform: 'linux',
      ppid: 100,
      procDeps: {
        readComm: (pid) => chain[100 - pid],
        readPPid: (pid) => (100 - pid + 1 < chain.length ? pid - 1 : 1),
      },
    });
    assert.strictEqual(nodeToken, expected, `Node side for ${chain.join('→')}`);
    assert.strictEqual(
      probeWalk([expected], { VTE_VERSION: '6003' }, chain),
      `tp=[${expected}] match=[1]`,
      `shell side for ${chain.join('→')}`
    );
  }
});

// --- the /proc walk must be silent when a read FAILS, not just when it works ---
//
// These are the cases that actually reach the failing reads. `[ -d /proc ]`
// short-circuits the macOS test below before any read runs, so it cannot catch
// a noisy read. Only the marker-less terminals this task targets (xterm, st,
// urxvt, foot, plain TTY) reach the walk at all, and a walk that finds no match
// runs all 10 levels — so it is exactly this population that is most likely to
// hit a root-owned or hidden ancestor.

test('the /proc walk is silent when an ancestor comm is unreadable (EACCES)', { skip: IS_ROOT && 'runs as root: mode 0000 is still readable' }, () => {
  // hidepid=1/2 or systemd ProtectProc= hides root-owned ancestors such as
  // login, agetty, gdm-session-worker, sddm-helper.
  for (const sh of SHELLS) {
    const r = runWalk(['xterm'], {}, ['zsh', { comm: 'xterm', hide: 'comm' }], sh);
    assert.strictEqual(r.stderr, '', `${sh} must not write to the user's terminal, got: ${r.stderr}`);
    assert.strictEqual(r.stdout, 'tp=[] match=[]', `under ${sh}`);
  }
});

test('the /proc walk is silent when an ancestor comm is missing (ENOENT)', () => {
  // An ancestor that exited mid-walk, or a pid hidden outright.
  for (const sh of SHELLS) {
    const r = runWalk(['xterm'], {}, ['zsh', { comm: 'xterm', drop: 'comm' }], sh);
    assert.strictEqual(r.stderr, '', `${sh} must not write to the user's terminal, got: ${r.stderr}`);
    assert.strictEqual(r.stdout, 'tp=[] match=[]', `under ${sh}`);
  }
});

test('the /proc walk is silent when a stat read fails', { skip: IS_ROOT && 'runs as root: mode 0000 is still readable' }, () => {
  for (const sh of SHELLS) {
    const r = runWalk(['xterm'], {}, [{ comm: 'zsh', hide: 'stat' }, 'xterm'], sh);
    assert.strictEqual(r.stderr, '', `${sh} must not write to the user's terminal, got: ${r.stderr}`);
    assert.strictEqual(r.stdout, 'tp=[] match=[]', `under ${sh}`);
  }
});

test('the /proc walk is silent when a stat file is missing (ENOENT)', () => {
  for (const sh of SHELLS) {
    const r = runWalk(['xterm'], {}, [{ comm: 'zsh', drop: 'stat' }, 'xterm'], sh);
    assert.strictEqual(r.stderr, '', `${sh} must not write to the user's terminal, got: ${r.stderr}`);
    assert.strictEqual(r.stdout, 'tp=[] match=[]', `under ${sh}`);
  }
});

test('the /proc walk is silent when ppid is digits-only but out of integer range', () => {
  // Passes the ''|*[!0-9]* digit guard, then blows up inside [ "$_dd_pid" -gt 1 ]
  // ("Illegal number" / "integer expression expected" / "number truncated").
  for (const sh of SHELLS) {
    const r = runWalk(['xterm'], {}, [{ comm: 'zsh', ppid: '9'.repeat(25) }, 'xterm'], sh);
    assert.strictEqual(r.stderr, '', `${sh} must not write to the user's terminal, got: ${r.stderr}`);
    assert.match(r.stdout, /match=\[\]$/, `under ${sh}`);
  }
});

test('a failing read still ends the walk (no infinite loop, no false match)', () => {
  // Silence must come from redirecting the diagnostic, not from swallowing the
  // failure: the walk must still stop at the unreadable level rather than
  // spinning or resolving a token it never actually read.
  const r = runWalk(['xterm'], {}, ['zsh', { comm: 'xterm', drop: 'comm' }, 'xterm']);
  assert.strictEqual(r.stdout, 'tp=[] match=[]');
  assert.strictEqual(r.stderr, '');
});

test('the gate is a silent no-op where /proc does not exist', () => {
  // On macOS there is no /proc: the block must not print a single byte of
  // noise into the user\'s terminal on every shell start.
  for (const sh of SHELLS) {
    const gate = renderMatchGate(['Apple_Terminal', 'gnome-terminal']);
    const probe = `${gate}\nprintf "tp=[%s] match=[%s]\\n" "$_dd_tp" "$_dd_match"`;
    const res = execFileSync(sh, ['-c', probe], {
      env: { PATH: process.env.PATH },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    assert.strictEqual(res.toString().trim(), 'tp=[] match=[]', `under ${sh}`);
  }
});

test('the gate leaves no walk temporaries behind in the shell', () => {
  const gate = renderMatchGate(['gnome-terminal']);
  const probe = `${gate}\nfor v in _dd_pid _dd_lvl _dd_comm _dd_stat _dd_rest _dd_ppid; do eval "printf '%s=[%s]\\n' \\"\\$v\\" \\"\\$$v\\""; done`;
  const out = execFileSync('/bin/sh', ['-c', probe], { env: { PATH: process.env.PATH, ...GNOME_ENV } })
    .toString().trim();
  assert.strictEqual(
    out,
    '_dd_pid=[]\n_dd_lvl=[]\n_dd_comm=[]\n_dd_stat=[]\n_dd_rest=[]\n_dd_ppid=[]'
  );
});

// --- rc-injection defense (Constraint 4) ---

test('TOKEN_RE is exported and is not widened', () => {
  assert.strictEqual(TOKEN_RE.source, '^[A-Za-z0-9._-]+$');
  for (const bad of ['foo; rm -rf ~', '$(id)', '`id`', 'a b', 'a)b', 'a|b', '*', '']) {
    assert.strictEqual(TOKEN_RE.test(bad), false, `${JSON.stringify(bad)} must be rejected`);
  }
});

test('an injected token never reaches the emitted shell', () => {
  const gate = renderMatchGate(['gnome-terminal', 'evil; touch /tmp/dd-pwned', '$(id)']);
  assert.doesNotMatch(gate, /touch/);
  assert.doesNotMatch(gate, /\$\(id\)/);
  assert.strictEqual(probeGate(['gnome-terminal', 'evil; touch /tmp/dd-pwned'], GNOME_ENV), 'tp=[gnome-terminal] match=[1]');
});

test('every interpolated env var name and /proc comm is shell-safe', () => {
  const NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;
  for (const { envVar, token } of ENV_MARKERS) {
    assert.ok(NAME_RE.test(envVar), `${envVar} must be a legal shell name`);
    assert.ok(TOKEN_RE.test(token), `${token} must satisfy TOKEN_RE`);
  }
  for (const [comm, token] of Object.entries(PROC_NAMES)) {
    assert.ok(TOKEN_RE.test(comm), `comm pattern ${comm} must satisfy TOKEN_RE`);
    assert.ok(TOKEN_RE.test(token), `${token} must satisfy TOKEN_RE`);
  }
});

// --- renderCoworkBlock ---

test('renderCoworkBlock injects a case arm for each token', () => {
  const block = renderCoworkBlock(['Hyper', 'iTerm.app']);
  assert.ok(block.startsWith(COWORK_BEGIN));
  assert.ok(block.trimEnd().endsWith(COWORK_END));
  assert.match(block, /Hyper\|iTerm\.app\) _dd_match=1 ;;/);
  assert.match(block, /exec tmux new-session -A -s/);
  // The pane-scrollbars footgun must never reappear.
  assert.doesNotMatch(block, /pane-scrollbars/);
});

test('renderCoworkBlock parses in every shell that sources it', () => {
  // .bashrc → bash, .zshrc → zsh; a syntax error here breaks every new
  // terminal the user opens, so parse the whole block (not just the gate).
  const block = renderCoworkBlock(['Apple_Terminal', 'gnome-terminal', 'konsole']);
  for (const sh of SHELLS) {
    assert.doesNotThrow(() => execFileSync(sh, ['-n'], { input: block }), `under ${sh}`);
  }
});

test('renderCoworkBlock indents the gate inside the interactive branch', () => {
  const block = renderCoworkBlock(['gnome-terminal']);
  assert.match(block, /\n {6}_dd_tp="\$\{TERM_PROGRAM:-\}"\n/);
});

test('renderCoworkBlock routes copy to pbcopy, gated on pbcopy presence', () => {
  const block = renderCoworkBlock(['Hyper']);
  assert.match(block, /if command -v pbcopy >\/dev\/null 2>&1; then/);
  assert.match(block, /copy-pipe-and-cancel pbcopy/);
});

test('renderCoworkBlock puts the Linux clipboard tools in ONE chain behind pbcopy', () => {
  const block = renderCoworkBlock(['Hyper']);
  // pbcopy is the FIRST arm of a single chain — never a separate branch the
  // Linux tools can run in addition to (finding I2 / Constraint 1).
  assert.match(block, /if command -v pbcopy >\/dev\/null 2>&1; then/);
  assert.match(block, /copy-pipe-and-cancel pbcopy/);
  assert.doesNotMatch(block, /command -v pbcopy >\/dev\/null 2>&1 && \{/);
  // pbcopy -> wl-copy -> xclip -> xsel, elif-style so only the first wins.
  assert.match(block, /elif command -v wl-copy >\/dev\/null 2>&1; then/);
  assert.match(block, /copy-pipe-and-cancel wl-copy/);
  assert.match(block, /elif command -v xclip >\/dev\/null 2>&1; then/);
  // Quoted as ONE token: tmux's copy-pipe-and-cancel only takes a single
  // trailing argument, run through the pane's shell. An unquoted multi-word
  // command splits into extra argv positions tmux misparses as a second
  // command reference, and the copy silently never fires (verified against
  // tmux 3.7b).
  assert.match(block, /copy-pipe-and-cancel "xclip -selection clipboard"/);
  assert.match(block, /elif command -v xsel >\/dev\/null 2>&1; then/);
  assert.match(block, /copy-pipe-and-cancel "xsel --clipboard --input"/);
  assert.match(block, /\bfi\b/);
});

test('renderCoworkBlock binds all four copy actions through each Linux clipboard tool', () => {
  const block = renderCoworkBlock(['Hyper']);
  const bindingCount = (needle) => (block.match(new RegExp(escapeRe(`copy-pipe-and-cancel ${needle}`), 'g')) || []).length;
  assert.strictEqual(bindingCount('wl-copy'), 4);
  assert.strictEqual(bindingCount('"xclip -selection clipboard"'), 4);
  assert.strictEqual(bindingCount('"xsel --clipboard --input"'), 4);
});

// --- the clipboard chain, EXECUTED (finding I2) ---
//
// String-matching the generated block is exactly what let the bug through:
// a standalone `command -v pbcopy && { ... }` followed by an INDEPENDENT
// `if wl-copy / elif xclip / elif xsel` matches every string assertion above
// while both halves run on a Mac that has xclip or xsel from Homebrew. All
// four bind-key calls then fire twice and the LATER one wins, routing copy
// through `xclip -selection clipboard`, which fails at runtime with no
// DISPLAY — macOS clipboard copy silently stops working (Constraint 1), and
// the gate diverges from copyVerb(), which returns pbcopy on darwin before
// probing anything. So run the emitted shell for real against a fake PATH.

// Extracts the clipboard section of the rendered block and runs it under sh
// with PATH containing only the named stub binaries plus a tmux stub that
// prints what each copy is routed through.
function runClipboardChain(present, prefix = '') {
  const lines = renderCoworkBlock(['Hyper']).split('\n');
  const start = lines.findIndex((l) => l.includes('command -v pbcopy'));
  const end = lines.findIndex((l) => l.includes('@devdash_folder "'));
  assert.ok(start !== -1 && end > start, 'clipboard section not found in the block');
  const section = lines.slice(start, end).map((l) => l.replace(/^ {8}/, '')).join('\n');
  const bin = fs.mkdtempSync(path.join(os.tmpdir(), 'ddbin-'));
  try {
    const stub = (name, body) => {
      const f = path.join(bin, name);
      fs.writeFileSync(f, body);
      fs.chmodSync(f, 0o755);
    };
    stub('tmux', '#!/bin/sh\nprev=""\nfor a in "$@"; do\n'
      + '  if [ "$prev" = copy-pipe-and-cancel ]; then printf "BIND %s\\n" "$a"; fi\n'
      + '  if [ "$prev" = copy-command ]; then printf "COPYCMD %s\\n" "$a"; fi\n'
      + '  prev="$a"\ndone\nexit 0\n');
    for (const p of present) stub(p, '#!/bin/sh\nexit 0\n');
    const r = spawnSync('/bin/sh', ['-c', prefix + section], {
      env: { PATH: bin },
      encoding: 'utf8',
    });
    if (r.error) throw r.error;
    const lines = r.stdout.trim().split('\n').filter(Boolean);
    return {
      binds: lines.filter((l) => l.startsWith('BIND ')),
      copyCommands: lines.filter((l) => l.startsWith('COPYCMD ')),
      stderr: r.stderr,
      status: r.status,
    };
  } finally {
    fs.rmSync(bin, { recursive: true, force: true });
  }
}

test('a Mac with xclip installed still routes copy through pbcopy only (Constraint 1)', () => {
  // xclip and xsel are both installable on macOS via Homebrew.
  const r = runClipboardChain(['pbcopy', 'xclip', 'xsel']);
  assert.deepStrictEqual(r.binds, ['BIND pbcopy', 'BIND pbcopy', 'BIND pbcopy', 'BIND pbcopy']);
  assert.strictEqual(r.stderr, '');
});

test('a plain Mac binds pbcopy four times and nothing else', () => {
  const r = runClipboardChain(['pbcopy']);
  assert.deepStrictEqual(r.binds, ['BIND pbcopy', 'BIND pbcopy', 'BIND pbcopy', 'BIND pbcopy']);
});

test('Linux with wl-copy present routes copy through wl-copy only', () => {
  const r = runClipboardChain(['wl-copy', 'xclip', 'xsel']);
  assert.deepStrictEqual(r.binds, ['BIND wl-copy', 'BIND wl-copy', 'BIND wl-copy', 'BIND wl-copy']);
});

test('Linux with only xclip routes copy through xclip, quoted as one argument', () => {
  const r = runClipboardChain(['xclip', 'xsel']);
  assert.deepStrictEqual(r.binds, Array(4).fill('BIND xclip -selection clipboard'));
});

test('Linux with only xsel routes copy through xsel', () => {
  const r = runClipboardChain(['xsel']);
  assert.deepStrictEqual(r.binds, Array(4).fill('BIND xsel --clipboard --input'));
});

test('no clipboard tool at all binds nothing (tmux OSC 52 still applies)', () => {
  const r = runClipboardChain([]);
  assert.deepStrictEqual(r.binds, []);
  assert.strictEqual(r.stderr, '');
});

test('the clipboard chain is silent and exits 0 under set -eu, with and without pbcopy', () => {
  for (const present of [['pbcopy'], ['xclip'], []]) {
    const r = runClipboardChain(present, 'set -eu\n');
    assert.strictEqual(r.stderr, '', `stderr for [${present}]`);
    assert.strictEqual(r.status, 0, `exit status for [${present}]`);
  }
});

test('renderCoworkBlock with empty tokens has a no-op case arm', () => {
  const block = renderCoworkBlock([]);
  assert.match(block, /\*\) ;;/);
  assert.doesNotMatch(block, /_dd_match=1/);
});

test('renderCoworkBlock drops illegal tokens before injection', () => {
  const block = renderCoworkBlock(['Hyper', 'evil; rm -rf ~']);
  assert.doesNotMatch(block, /rm -rf/);
  assert.match(block, /Hyper\) _dd_match=1 ;;/);
});

// --- removeCoworkBlock ---

test('removeCoworkBlock strips the marker block and leaves other content', () => {
  const rc = `export FOO=1\n\n${renderCoworkBlock(['Hyper'])}\n\nexport BAR=2\n`;
  const out = removeCoworkBlock(rc);
  assert.doesNotMatch(out, /devdash cowork wrapper/);
  assert.match(out, /export FOO=1/);
  assert.match(out, /export BAR=2/);
});

test('removeCoworkBlock is a no-op when no block present', () => {
  assert.strictEqual(removeCoworkBlock('export FOO=1\n'), 'export FOO=1\n');
});

// --- pickTmuxInstall ---

test('pickTmuxInstall picks brew on macOS when present', () => {
  const r = pickTmuxInstall('darwin', (b) => b === 'brew');
  assert.strictEqual(r.command, 'brew install tmux');
  assert.strictEqual(r.canAuto, true);
});

test('pickTmuxInstall gives manual steps on macOS without brew', () => {
  const r = pickTmuxInstall('darwin', () => false);
  assert.strictEqual(r.canAuto, false);
  assert.match(r.manual, /Homebrew/);
});

test('pickTmuxInstall picks the first present linux package manager', () => {
  const r = pickTmuxInstall('linux', (b) => b === 'dnf');
  assert.strictEqual(r.command, 'sudo dnf install -y tmux');
  assert.strictEqual(r.canAuto, true);
});

test('pickTmuxInstall gives manual steps on linux without a package manager', () => {
  const r = pickTmuxInstall('linux', () => false);
  assert.strictEqual(r.canAuto, false);
  assert.ok(r.manual && r.manual.length > 0);
});

// --- copy-command in the rc chain, EXECUTED ---
//
// The four bind-keys only cover drag-release and the keyboard copies. tmux's
// own double-click-word / triple-click-line defaults call
// `copy-pipe-and-cancel` with NO argument and fall back to the `copy-command`
// server option, which was empty — so on a native cowork shell those copies
// reached the tmux paste buffer and OSC 52 only, and never the OS clipboard.
// Run the emitted shell for real, as the bind tests do, because string
// matching is what let the previous clipboard bug through.

test('the rc chain sets copy-command exactly once, matching the tool it binds', () => {
  const cases = [
    { present: ['pbcopy'], tool: 'pbcopy' },
    { present: ['pbcopy', 'xclip', 'xsel'], tool: 'pbcopy' },       // Homebrew Mac
    { present: ['wl-copy', 'xclip', 'xsel'], tool: 'wl-copy' },     // Wayland
    { present: ['xclip', 'xsel'], tool: 'xclip -selection clipboard' },
    { present: ['xsel'], tool: 'xsel --clipboard --input' },
  ];
  for (const { present, tool } of cases) {
    const r = runClipboardChain(present);
    assert.deepStrictEqual(
      r.copyCommands,
      [`COPYCMD ${tool}`],
      `copy-command for [${present.join(',')}] must be set once, to ${tool}`,
    );
    // and it must agree with what the bindings pipe through — a divergence is
    // the shape of the xclip-on-macOS bug the chain was built to prevent.
    assert.deepStrictEqual(r.binds, Array(4).fill(`BIND ${tool}`));
    assert.strictEqual(r.stderr, '');
  }
});

test('a machine with no clipboard tool sets no copy-command and no bindings', () => {
  const r = runClipboardChain([]);
  assert.deepStrictEqual(r.copyCommands, []);
  assert.deepStrictEqual(r.binds, []);
});

test('renderCoworkBlock quotes the multi-word copy-command tools as one argument', () => {
  const block = renderCoworkBlock(['Hyper']);
  assert.match(block, /set-option -g copy-command pbcopy/);
  assert.match(block, /set-option -g copy-command wl-copy/);
  assert.match(block, /set-option -g copy-command "xclip -selection clipboard"/);
  assert.match(block, /set-option -g copy-command "xsel --clipboard --input"/);
});
