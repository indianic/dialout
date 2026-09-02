"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkForUpdate = checkForUpdate;
exports.performUpdate = performUpdate;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const os = __importStar(require("os"));
const child_process_1 = require("child_process");
const config_1 = require("./config");
// Public npm. The package used to live on a private registry, which meant
// nobody outside the company could install or self-update it — the single
// hardest blocker to releasing this openly.
const REGISTRY = 'https://registry.npmjs.org';
// The npm package name, which is NOT the command name: the binary stays
// `dialout` so nothing a user types changes, while the package moved under
// the organisation's scope.
const PACKAGE_NAME = '@indianic/dialout';
const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000; // 4 hours
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const BOLD = '\x1b[1m';
const NC = '\x1b[0m';
function getLocalVersion() {
    try {
        const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../package.json'), 'utf-8'));
        return pkg.version;
    }
    catch {
        return '0.0.0';
    }
}
async function getLatestVersion() {
    try {
        const resp = await fetch(`${REGISTRY}/${PACKAGE_NAME}`, {
            headers: { accept: 'application/json' },
            signal: AbortSignal.timeout(5000),
        });
        if (!resp.ok)
            return null;
        const data = (await resp.json());
        return data['dist-tags']?.latest || null;
    }
    catch {
        return null;
    }
}
function compareVersions(current, latest) {
    const c = current.split('.').map(Number);
    const l = latest.split('.').map(Number);
    for (let i = 0; i < 3; i++) {
        if ((l[i] || 0) > (c[i] || 0))
            return true;
        if ((l[i] || 0) < (c[i] || 0))
            return false;
    }
    return false;
}
function getLastCheckFile() {
    return path.join((0, config_1.configDirFor)(os.homedir()), 'last-update-check');
}
function shouldCheck() {
    try {
        const lastCheck = fs.readFileSync(getLastCheckFile(), 'utf-8').trim();
        return Date.now() - parseInt(lastCheck, 10) > CHECK_INTERVAL_MS;
    }
    catch {
        return true;
    }
}
function markChecked() {
    try {
        const dir = path.dirname(getLastCheckFile());
        if (!fs.existsSync(dir))
            fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(getLastCheckFile(), String(Date.now()));
    }
    catch { }
}
async function checkForUpdate() {
    if (!shouldCheck())
        return;
    markChecked();
    const current = getLocalVersion();
    const latest = await getLatestVersion();
    if (!latest)
        return;
    if (compareVersions(current, latest)) {
        console.log('');
        console.log(`${YELLOW}╔══════════════════════════════════════════════════════════╗${NC}`);
        console.log(`${YELLOW}║${NC}  ${BOLD}Update available!${NC}  ${current} → ${GREEN}${latest}${NC}                      ${YELLOW}║${NC}`);
        console.log(`${YELLOW}║${NC}                                                          ${YELLOW}║${NC}`);
        console.log(`${YELLOW}║${NC}  Run: ${CYAN}dialout update${NC}                                ${YELLOW}║${NC}`);
        console.log(`${YELLOW}╚══════════════════════════════════════════════════════════╝${NC}`);
        console.log('');
    }
}
async function performUpdate() {
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
        (0, child_process_1.execSync)(`npm install -g ${PACKAGE_NAME}@${latest}`, { stdio: 'inherit' });
        console.log('');
        console.log(`  ${GREEN}Updated to v${latest}!${NC}`);
        console.log('');
        // Self-heal: a watchdog written by a prior version (or before a package
        // rename) can be left with a SCRIPT= line pointing at the old install.
        // Repair it on every successful upgrade so machines don't need a manual
        // "dialout repair" to notice — this is exactly the incident this
        // release was built to fix (see docs/supervisor-hygiene-2.4.1.md).
        try {
            const { repairWatchdog } = require('./service-installer');
            const { repaired, from, to } = repairWatchdog();
            if (repaired) {
                console.log(`  ${YELLOW}Fixed a stale cron watchdog (was pointing at ${from}):${NC}`);
                console.log(`    now targets ${to}`);
                console.log('');
            }
        }
        catch (e) {
            // Never let a failed self-heal fail (or roll back) the update itself —
            // but a silent catch here is exactly the class of invisible drift this
            // feature exists to close: a machine whose repair keeps failing (e.g.
            // permission denied on the backup copy, a symlinked watchdog path,
            // disk full) would otherwise print a clean "Updated to vX!" forever,
            // with nothing to show the self-heal never actually landed.
            console.error(`  (watchdog repair skipped: ${e.message})`);
        }
        // Check if running as service or cron — suggest restart
        try {
            const { isServiceInstalled, isCronInstalled } = require('./service-installer');
            if (isServiceInstalled()) {
                console.log(`  ${YELLOW}Service detected — restart to use new version:${NC}`);
                console.log(`    dialout uninstall-service`);
                console.log(`    dialout install-service`);
                console.log('');
            }
            else if (isCronInstalled()) {
                console.log(`  ${YELLOW}Cron watchdog will auto-restart with new version.${NC}`);
                console.log(`  Or restart now: dialout stop && dialout start --daemon`);
                console.log('');
            }
        }
        catch { }
    }
    catch (err) {
        console.error(`  ${YELLOW}Update failed: ${err.message}${NC}`);
        console.error(`  Try manually: npm install -g ${PACKAGE_NAME}`);
        console.log('');
    }
}
//# sourceMappingURL=update-check.js.map