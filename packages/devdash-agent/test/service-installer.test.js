const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
const {
  listSupervisors,
  repairWatchdog,
  getWatchdogScript,
  staleSupervisorAdvice,
} = require('../dist/service-installer');
const { enableLinger, defaultLinuxScope } = require('../dist/service-installer');
const { uninstallService, serviceUser } = require('../dist/service-installer');

// All paths below are synthetic — under a fake homedir that is never touched
// on disk. Every filesystem/process query listSupervisors() makes is
// injected, so these tests never read a real unit file, the real crontab,
// or the real $HOME.

const FAKE_HOME = '/fake/home/testuser';
const CURRENT_AGENT_SCRIPT = '/fake/home/testuser/node_modules/dialout/dist/index.js';
const STALE_AGENT_SCRIPT = '/fake/home/testuser/node_modules/@dialout/devdash/dist/index.js';

const SYSTEMD_SYSTEM_UNIT_PATH = '/etc/systemd/system/dialout.service';
const SYSTEMD_USER_UNIT_PATH = path.join(FAKE_HOME, '.config', 'systemd', 'user', 'dialout.service');
const LAUNCHD_DAEMON_PLIST_PATH = '/Library/LaunchDaemons/com.dialout.agent.plist';
const LAUNCHD_AGENT_PLIST_PATH = path.join(FAKE_HOME, 'Library', 'LaunchAgents', 'com.dialout.agent.plist');
const WATCHDOG_PATH = path.join(FAKE_HOME, '.dialout', 'watchdog.sh');

function unitContent(script) {
  return `[Unit]\nDescription=DevDash Agent\n\n[Service]\nExecStart=/usr/local/bin/node ${script}\nRestart=always\n`;
}

function plistContent(script) {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<plist version="1.0">\n<dict>\n  <key>ProgramArguments</key>\n  <array>\n    <string>/usr/local/bin/node</string>\n    <string>${script}</string>\n  </array>\n</dict>\n</plist>`;
}

function watchdogContent(script) {
  return `#!/bin/bash\n# Dialout Agent Watchdog — auto-restart if not running\nPID_FILE="/fake/home/testuser/.dialout/daemon.pid"\nLOG="/fake/home/testuser/.dialout/logs/watchdog.log"\nNODE="/usr/local/bin/node"\nSCRIPT="${script}"\n`;
}

function makeDeps(overrides = {}) {
  const files = overrides.files || {};
  const existing = new Set(Object.keys(files));
  return {
    platform: overrides.platform ?? 'linux',
    homedir: FAKE_HOME,
    agentScript: overrides.agentScript ?? CURRENT_AGENT_SCRIPT,
    existsSync: (p) => existing.has(p),
    readFileSync: (p) => {
      if (!(p in files)) throw new Error(`ENOENT (fake): ${p}`);
      return files[p];
    },
    launchdPid: overrides.launchdPid ?? ((domain) => {
      if (domain.startsWith('system/')) return 111;
      if (domain.startsWith('gui/')) return 222;
      return null;
    }),
    systemdActive: overrides.systemdActive ?? ((scope) => (
      scope === 'system' ? { active: true, pid: 333 } : { active: true, pid: 444 }
    )),
    isCronInstalled: overrides.isCronInstalled ?? (() => false),
    // Identity by default: none of the fixture paths above are symlinks, so
    // "canonical path" is just the path itself. Tests targeting the
    // realpath-normalization behavior (symlink equivalence, deleted stale
    // targets) override this explicitly.
    realpathSync: overrides.realpathSync ?? ((p) => p),
  };
}

// --- the RED: today getServiceStatus() hides the coexisting second unit ---

test('listSupervisors: system AND user systemd units both present -> 2 entries (getServiceStatus only sees the system one)', () => {
  const deps = makeDeps({
    platform: 'linux',
    files: {
      [SYSTEMD_SYSTEM_UNIT_PATH]: unitContent(CURRENT_AGENT_SCRIPT),
      [SYSTEMD_USER_UNIT_PATH]: unitContent(CURRENT_AGENT_SCRIPT),
    },
  });

  const supervisors = listSupervisors(deps);
  assert.strictEqual(supervisors.length, 2);
  const kinds = supervisors.map((s) => s.kind).sort();
  assert.deepStrictEqual(kinds, ['systemd-system', 'systemd-user']);

  const sys = supervisors.find((s) => s.kind === 'systemd-system');
  assert.strictEqual(sys.path, SYSTEMD_SYSTEM_UNIT_PATH);
  assert.strictEqual(sys.running, true);
  assert.strictEqual(sys.atBoot, true);

  const usr = supervisors.find((s) => s.kind === 'systemd-user');
  assert.strictEqual(usr.path, SYSTEMD_USER_UNIT_PATH);
  assert.strictEqual(usr.running, true);
  assert.strictEqual(usr.atBoot, false);
});

