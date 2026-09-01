import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execSync } from 'child_process';

// Public npm. The package used to live on a private registry, which meant
// nobody outside the company could install or self-update it — the single
// hardest blocker to releasing this openly.
const REGISTRY = 'https://registry.npmjs.org';
const PACKAGE_NAME = 'dialout';
const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000; // 4 hours

const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const BOLD = '\x1b[1m';
const NC = '\x1b[0m';

function getLocalVersion(): string {
  try {
    const pkg = JSON.parse(
      fs.readFileSync(path.resolve(__dirname, '../package.json'), 'utf-8')
    );
    return pkg.version;
  } catch {
    return '0.0.0';
  }
}

async function getLatestVersion(): Promise<string | null> {
  try {
    const resp = await fetch(`${REGISTRY}/${PACKAGE_NAME}`, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(5000),
    });
    if (!resp.ok) return null;
    const data = (await resp.json()) as { 'dist-tags'?: { latest?: string } };
    return data['dist-tags']?.latest || null;
  } catch {
    return null;
  }
}

function compareVersions(current: string, latest: string): boolean {
  const c = current.split('.').map(Number);
  const l = latest.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((l[i] || 0) > (c[i] || 0)) return true;
    if ((l[i] || 0) < (c[i] || 0)) return false;
  }
  return false;
}

function getLastCheckFile(): string {
  return path.join(os.homedir(), '.devdash-agent', 'last-update-check');
}

function shouldCheck(): boolean {
  try {
    const lastCheck = fs.readFileSync(getLastCheckFile(), 'utf-8').trim();
    return Date.now() - parseInt(lastCheck, 10) > CHECK_INTERVAL_MS;
  } catch {
    return true;
  }
}

function markChecked(): void {
  try {
    const dir = path.dirname(getLastCheckFile());
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(getLastCheckFile(), String(Date.now()));
  } catch {}
}

export async function checkForUpdate(): Promise<void> {
  if (!shouldCheck()) return;
  markChecked();

  const current = getLocalVersion();
  const latest = await getLatestVersion();

  if (!latest) return;

  if (compareVersions(current, latest)) {
    console.log('');
    console.log(`${YELLOW}╔══════════════════════════════════════════════════════════╗${NC}`);
    console.log(`${YELLOW}║${NC}  ${BOLD}Update available!${NC}  ${current} → ${GREEN}${latest}${NC}                      ${YELLOW}║${NC}`);
    console.log(`${YELLOW}║${NC}                                                          ${YELLOW}║${NC}`);
    console.log(`${YELLOW}║${NC}  Run: ${CYAN}devdash-agent update${NC}                                ${YELLOW}║${NC}`);
    console.log(`${YELLOW}╚══════════════════════════════════════════════════════════╝${NC}`);
    console.log('');
  }
}

export async function performUpdate(): Promise<void> {
  const current = getLocalVersion();
  const latest = await getLatestVersion();

  console.log('');
  console.log(`${BOLD}Dialout Agent Update${NC}`);
  console.log('─'.repeat(40));
  console.log(`  Current version: ${current}`);

  if (!latest) {
    console.log(`  ${YELLOW}Could not reach registry. Check your internet connection.${NC}`);
    console.log('');
    return;
  }

  console.log(`  Latest version:  ${latest}`);

  if (!compareVersions(current, latest)) {
    console.log(`\n  ${GREEN}Already up to date!${NC}`);
    console.log('');
    return;
  }

  console.log(`\n  Updating ${current} → ${GREEN}${latest}${NC}...`);
  console.log('');

  try {
    execSync(
      `npm install -g ${PACKAGE_NAME}@${latest}`,
      { stdio: 'inherit' }
    );
    console.log('');
    console.log(`  ${GREEN}Updated to v${latest}!${NC}`);
    console.log('');

    // Self-heal: a watchdog written by a prior version (or before a package
    // rename) can be left with a SCRIPT= line pointing at the old install.
    // Repair it on every successful upgrade so machines don't need a manual
    // "devdash-agent repair" to notice — this is exactly the incident this
    // release was built to fix (see docs/supervisor-hygiene-2.4.1.md).
    try {
      const { repairWatchdog } = require('./service-installer');
      const { repaired, from, to } = repairWatchdog();
      if (repaired) {
        console.log(`  ${YELLOW}Fixed a stale cron watchdog (was pointing at ${from}):${NC}`);
        console.log(`    now targets ${to}`);
        console.log('');
      }
    } catch (e) {
      // Never let a failed self-heal fail (or roll back) the update itself —
      // but a silent catch here is exactly the class of invisible drift this
      // feature exists to close: a machine whose repair keeps failing (e.g.
      // permission denied on the backup copy, a symlinked watchdog path,
      // disk full) would otherwise print a clean "Updated to vX!" forever,
      // with nothing to show the self-heal never actually landed.
      console.error(`  (watchdog repair skipped: ${(e as Error).message})`);
    }

    // Check if running as service or cron — suggest restart
    try {
      const { isServiceInstalled, isCronInstalled } = require('./service-installer');
      if (isServiceInstalled()) {
        console.log(`  ${YELLOW}Service detected — restart to use new version:${NC}`);
        console.log(`    devdash-agent uninstall-service`);
        console.log(`    devdash-agent install-service`);
        console.log('');
      } else if (isCronInstalled()) {
        console.log(`  ${YELLOW}Cron watchdog will auto-restart with new version.${NC}`);
        console.log(`  Or restart now: devdash-agent stop && devdash-agent start --daemon`);
        console.log('');
      }
    } catch {}
  } catch (err: any) {
    console.error(`  ${YELLOW}Update failed: ${err.message}${NC}`);
    console.error(`  Try manually: npm install -g ${PACKAGE_NAME}`);
    console.log('');
  }
}
