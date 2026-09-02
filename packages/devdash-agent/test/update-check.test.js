const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

// performUpdate() shells out to `npm install -g ...` and fetches the latest
// version from the real registry. Neither is exercised for real here: both
// `child_process.execSync` and `global.fetch` are monkey-patched so this test
// never installs a package or makes a network call. `service-installer`'s
// `repairWatchdog`/`isServiceInstalled`/`isCronInstalled` are patched on the
// same module singleton `update-check.js`'s own `require('./service-installer')`
// resolves to (same absolute path -> same cached module object), so nothing
// here touches the real filesystem, the real crontab, or a real launchd/
// systemd unit either. Everything is restored in `finally`.

test('performUpdate: a throwing repairWatchdog is reported but does not fail (or skip the rest of) the update', async () => {
  const cp = require('node:child_process');
  const originalExecSync = cp.execSync;
  const originalFetch = global.fetch;
  const originalConsoleLog = console.log;
  const originalConsoleError = console.error;

  const logs = [];
  const errors = [];
  console.log = (...args) => { logs.push(args.join(' ')); };
  console.error = (...args) => { errors.push(args.join(' ')); };

  // Simulate `npm install -g @indianic/dialout@<latest> ...` succeeding
  // without actually running it.
  cp.execSync = () => '';

  // Simulate the registry reporting a newer version, so performUpdate() takes
  // the "update available" branch (not the "already up to date" early return).
  global.fetch = async () => ({
    ok: true,
    json: async () => ({ 'dist-tags': { latest: '999.0.0' } }),
  });

  const si = require(path.join(__dirname, '../dist/service-installer.js'));
  const originalRepairWatchdog = si.repairWatchdog;
  const originalIsServiceInstalled = si.isServiceInstalled;
  const originalIsCronInstalled = si.isCronInstalled;

  const thrown = new Error('EACCES: permission denied, open watchdog.sh.bak-2026-08-02T12-00-00-000Z');
  si.repairWatchdog = () => { throw thrown; };
  // Not under test here, and isCronInstalled() would otherwise shell out to
  // the real `crontab -l` — stub both to keep this test fully hermetic.
  si.isServiceInstalled = () => false;
  si.isCronInstalled = () => false;

  try {
    const { performUpdate } = require('../dist/update-check');

    // Must not throw / reject — a failing self-heal must never fail the update.
    await assert.doesNotReject(() => performUpdate());

    assert.ok(
      logs.some((l) => l.includes('Updated to v999.0.0')),
      'update must still report success even though repairWatchdog threw'
    );
    assert.ok(
      errors.some((l) => l.includes('watchdog repair skipped') && l.includes(thrown.message)),
      'a thrown repairWatchdog error must be reported with its message, not swallowed silently'
    );
  } finally {
    cp.execSync = originalExecSync;
    global.fetch = originalFetch;
    si.repairWatchdog = originalRepairWatchdog;
    si.isServiceInstalled = originalIsServiceInstalled;
    si.isCronInstalled = originalIsCronInstalled;
    console.log = originalConsoleLog;
    console.error = originalConsoleError;
  }
});

test('performUpdate: a successful repairWatchdog is reported (baseline — the happy path stays intact)', async () => {
  const cp = require('node:child_process');
  const originalExecSync = cp.execSync;
  const originalFetch = global.fetch;
  const originalConsoleLog = console.log;
  const originalConsoleError = console.error;

  const logs = [];
  const errors = [];
  console.log = (...args) => { logs.push(args.join(' ')); };
  console.error = (...args) => { errors.push(args.join(' ')); };

  cp.execSync = () => '';
  global.fetch = async () => ({
    ok: true,
    json: async () => ({ 'dist-tags': { latest: '999.0.0' } }),
  });

  const si = require(path.join(__dirname, '../dist/service-installer.js'));
  const originalRepairWatchdog = si.repairWatchdog;
  const originalIsServiceInstalled = si.isServiceInstalled;
  const originalIsCronInstalled = si.isCronInstalled;

  si.repairWatchdog = () => ({
    repaired: true,
    from: '/usr/lib/node_modules/dialout/dist/index.js',
    to: '/usr/lib/node_modules/dialout/dist/index.js',
  });
  si.isServiceInstalled = () => false;
  si.isCronInstalled = () => false;

  try {
    const { performUpdate } = require('../dist/update-check');
    await assert.doesNotReject(() => performUpdate());

    assert.ok(logs.some((l) => l.includes('Fixed a stale cron watchdog')));
    assert.strictEqual(errors.some((l) => l.includes('watchdog repair skipped')), false);
  } finally {
    cp.execSync = originalExecSync;
    global.fetch = originalFetch;
    si.repairWatchdog = originalRepairWatchdog;
    si.isServiceInstalled = originalIsServiceInstalled;
    si.isCronInstalled = originalIsCronInstalled;
    console.log = originalConsoleLog;
    console.error = originalConsoleError;
  }
});