// Note: getServiceStatus() is untouched by this task (verified by `git diff`
// — it doesn't appear in it) and deliberately has no deps injection: it
// queries the real platform/filesystem and is out of scope to call from this
// suite (constraint: never touch real unit files, the real crontab, or the
// real $HOME). Its documented shape (a single `kind: ServiceKind | null`,
// never an array) is what makes it structurally unable to report a second,
// coexisting supervisor — that gap is what listSupervisors() above closes.
// This is asserted by TypeScript's ServiceStatus type, not by a test that
// would have to invoke it for no behavioral reason.

test('listSupervisors: LaunchDaemon AND LaunchAgent both present on darwin -> 2 entries', () => {
  const deps = makeDeps({
    platform: 'darwin',
    files: {
      [LAUNCHD_DAEMON_PLIST_PATH]: plistContent(CURRENT_AGENT_SCRIPT),
      [LAUNCHD_AGENT_PLIST_PATH]: plistContent(CURRENT_AGENT_SCRIPT),
    },
  });

  const supervisors = listSupervisors(deps);
  assert.strictEqual(supervisors.length, 2);
  const kinds = supervisors.map((s) => s.kind).sort();
  assert.deepStrictEqual(kinds, ['launchd-agent', 'launchd-daemon']);

  const daemon = supervisors.find((s) => s.kind === 'launchd-daemon');
  assert.strictEqual(daemon.path, LAUNCHD_DAEMON_PLIST_PATH);
  assert.strictEqual(daemon.running, true);
  assert.strictEqual(daemon.pid, 111);
  assert.strictEqual(daemon.atBoot, true);

  const agent = supervisors.find((s) => s.kind === 'launchd-agent');
  assert.strictEqual(agent.path, LAUNCHD_AGENT_PLIST_PATH);
  assert.strictEqual(agent.running, true);
  assert.strictEqual(agent.pid, 222);
  assert.strictEqual(agent.atBoot, false);
});

test('listSupervisors: one systemd unit + cron installed -> 2 entries, cron entry carries its targetScript', () => {
  const deps = makeDeps({
    platform: 'linux',
    files: {
      [SYSTEMD_USER_UNIT_PATH]: unitContent(CURRENT_AGENT_SCRIPT),
      [WATCHDOG_PATH]: watchdogContent(CURRENT_AGENT_SCRIPT),
    },
    isCronInstalled: () => true,
  });

  const supervisors = listSupervisors(deps);
  assert.strictEqual(supervisors.length, 2);
  const kinds = supervisors.map((s) => s.kind).sort();
  assert.deepStrictEqual(kinds, ['cron', 'systemd-user']);

  const cron = supervisors.find((s) => s.kind === 'cron');
  assert.strictEqual(cron.path, WATCHDOG_PATH);
  assert.strictEqual(cron.targetScript, CURRENT_AGENT_SCRIPT);
  assert.strictEqual(cron.stale, false);
});

test('listSupervisors: watchdog SCRIPT= names the pre-rename package -> stale: true', () => {
  const deps = makeDeps({
    platform: 'linux',
    files: {
      [WATCHDOG_PATH]: watchdogContent(STALE_AGENT_SCRIPT),
    },
    isCronInstalled: () => true,
  });

  const supervisors = listSupervisors(deps);
  assert.strictEqual(supervisors.length, 1);
  const cron = supervisors[0];
  assert.strictEqual(cron.kind, 'cron');
  assert.strictEqual(cron.targetScript, STALE_AGENT_SCRIPT);
  assert.strictEqual(cron.stale, true);
});

test('listSupervisors: watchdog SCRIPT= matches the current agent script -> stale: false', () => {
  const deps = makeDeps({
    platform: 'linux',
    files: {
      [WATCHDOG_PATH]: watchdogContent(CURRENT_AGENT_SCRIPT),
    },
    isCronInstalled: () => true,
  });

  const supervisors = listSupervisors(deps);
  assert.strictEqual(supervisors.length, 1);
  assert.strictEqual(supervisors[0].stale, false);
});

