const test = require('node:test');
const assert = require('node:assert');
const { ENV_MARKERS, tokenFromEnv, PROC_NAMES, tokenFromProcTree, ppidFromStat } = require('../dist/terminal-markers');
// The real rc-injection gate, not a copy: a second regex here could drift from
// the one that actually guards the generated shell.
const { TOKEN_RE } = require('../dist/cowork');

// --- ENV_MARKERS shape (Constraint 4) ---

test('every ENV_MARKERS token satisfies the shell-injection token regex', () => {
  for (const { envVar, token } of ENV_MARKERS) {
    assert.ok(TOKEN_RE.test(token), `token for ${envVar} ("${token}") must satisfy ${TOKEN_RE}`);
  }
});

// --- tokenFromEnv ---

test('tokenFromEnv prefers a specific VTE-based marker over the generic vte catch-all', () => {
  assert.strictEqual(
    tokenFromEnv({
      VTE_VERSION: '7002',
      GNOME_TERMINAL_SCREEN: '/org/gnome/Terminal/screen/x',
    }),
    'gnome-terminal'
  );
});

test('tokenFromEnv resolves real Konsole env', () => {
  assert.strictEqual(tokenFromEnv({ KONSOLE_VERSION: '221201' }), 'konsole');
});

test('tokenFromEnv falls back to the generic vte token when nothing more specific matched', () => {
  assert.strictEqual(tokenFromEnv({ VTE_VERSION: '7002' }), 'vte');
});

test('tokenFromEnv: TERM_PROGRAM wins even when a marker env var is also set', () => {
  assert.strictEqual(
    tokenFromEnv({ TERM_PROGRAM: 'Apple_Terminal', VTE_VERSION: '7002' }),
    'Apple_Terminal'
  );
});

test('tokenFromEnv returns "" inside tmux', () => {
  assert.strictEqual(tokenFromEnv({ TMUX: '/tmp/x' }), '');
  assert.strictEqual(tokenFromEnv({ TERM_PROGRAM: 'tmux' }), '');
});

test('tokenFromEnv returns "" for an empty env', () => {
  assert.strictEqual(tokenFromEnv({}), '');
});

// --- PROC_NAMES shape ---

test('PROC_NAMES maps the truncated gnome-terminal-server comm to gnome-terminal', () => {
  // The kernel truncates /proc/<pid>/comm to 15 chars, so
  // "gnome-terminal-server" is stored (and looked up) as "gnome-terminal-".
  assert.strictEqual(PROC_NAMES['gnome-terminal-'], 'gnome-terminal');
});

test('PROC_NAMES maps both rxvt spellings to urxvt', () => {
  assert.strictEqual(PROC_NAMES['urxvt'], 'urxvt');
  assert.strictEqual(PROC_NAMES['rxvt-unicode'], 'urxvt');
});

test('PROC_NAMES maps wezterm-gui to the WezTerm token', () => {
  assert.strictEqual(PROC_NAMES['wezterm-gui'], 'WezTerm');
});

// --- tokenFromProcTree ---

// Builds ProcDeps for a fixed linear chain: chain[0] is the startPid's own
// comm, chain[i] is its i-th ancestor. Pids are synthetic (base 5000) so they
// never collide with the pid<=1 stop condition. Walking off the end of the
// array reports ppid 1 (init), ending the walk.
function chainDeps(chain) {
  const base = 5000;
  const pidFor = (i) => base - i; // startPid = base, parent = base-1, ...
  return {
    readComm: (pid) => {
      const i = base - pid;
      if (i < 0 || i >= chain.length) throw new Error(`no comm for pid ${pid}`);
      return chain[i];
    },
    readPPid: (pid) => {
      const i = base - pid;
      if (i + 1 >= chain.length) return 1;
      return pidFor(i + 1);
    },
  };
}

test('tokenFromProcTree: shell -> bash -> gnome-terminal- resolves to gnome-terminal', () => {
  const deps = chainDeps(['zsh', 'bash', 'gnome-terminal-']);
  assert.strictEqual(tokenFromProcTree(5000, deps), 'gnome-terminal');
});