test('listSupervisors: a systemd unit whose ExecStart names a different script is stale too', () => {
  const deps = makeDeps({
    platform: 'linux',
    files: {
      [SYSTEMD_SYSTEM_UNIT_PATH]: unitContent(STALE_AGENT_SCRIPT),
    },
  });

  const supervisors = listSupervisors(deps);
  assert.strictEqual(supervisors.length, 1);
  assert.strictEqual(supervisors[0].stale, true);
  assert.strictEqual(supervisors[0].targetScript, STALE_AGENT_SCRIPT);
});

// --- path normalization (symlinked install roots) ---

test('listSupervisors: symlink-equivalent paths (different literal strings, same realpath) are NOT falsely flagged stale', () => {
  // e.g. a Homebrew-linked npm prefix or `npm link`: the unit's ExecStart and
  // getAgentScript() can each spell the path differently while naming the
  // same real file on disk. A raw string compare would wrongly say "stale".
  const linkedAgentScript = '/fake/home/testuser/.nvm/versions/node/v20/lib/node_modules/dialout/dist/index.js';
  const watchdogSpelling = '/fake/home/testuser/.nvm/current/lib/node_modules/dialout/dist/index.js';
  const canonical = '/fake/home/testuser/.nvm/versions/node/v20/lib/node_modules/.pnpm/@dialout+agent@1.0.0/node_modules/dialout/dist/index.js';

  const deps = makeDeps({
    platform: 'linux',
    agentScript: linkedAgentScript,
    files: {
      [WATCHDOG_PATH]: watchdogContent(watchdogSpelling),
    },
    isCronInstalled: () => true,
    realpathSync: (p) => {
      if (p === linkedAgentScript || p === watchdogSpelling) return canonical;
      throw new Error(`ENOENT (fake): ${p}`);
    },
  });

  const supervisors = listSupervisors(deps);
  assert.strictEqual(supervisors.length, 1);
  assert.strictEqual(supervisors[0].targetScript, watchdogSpelling);
  assert.strictEqual(supervisors[0].stale, false, 'symlink-equivalent paths must not be flagged stale');
});

test('listSupervisors: a stale target whose file no longer exists still reports stale: true (realpath throws, falls back safely)', () => {
  // A stale watchdog by definition may point at a file that was deleted (the
  // pre-rename package uninstalled) — realpathSync throws ENOENT for that.
  // normalizeScriptPath must catch it and fall back to path.resolve(), not
  // let the throw escape listSupervisors(), and the comparison must still
  // come out stale.
  const deps = makeDeps({
    platform: 'linux',
    agentScript: CURRENT_AGENT_SCRIPT,
    files: {
      [WATCHDOG_PATH]: watchdogContent(STALE_AGENT_SCRIPT),
    },
    isCronInstalled: () => true,
    realpathSync: (p) => {
      if (p === CURRENT_AGENT_SCRIPT) return CURRENT_AGENT_SCRIPT;
      // STALE_AGENT_SCRIPT names a file that no longer exists on disk.
      throw new Error(`ENOENT (fake, deleted): ${p}`);
    },
  });

  assert.doesNotThrow(() => listSupervisors(deps));
  const supervisors = listSupervisors(deps);
  assert.strictEqual(supervisors.length, 1);
  assert.strictEqual(supervisors[0].targetScript, STALE_AGENT_SCRIPT);
  assert.strictEqual(supervisors[0].stale, true);
});

test('listSupervisors: nothing installed -> []', () => {
  const deps = makeDeps({ platform: 'linux', files: {} });
  const supervisors = listSupervisors(deps);
  assert.deepStrictEqual(supervisors, []);
});

test('listSupervisors: nothing installed on darwin -> []', () => {
  const deps = makeDeps({ platform: 'darwin', files: {} });
  const supervisors = listSupervisors(deps);
  assert.deepStrictEqual(supervisors, []);
});

// --- repairWatchdog: rewrites a stale ~/.dialout/watchdog.sh ---
//
// Unlike listSupervisors() (fully dependency-injected above), getWatchdogScript()
// and getAgentScript() read os.homedir()/__dirname directly with no deps
// param — this is how the real cron watchdog is generated. To exercise
// repairWatchdog() without ever touching a developer's real $HOME, every test
// below points $HOME at a throwaway directory under the OS tmp dir for the
// duration of the test (os.homedir() consults $HOME on POSIX), and always
// restores it afterward. Nothing here reads or writes the real crontab or the
// real home directory.

// The "correct" agent script path, computed the same way the compiled
// service-installer.js does it (its __dirname is <pkg>/dist; this test
// file's __dirname is <pkg>/test — both resolve to the same <pkg>/dist/index.js).
const REAL_AGENT_SCRIPT = path.resolve(__dirname, '../dist/index.js');
const STALE_PRERENAME_SCRIPT = '/usr/lib/node_modules/@dialout/devdash/dist/index.js';

function withTempHome(fn) {
  return () => {
    const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'devdash-repair-test-'));
    const originalHome = process.env.HOME;
    process.env.HOME = tmpHome;
    try {
      return fn(tmpHome);
    } finally {
      process.env.HOME = originalHome;
      fs.rmSync(tmpHome, { recursive: true, force: true });
    }
  };
}

function watchdogPathIn(tmpHome) {
  return path.join(tmpHome, '.dialout', 'watchdog.sh');
}

test(
  'repairWatchdog: stale SCRIPT= is rewritten in place, backed up first, and matches a fresh generation byte-for-byte',
  withTempHome((tmpHome) => {
    const wdPath = watchdogPathIn(tmpHome);

    // Generate a correct watchdog first (this is what setup-cron would have
    // produced originally) and capture it as our "fresh" reference.
    getWatchdogScript();
    const fresh = fs.readFileSync(wdPath, 'utf-8');
    assert.match(fresh, /^SCRIPT="/m);
    assert.ok(fresh.includes(REAL_AGENT_SCRIPT), 'sanity: freshly generated watchdog targets the real agent script');

    // Simulate the production incident: an old-package SCRIPT= line, as if
    // this watchdog were written before the dialout rename.
    const staleContent = fresh.replace(REAL_AGENT_SCRIPT, STALE_PRERENAME_SCRIPT);
    fs.writeFileSync(wdPath, staleContent, { mode: 0o755 });

    const result = repairWatchdog();

    assert.strictEqual(result.repaired, true);
    assert.strictEqual(result.from, STALE_PRERENAME_SCRIPT);
    assert.strictEqual(result.to, REAL_AGENT_SCRIPT);

    const rewritten = fs.readFileSync(wdPath, 'utf-8');
    assert.match(rewritten, new RegExp(`^SCRIPT="${REAL_AGENT_SCRIPT.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"$`, 'm'));
    assert.strictEqual(rewritten, fresh, 'rewritten body must be byte-identical to a freshly generated watchdog');

    // A backup of the stale (pre-repair) content must exist.
    const dir = path.dirname(wdPath);
    const backups = fs.readdirSync(dir).filter((f) => f.startsWith('watchdog.sh.bak-'));
    assert.strictEqual(backups.length, 1);
    const backupContent = fs.readFileSync(path.join(dir, backups[0]), 'utf-8');
    assert.strictEqual(backupContent, staleContent);

    // The rewritten file must remain a valid, executable cron target.
    const mode = fs.statSync(wdPath).mode & 0o777;
    assert.strictEqual(mode, 0o755);
    assert.doesNotThrow(() => execFileSync('/bin/bash', ['-n', wdPath], { stdio: 'pipe' }));
  })
);

test(
  'repairWatchdog: already-correct watchdog is a no-op — content, mtime, and backup count unchanged',
  withTempHome((tmpHome) => {
    const wdPath = watchdogPathIn(tmpHome);

    getWatchdogScript();
    const before = fs.readFileSync(wdPath, 'utf-8');
    const statBefore = fs.statSync(wdPath);

    const result = repairWatchdog();

    assert.strictEqual(result.repaired, false);

    const after = fs.readFileSync(wdPath, 'utf-8');
    const statAfter = fs.statSync(wdPath);
    assert.strictEqual(after, before, 'content must be untouched when already correct');
    assert.strictEqual(statAfter.mtimeMs, statBefore.mtimeMs, 'mtime must be untouched when already correct');

    const dir = path.dirname(wdPath);
    const backups = fs.readdirSync(dir).filter((f) => f.startsWith('watchdog.sh.bak-'));
    assert.strictEqual(backups.length, 0, 'no backup should be created for an already-correct watchdog');
  })
);

test(
  'repairWatchdog: missing watchdog is a no-op — nothing created',
  withTempHome((tmpHome) => {
    const wdPath = watchdogPathIn(tmpHome);

    const result = repairWatchdog();

    assert.strictEqual(result.repaired, false);
    assert.strictEqual(fs.existsSync(wdPath), false);
    assert.strictEqual(fs.existsSync(path.dirname(wdPath)), false, 'repair must not create ~/.dialout when there was nothing to repair');
  })
);

test(
  'repairWatchdog: two repairs in immediate succession never collide on the backup filename',
  withTempHome((tmpHome) => {
    const wdPath = watchdogPathIn(tmpHome);
    const dir = path.dirname(wdPath);

    getWatchdogScript();
    const fresh = fs.readFileSync(wdPath, 'utf-8');

    // First incident + repair.
    fs.writeFileSync(wdPath, fresh.replace(REAL_AGENT_SCRIPT, STALE_PRERENAME_SCRIPT), { mode: 0o755 });
    const r1 = repairWatchdog();
    assert.strictEqual(r1.repaired, true);

    // Re-introduce staleness immediately (no delay) and repair again, back to back.
    const afterFirst = fs.readFileSync(wdPath, 'utf-8');
    fs.writeFileSync(wdPath, afterFirst.replace(REAL_AGENT_SCRIPT, '/another/stale/path/index.js'), { mode: 0o755 });
    const r2 = repairWatchdog();
    assert.strictEqual(r2.repaired, true);

    const backups = fs.readdirSync(dir).filter((f) => f.startsWith('watchdog.sh.bak-'));
    assert.strictEqual(backups.length, 2, 'each repair must produce its own backup file, never overwrite the previous one');
  })
);

// --- review fix: writeFileSync({mode}) does not re-apply permissions to an
// already-existing file (POSIX ignores `mode` when O_CREAT hits an existing
// path) — so a watchdog that lost its executable bit before repair (a
// hardening scan, a backup/restore tool, a manual `chmod 644` while
// debugging) used to come out of repairWatchdog() non-executable despite
// `repaired: true`. Fixed two ways: getWatchdogScript() now writes via a
// temp-file-then-rename (rename carries the temp file's mode, replacing
// whatever the old target had), and repairWatchdog() also chmods explicitly
// as a second, independent guarantee.

test(
  'getWatchdogScript: rewriting a watchdog that had lost its executable bit (chmod 644) restores 0755',
  withTempHome((tmpHome) => {
    const wdPath = watchdogPathIn(tmpHome);

    getWatchdogScript();
    fs.chmodSync(wdPath, 0o644);
    assert.strictEqual(fs.statSync(wdPath).mode & 0o777, 0o644, 'sanity: fixture really is non-executable before the call under test');

    // Call the generator directly (not through repairWatchdog) — this proves
    // the write-then-rename mechanism itself fixes the mode, independent of
    // repairWatchdog()'s additional explicit chmodSync.
    getWatchdogScript();

    assert.strictEqual(fs.statSync(wdPath).mode & 0o777, 0o755, 'getWatchdogScript() must restore the executable bit even when rewriting an existing, non-executable file');

    // The atomic write must not leave its temp file behind, win or lose.
    const dir = path.dirname(wdPath);
    const leftoverTmp = fs.readdirSync(dir).filter((f) => f.includes('.tmp-'));
    assert.deepStrictEqual(leftoverTmp, [], 'no temp file should be left behind after a successful write-then-rename');
  })
);

test(
  'repairWatchdog: a stale watchdog that had lost its executable bit (chmod 644) is 0755 after repair',
  withTempHome((tmpHome) => {
    const wdPath = watchdogPathIn(tmpHome);

    getWatchdogScript();
    const fresh = fs.readFileSync(wdPath, 'utf-8');
    fs.writeFileSync(wdPath, fresh.replace(REAL_AGENT_SCRIPT, STALE_PRERENAME_SCRIPT));
    fs.chmodSync(wdPath, 0o644);
    assert.strictEqual(fs.statSync(wdPath).mode & 0o777, 0o644, 'sanity: fixture really is non-executable and stale before repair');

    const result = repairWatchdog();

    assert.strictEqual(result.repaired, true);
    assert.strictEqual(fs.statSync(wdPath).mode & 0o777, 0o755, 'repairWatchdog() must restore the executable bit, not just the SCRIPT= path');
    assert.doesNotThrow(() => execFileSync('/bin/bash', ['-n', wdPath], { stdio: 'pipe' }));
  })
);

// --- staleSupervisorAdvice: kind-specific next-step advice ---
//
// `repair` (src/cli.ts) only ever rewrites the cron watchdog's SCRIPT= path —
// repairWatchdog() above touches nothing else. Before this fix, both `status`
// and `repair` told the operator to run "dialout repair" for ANY stale
// supervisor, including a stale launchd/systemd unit repair can never touch —
// a dead end straight out of the production incident this release exists to
// fix. install-service regenerates a unit's ExecStart/ProgramArguments from
// the current getAgentScript() on every install (installMacOSAgent/
// installMacOSDaemon/installLinuxUser/installLinuxSystem above all do a full
// writeFileSync/copyFileSync over any existing file — see each function),
// so re-running the matching install-service variant is the correct fix for
// a stale unit; uninstall-service is offered as the alternative when the
// unit is a redundant extra supervisor rather than the one to keep.

test('staleSupervisorAdvice: cron kind keeps pointing at "dialout repair" (repair really does fix this one)', () => {
  const advice = staleSupervisorAdvice({
    kind: 'cron',
    path: WATCHDOG_PATH,
    running: true,
    pid: null,
    atBoot: false,
    targetScript: STALE_AGENT_SCRIPT,
    stale: true,
  });
  assert.match(advice.join('\n'), /dialout repair/);
});

test('staleSupervisorAdvice: stale systemd-user unit does NOT tell the operator to run "dialout repair"', () => {
  const advice = staleSupervisorAdvice({
    kind: 'systemd-user',
    path: SYSTEMD_USER_UNIT_PATH,
    running: true,
    pid: 444,
    atBoot: false,
    targetScript: STALE_AGENT_SCRIPT,
    stale: true,
  });
  const text = advice.join('\n');
  assert.doesNotMatch(text, /dialout repair\b/, 'repair cannot fix a unit file — this is the exact dead-end being fixed');
  assert.match(text, /dialout install-service/);
  assert.doesNotMatch(text, /install-service --system/, 'a login-kind (atBoot: false) unit must not be told to use --system');
});

test('staleSupervisorAdvice: stale systemd-system (boot) unit points at install-service --system', () => {
  const advice = staleSupervisorAdvice({
    kind: 'systemd-system',
    path: SYSTEMD_SYSTEM_UNIT_PATH,
    running: true,
    pid: 333,
    atBoot: true,
    targetScript: STALE_AGENT_SCRIPT,
    stale: true,
  });
  const text = advice.join('\n');
  assert.doesNotMatch(text, /dialout repair\b/);
  assert.match(text, /dialout install-service --system/);
});

test('staleSupervisorAdvice: stale launchd-agent (login) unit points at install-service without --system', () => {
  const advice = staleSupervisorAdvice({
    kind: 'launchd-agent',
    path: LAUNCHD_AGENT_PLIST_PATH,
    running: true,
    pid: 222,
    atBoot: false,
    targetScript: STALE_AGENT_SCRIPT,
    stale: true,
  });
  const text = advice.join('\n');
  assert.doesNotMatch(text, /dialout repair\b/);
  assert.match(text, /dialout install-service/);
  assert.doesNotMatch(text, /--system/);
});

test('staleSupervisorAdvice: stale launchd-daemon (boot) unit points at install-service --system', () => {
  const advice = staleSupervisorAdvice({
    kind: 'launchd-daemon',
    path: LAUNCHD_DAEMON_PLIST_PATH,
    running: true,
    pid: 111,
    atBoot: true,
    targetScript: STALE_AGENT_SCRIPT,
    stale: true,
  });
  const text = advice.join('\n');
  assert.doesNotMatch(text, /dialout repair\b/);
  assert.match(text, /dialout install-service --system/);
});

test('staleSupervisorAdvice: unit advice also mentions uninstall-service as the alternative when the unit is redundant', () => {
  const advice = staleSupervisorAdvice({
    kind: 'systemd-user',
    path: SYSTEMD_USER_UNIT_PATH,
    running: true,
    pid: 444,
    atBoot: false,
    targetScript: STALE_AGENT_SCRIPT,
    stale: true,
  });
  assert.match(advice.join('\n'), /uninstall-service/);
});

// --- systemd user units and lingering ---
//
// Regression, found live on an Ubuntu 24.04 server: `install-service` had
// installed a systemd USER unit for root. systemd-logind stops
// user@<uid>.service when the user's last session ends, so the agent was torn
// down on every SSH logout. The journal showed it plainly — user manager
// PID 1467054 stopped the unit at 08:12:56, a NEW manager (1467396) started a
// fresh one at the next login. `loginctl show-user root` reported Linger=no,
// while the working server had a system unit in system.slice and Linger=yes.

test('installing as root picks the system unit, not the per-user one', () => {
  // As root the boot unit needs no sudo password and cannot be reached by a
  // logout — there is no trade-off to present to the user.
  assert.strictEqual(defaultLinuxScope({ isRoot: () => true }), 'system');
});

test('installing as a normal user still picks the per-user unit', () => {
  assert.strictEqual(defaultLinuxScope({ isRoot: () => false }), 'user');
});

test('lingering is enabled when it is off', () => {
  const calls = [];
  let enabled = false;
  const result = enableLinger('root', {
    isEnabled: () => enabled,
    run: (cmd) => { calls.push(cmd); enabled = true; },
  });
  assert.deepStrictEqual(calls, ['loginctl enable-linger root']);
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.alreadyOn, false);
});