test('tokenFromProcTree: unknown chain (bash -> sshd -> systemd) returns ""', () => {
  const deps = chainDeps(['bash', 'sshd', 'systemd']);
  assert.strictEqual(tokenFromProcTree(5000, deps), '');
});

test('tokenFromProcTree: a chain longer than 10 levels returns "" (bound enforced)', () => {
  // 11 levels: a match sits at level 11, one past the 10-level bound, so it
  // must never be reached.
  const chain = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'xterm'];
  const deps = chainDeps(chain);
  assert.strictEqual(tokenFromProcTree(5000, deps), '');
});

test('tokenFromProcTree: a chain of exactly 10 levels with the match on the 10th resolves', () => {
  const chain = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'xterm'];
  const deps = chainDeps(chain);
  assert.strictEqual(tokenFromProcTree(5000, deps), 'xterm');
});

test('tokenFromProcTree: a comm of "constructor" does not resolve via the Object.prototype chain', () => {
  // PROC_NAMES is a plain object literal, so an unguarded PROC_NAMES[comm]
  // lookup would return the inherited Object.prototype.constructor function
  // (always truthy) instead of undefined for a process literally named
  // "constructor" (9 chars, well under the 15-char comm truncation limit).
  const deps = chainDeps(['constructor', 'bash', 'sshd']);
  const result = tokenFromProcTree(5000, deps);
  assert.strictEqual(typeof result, 'string');
  assert.strictEqual(result, '');
});

test('tokenFromProcTree: other Object.prototype member names (toString, hasOwnProperty) do not resolve', () => {
  for (const comm of ['toString', 'hasOwnProperty', 'valueOf', 'isPrototypeOf', 'propertyIsEnumerable', 'toLocaleString']) {
    const deps = chainDeps([comm, 'bash', 'sshd']);
    const result = tokenFromProcTree(5000, deps);
    assert.strictEqual(typeof result, 'string', `comm "${comm}" must resolve to a string`);
    assert.strictEqual(result, '', `comm "${comm}" must not resolve via the prototype chain`);
  }
});

test('tokenFromProcTree: a throwing readComm returns "" rather than propagating', () => {
  const deps = {
    readComm: () => {
      throw new Error('boom: no /proc on this platform');
    },
    readPPid: () => {
      throw new Error('should never be reached');
    },
  };
  assert.doesNotThrow(() => tokenFromProcTree(5000, deps));
  assert.strictEqual(tokenFromProcTree(5000, deps), '');
});

test('tokenFromProcTree: a throwing readPPid (mid-walk) returns "" rather than propagating', () => {
  const deps = {
    readComm: () => 'bash', // never matches PROC_NAMES
    readPPid: () => {
      throw new Error('boom: no /proc on this platform');
    },
  };
  assert.strictEqual(tokenFromProcTree(5000, deps), '');
});

test('tokenFromProcTree: stops at pid <= 1 without reading further', () => {
  assert.strictEqual(tokenFromProcTree(1), '');
});

// --- ppidFromStat (the LAST ")" parsing rule for /proc/<pid>/stat) ---

test('ppidFromStat parses ppid from an ordinary stat line', () => {
  const stat = '1234 (bash) S 999 1234 1234 34816 1235 4194304 100 0 0 0 0 0 0 20 0 1 0';
  assert.strictEqual(ppidFromStat(stat), 999);
});

test('ppidFromStat parses ppid when the process name itself contains ") (" ', () => {
  // A process name like "my) (weird" would break a naive split(' ')[3] parse
  // (it would grab a piece of the name instead of the ppid). Parsing from the
  // LAST ")" forward sidesteps that entirely.
  const stat = '1234 (my) (weird) S 4321 1234 1234 34816 1235 4194304 100 0 0 0 0 0 0 20 0 1 0';
  assert.strictEqual(ppidFromStat(stat), 4321);
});