test('lingering already on is a no-op, not a second enable', () => {
  const calls = [];
  const result = enableLinger('root', { isEnabled: () => true, run: (cmd) => calls.push(cmd) });
  assert.deepStrictEqual(calls, []);
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.alreadyOn, true);
});

test('a refused enable-linger reports failure instead of claiming success', () => {
  // Non-root without polkit rights. The unit is still installed and usable
  // while logged in, so this must surface as a warning the caller can print —
  // never as a silent success that leaves the user with a logout-fragile
  // service and no idea why the agent keeps vanishing.
  const result = enableLinger('deploy', {
    isEnabled: () => false,
    run: () => { throw new Error('Access denied'); },
  });
  assert.strictEqual(result.ok, false);
  assert.match(result.error, /Access denied/);
});

test('enable-linger that silently does nothing is caught by re-checking', () => {
  // The command exits 0 but lingering is still off — verify, do not trust.
  const result = enableLinger('deploy', { isEnabled: () => false, run: () => {} });
  assert.strictEqual(result.ok, false);
  assert.match(result.error, /still off/);
});


// --- uninstallService: the sudo asymmetry (the "it says done but it's still
// --- running" bug) ---
//
// install-service --system escalates through an interactive sudo, so the
// ordinary way to get a LaunchDaemon is to have never been root. uninstall had
// no such branch: as non-root it printed sudo instructions, removed nothing,
// and STILL set removed = true — so it exited 0 with no error while the daemon
// kept running and kept coming back at every boot. Measured on a real machine:
// /Library/LaunchDaemons/com.dialout.agent.plist present, launchctl reporting
// state = running, after uninstall-service had reported success.

const DAEMON_PLIST = '/Library/LaunchDaemons/com.dialout.agent.plist';
const SYSTEM_UNIT = '/etc/systemd/system/dialout.service';

function uninstallHarness({ platform, present, isRoot, canPromptSudo, failCmd = false }) {
  const ran = [];
  const logs = [];
  const result = uninstallService({
    platform,
    existsSync: (p) => present.includes(p),
    isRoot: () => isRoot,
    canPromptSudo: () => canPromptSudo,
    run: (cmd) => { ran.push(cmd); if (failCmd) throw new Error('command failed'); },
    log: (m) => logs.push(m),
  });
  return { result, ran, logs: logs.join('\n') };
}

test('uninstallService escalates via sudo for a root-owned LaunchDaemon, as install does', () => {
  const h = uninstallHarness({
    platform: 'darwin', present: [DAEMON_PLIST], isRoot: false, canPromptSudo: true,
  });
  assert.strictEqual(h.ran.length, 1, 'must actually run a command, not just print one');
  assert.match(h.ran[0], /^sudo bash -c /, 'non-root removal must go through sudo');
  assert.match(h.ran[0], /launchctl bootout system "\/Library\/LaunchDaemons\/com\.dialout\.agent\.plist"/);
  assert.match(h.ran[0], /rm -f "\/Library\/LaunchDaemons\/com\.dialout\.agent\.plist"/);
  assert.strictEqual(h.result.removed, true);
  assert.deepStrictEqual(h.result.pending, []);
});

test('uninstallService removes the LaunchDaemon directly when already root (no sudo)', () => {
  const h = uninstallHarness({
    platform: 'darwin', present: [DAEMON_PLIST], isRoot: true, canPromptSudo: false,
  });
  assert.strictEqual(h.ran.length, 1);
  assert.doesNotMatch(h.ran[0], /sudo/, 'root must not shell out to sudo');
  assert.strictEqual(h.result.removed, true);
});

test('uninstallService reports NOT removed when it cannot escalate (the regression)', () => {
  // No TTY to prompt on: nothing can be removed. This is the case that used to
  // claim success.
  const h = uninstallHarness({
    platform: 'darwin', present: [DAEMON_PLIST], isRoot: false, canPromptSudo: false,
  });
  assert.strictEqual(h.ran.length, 0, 'nothing can run without root or a TTY');
  assert.strictEqual(h.result.removed, false, 'removed must be FALSE when nothing was removed');
  assert.ok(h.result.pending.length > 0, 'the manual steps must be reported back to the caller');
  assert.match(h.logs, /Could not remove the boot service/);
  assert.doesNotMatch(h.logs, /Service not installed\./, 'it IS installed — never say otherwise');
});

test('uninstallService reports NOT removed when the sudo command itself fails', () => {
  const h = uninstallHarness({
    platform: 'darwin', present: [DAEMON_PLIST], isRoot: false, canPromptSudo: true, failCmd: true,
  });
  assert.strictEqual(h.result.removed, false, 'a failed sudo must not count as removed');
  assert.ok(h.result.pending.length > 0);
});

test('uninstallService on a clean machine says not installed and removes nothing', () => {
  const h = uninstallHarness({
    platform: 'darwin', present: [], isRoot: false, canPromptSudo: true,
  });
  assert.strictEqual(h.ran.length, 0);
  assert.deepStrictEqual(h.result, { removed: false, pending: [] });
  assert.match(h.logs, /Service not installed\./);
});

test('uninstallService escalates for a systemd SYSTEM unit too', () => {
  const h = uninstallHarness({
    platform: 'linux', present: [SYSTEM_UNIT], isRoot: false, canPromptSudo: true,
  });
  assert.strictEqual(h.ran.length, 1);
  assert.match(h.ran[0], /^sudo bash -c /);
  assert.match(h.ran[0], /systemctl disable --now dialout/);
  assert.match(h.ran[0], /rm -f "\/etc\/systemd\/system\/dialout\.service"/);
  assert.match(h.ran[0], /systemctl daemon-reload/);
  assert.strictEqual(h.result.removed, true);
});

test('uninstallService reports NOT removed for a systemd system unit it cannot escalate for', () => {
  const h = uninstallHarness({
    platform: 'linux', present: [SYSTEM_UNIT], isRoot: false, canPromptSudo: false,
  });
  assert.strictEqual(h.ran.length, 0);
  assert.strictEqual(h.result.removed, false);
  assert.ok(h.result.pending.some((c) => c.includes('systemctl disable --now')));
});


// --- serviceUser: a boot service must run as the HUMAN, never as root ---
//
// os.userInfo() reports the EFFECTIVE user, so `sudo dialout
// install-service --system` wrote UserName=root into the plist. tmux keys its
// socket by uid (/tmp/tmux-<uid>/default), so a root daemon looks in
// /tmp/tmux-0, finds no server, and listSessions() returns [] through a silent
// catch. The agent then connects, authenticates, and reports an empty session
// list forever: online and healthy-looking, but completely blind. Measured
// against machine 2 in production — every terminal_sessions row has
// tmux_name = NULL going back to May, while the API key's last_used_at keeps
// advancing.

test('serviceUser prefers SUDO_USER, so a sudo install does not bake in root', () => {
  assert.strictEqual(serviceUser({ SUDO_USER: 'sandeep' }, () => 'root'), 'sandeep');
});

test('serviceUser falls back to the effective user when not under sudo', () => {
  assert.strictEqual(serviceUser({}, () => 'indianic'), 'indianic');
});

test('serviceUser ignores a SUDO_USER of root rather than trusting it', () => {
  // Some shells and `sudo -u root sudo ...` set SUDO_USER=root. That is not a
  // human whose tmux we could ever manage, so fall through instead.
  assert.strictEqual(serviceUser({ SUDO_USER: 'root' }, () => 'indianic'), 'indianic');
});

test('serviceUser ignores an empty or whitespace-only SUDO_USER', () => {
  assert.strictEqual(serviceUser({ SUDO_USER: '' }, () => 'indianic'), 'indianic');
  assert.strictEqual(serviceUser({ SUDO_USER: '   ' }, () => 'indianic'), 'indianic');
});

test('serviceUser trims a padded SUDO_USER rather than emitting it into the plist', () => {
  // The value is interpolated straight into <string>…</string> / User=…, so a
  // stray newline or space would produce a unit file naming a user that does
  // not exist.
  assert.strictEqual(serviceUser({ SUDO_USER: '  sandeep  ' }, () => 'root'), 'sandeep');
});
