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
exports.serviceUser = serviceUser;
exports.isLingerEnabled = isLingerEnabled;
exports.enableLinger = enableLinger;
exports.defaultLinuxScope = defaultLinuxScope;
exports.installService = installService;
exports.uninstallService = uninstallService;
exports.isServiceInstalled = isServiceInstalled;
exports.getServiceStatus = getServiceStatus;
exports.getWatchdogScript = getWatchdogScript;
exports.installCron = installCron;
exports.uninstallCron = uninstallCron;
exports.isCronInstalled = isCronInstalled;
exports.listSupervisors = listSupervisors;
exports.staleSupervisorAdvice = staleSupervisorAdvice;
exports.repairWatchdog = repairWatchdog;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const os = __importStar(require("os"));
const child_process_1 = require("child_process");
const SERVICE_NAME = 'com.devdash.agent';
const SYSTEMD_UNIT = 'devdash-agent';
function getNodePath() {
    try {
        return (0, child_process_1.execSync)('which node', { encoding: 'utf-8' }).trim();
    }
    catch {
        return '/usr/local/bin/node';
    }
}
function getAgentScript() {
    return path.resolve(__dirname, '../dist/index.js');
}
// The human the boot service must run AS.
//
// os.userInfo() reports the EFFECTIVE user, so under `sudo devdash-agent
// install-service --system` it returns "root" — and a plist with
// UserName=root gives the daemon root's HOME and root's tmux socket
// (/tmp/tmux-0), where the user's sessions do not exist. The agent then
// connects, authenticates, and reports an empty session list forever, which
// looks exactly like "nothing is running". sudo exports the original login
// name in SUDO_USER, so prefer it.
function serviceUser(env = process.env, info = () => os.userInfo().username) {
    const sudoUser = (env.SUDO_USER || '').trim();
    if (sudoUser && sudoUser !== 'root')
        return sudoUser;
    return info();
}
function isRoot() {
    return typeof process.getuid === 'function' && process.getuid() === 0;
}
// We can drive an interactive `sudo` password prompt only on a real terminal.
function canPromptSudo() {
    return Boolean(process.stdin.isTTY && process.stdout.isTTY);
}
// Run a privileged command the way the INSTALL path already does: directly when
// root, otherwise through an interactive sudo, otherwise not at all.
//
// uninstall used to have no sudo branch — only isRoot() and "here are the
// commands, run them yourself". Since install-service --system escalates
// happily, the normal way to end up with a LaunchDaemon is to never have been
// root, and then uninstall-service could not remove what install-service had
// just installed. Worse, it set removed = true on that branch, so it printed
// no failure and exited 0 while the daemon kept running and kept restarting at
// boot. Returns whether the command actually ran.
function runPrivileged(cmd, deps = {}) {
    const root = deps.isRoot ?? isRoot;
    const prompt = deps.canPromptSudo ?? canPromptSudo;
    const run = deps.run ?? ((c, o) => { (0, child_process_1.execSync)(c, o); });
    const log = deps.log ?? console.log;
    if (root()) {
        try {
            run(cmd);
            return true;
        }
        catch {
            return false;
        }
    }
    if (prompt()) {
        log('Removing the boot service requires admin rights — you may be prompted for your password.\n');
        try {
            run(`sudo bash -c '${cmd}'`, { stdio: 'inherit' });
            return true;
        }
        catch {
            return false;
        }
    }
    return false;
}
// --- macOS (launchd) ---
function getLaunchdPlistPath(homedir = os.homedir()) {
    // Per-user LaunchAgent — starts at login.
    return path.join(homedir, 'Library', 'LaunchAgents', `${SERVICE_NAME}.plist`);
}
function getLaunchDaemonPlistPath() {
    // System LaunchDaemon — starts at boot, before login.
    return `/Library/LaunchDaemons/${SERVICE_NAME}.plist`;
}
function generatePlist(system) {
    const nodePath = getNodePath();
    const script = getAgentScript();
    const logDir = path.join(os.homedir(), '.devdash-agent', 'logs');
    if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
    }
    // A system daemon runs as root by default; pin it to the invoking user so it
    // can read ~/.devdash-agent/config.json and write the user's log dir.
    const userKey = system
        ? `  <key>UserName</key>\n  <string>${serviceUser()}</string>\n`
        : '';
    return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${SERVICE_NAME}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${nodePath}</string>
    <string>${script}</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:${path.dirname(nodePath)}</string>
    <!-- launchd sets no locale at all, and tmux sanitizes the \x1f separator in
         its -F output to '_' outside a UTF-8 locale, which made list-sessions
         unparseable and the agent report zero terminals. tmux-manager forces
         this per-spawn too; setting it here keeps the daemon's whole
         environment honest for anything else that shells out. -->
    <key>LC_ALL</key>
    <string>C.UTF-8</string>
  </dict>
${userKey}  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>ThrottleInterval</key>
  <integer>5</integer>
  <key>StandardOutPath</key>
  <string>${logDir}/stdout.log</string>
  <key>StandardErrorPath</key>
  <string>${logDir}/stderr.log</string>
  <key>WorkingDirectory</key>
  <string>${os.homedir()}</string>
</dict>
</plist>`;
}
// Remove the per-user LaunchAgent (used when switching to a system daemon).
function removeLaunchAgent() {
    const plistPath = getLaunchdPlistPath();
    if (fs.existsSync(plistPath)) {
        try {
            (0, child_process_1.execSync)(`launchctl unload ${plistPath}`);
        }
        catch { /* may not be loaded */ }
        fs.unlinkSync(plistPath);
    }
}
function installMacOSAgent() {
    const plistPath = getLaunchdPlistPath();
    const dir = path.dirname(plistPath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    // Reload cleanly so an existing service picks up the new plist.
    try {
        (0, child_process_1.execSync)(`launchctl unload ${plistPath} 2>/dev/null`);
    }
    catch { /* not loaded */ }
    fs.writeFileSync(plistPath, generatePlist(false));
    (0, child_process_1.execSync)(`launchctl load ${plistPath}`);
    console.log(`Service installed: ${plistPath}`);
    console.log('The agent will start automatically on login.');
}
function installMacOSDaemon() {
    const target = getLaunchDaemonPlistPath();
    const staging = path.join(os.homedir(), '.devdash-agent', `${SERVICE_NAME}.plist`);
    fs.writeFileSync(staging, generatePlist(true));
    // A system daemon and a per-user agent share a Label — drop the agent first.
    removeLaunchAgent();
    if (isRoot()) {
        fs.copyFileSync(staging, target);
        (0, child_process_1.execSync)(`chown root:wheel ${target}`);
        (0, child_process_1.execSync)(`chmod 644 ${target}`);
        try {
            (0, child_process_1.execSync)(`launchctl bootout system ${target} 2>/dev/null`);
        }
        catch { /* not loaded */ }
        try {
            (0, child_process_1.execSync)(`launchctl bootstrap system ${target}`);
        }
        catch {
            (0, child_process_1.execSync)(`launchctl load ${target}`); // older macOS fallback
        }
        console.log(`System service installed: ${target}`);
        console.log('The agent will start at boot, before login.');
    }
    else if (canPromptSudo()) {
        console.log('Boot service requires admin rights — you may be prompted for your password.\n');
        try {
            (0, child_process_1.execSync)(`sudo bash -c 'cp "${staging}" "${target}" && chown root:wheel "${target}" && chmod 644 "${target}" && { launchctl bootout system "${target}" 2>/dev/null; launchctl bootstrap system "${target}"; }'`, { stdio: 'inherit' });
            console.log(`\nSystem service installed: ${target}`);
            console.log(`The agent will start at boot, before login (as user "${serviceUser()}").`);
            console.log('Verify with: devdash-agent status');
        }
        catch {
            console.error('\nsudo install failed. Run these commands manually:');
            printMacDaemonSudoSteps(staging, target);
        }
    }
    else {
        console.log('Boot-before-login requires root. Run these commands:');
        printMacDaemonSudoSteps(staging, target);
    }
}
function printMacDaemonSudoSteps(staging, target) {
    console.log('');
    console.log(`  sudo cp ${staging} ${target}`);
    console.log(`  sudo chown root:wheel ${target}`);
    console.log(`  sudo chmod 644 ${target}`);
    console.log(`  sudo launchctl bootstrap system ${target}`);
    console.log('');
    console.log(`Then it runs at boot as user "${serviceUser()}". Verify: devdash-agent status`);
}
function uninstallMacOS(deps = {}) {
    const exists = deps.existsSync ?? fs.existsSync;
    const log = deps.log ?? console.log;
    let removed = false;
    const pending = [];
    // System daemon (install-service --system). Needs root to remove, exactly as
    // it needed root to install — so escalate the same way install does.
    const daemonPath = getLaunchDaemonPlistPath();
    if (exists(daemonPath)) {
        const cmd = `launchctl bootout system "${daemonPath}" 2>/dev/null; `
            + `launchctl unload "${daemonPath}" 2>/dev/null; `
            + `rm -f "${daemonPath}"`;
        if (runPrivileged(cmd, deps)) {
            log('System service uninstalled.');
            removed = true;
        }
        else {
            // NOT removed. Say so plainly and leave removed false, so the caller can
            // exit non-zero instead of reporting a success that did not happen.
            log('\nCould not remove the boot service automatically. Run:\n');
            log(`  sudo launchctl bootout system ${daemonPath}`);
            log(`  sudo rm ${daemonPath}\n`);
            pending.push(`sudo launchctl bootout system ${daemonPath}`, `sudo rm ${daemonPath}`);
        }
    }
    // Per-user agent — owned by this user, so no escalation is ever needed.
    const agentPath = getLaunchdPlistPath();
    if (exists(agentPath)) {
        removeLaunchAgent();
        log('Service uninstalled.');
        removed = true;
    }
    if (!removed && pending.length === 0)
        log('Service not installed.');
    return { removed, pending };
}
// Returns the running PID of a launchd job, or null if loaded-but-stopped / absent.
function launchdPid(domainTarget) {
    try {
        const out = (0, child_process_1.execSync)(`launchctl print ${domainTarget} 2>/dev/null`, { encoding: 'utf-8' });
        const m = out.match(/\bpid\s*=\s*(\d+)/);
        return m ? parseInt(m[1], 10) : null;
    }
    catch {
        return null;
    }
}
// --- Linux (systemd) ---
function getSystemdUnitPath(homedir = os.homedir()) {
    return path.join(homedir, '.config', 'systemd', 'user', `${SYSTEMD_UNIT}.service`);
}
function getSystemdSystemUnitPath() {
    return `/etc/systemd/system/${SYSTEMD_UNIT}.service`;
}
function generateSystemdUnit(system) {
    const nodePath = getNodePath();
    const script = getAgentScript();
    const userLine = system ? `User=${serviceUser()}\n` : '';
    return `[Unit]
Description=Dialout Agent
After=network-online.target
Wants=network-online.target

[Service]
${userLine}ExecStart=${nodePath} ${script}
# systemd, like launchd, starts a unit with no locale. tmux mangles the \x1f
# field separator in its -F output to '_' outside a UTF-8 locale, which makes
# list-sessions unparseable and the agent report zero terminals.
Environment=LC_ALL=C.UTF-8
Restart=always
RestartSec=5
Environment=NODE_ENV=production

[Install]
WantedBy=${system ? 'multi-user.target' : 'default.target'}
`;
}
function isLingerEnabled(user) {
    try {
        return /Linger=yes/i.test((0, child_process_1.execSync)(`loginctl show-user ${user}`, { encoding: 'utf-8', stdio: 'pipe' }));
    }
    catch {
        return false; // no such user record yet — enable-linger creates one
    }
}
function enableLinger(user, deps = {}) {
    const isEnabled = deps.isEnabled ?? isLingerEnabled;
    const run = deps.run ?? ((cmd) => { (0, child_process_1.execSync)(cmd, { stdio: 'pipe' }); });
    if (isEnabled(user))
        return { ok: true, alreadyOn: true };
    try {
        run(`loginctl enable-linger ${user}`);
    }
    catch (err) {
        // Non-root without polkit rights lands here. The unit is still installed
        // and works while logged in, so this is a warning, not an install failure.
        return { ok: false, alreadyOn: false, error: err?.message || 'enable-linger failed' };
    }
    return { ok: isEnabled(user), alreadyOn: false, error: isEnabled(user) ? undefined : 'enable-linger reported success but lingering is still off' };
}
function defaultLinuxScope(deps = {}) {
    const root = deps.isRoot ?? isRoot;
    return root() ? 'system' : 'user';
}
function installLinuxUser() {
    const unitPath = getSystemdUnitPath();
    const dir = path.dirname(unitPath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(unitPath, generateSystemdUnit(false));
    (0, child_process_1.execSync)('systemctl --user daemon-reload');
    (0, child_process_1.execSync)(`systemctl --user enable ${SYSTEMD_UNIT}`);
    (0, child_process_1.execSync)(`systemctl --user restart ${SYSTEMD_UNIT}`);
    console.log(`Service installed: ${unitPath}`);
    // Without this the unit is torn down on logout — see LingerDeps above.
    const user = serviceUser();
    const linger = enableLinger(user);
    if (linger.ok) {
        console.log('The agent is running and will keep running after you log out (lingering enabled).');
    }
    else {
        console.log('The agent is running and will start on login.');
        console.log('');
        console.log('\x1b[33mWarning:\x1b[0m this service stops when your last session ends.');
        console.log(`  Could not enable lingering: ${linger.error}`);
        console.log(`  Fix with:  sudo loginctl enable-linger ${user}`);
        console.log('  Or install the boot service instead:  devdash-agent install-service --system');
    }
}
function installLinuxSystem() {
    const target = getSystemdSystemUnitPath();
    const staging = path.join(os.homedir(), '.devdash-agent', `${SYSTEMD_UNIT}.service`);
    fs.writeFileSync(staging, generateSystemdUnit(true));
    if (isRoot()) {
        fs.copyFileSync(staging, target);
        (0, child_process_1.execSync)('systemctl daemon-reload');
        (0, child_process_1.execSync)(`systemctl enable ${SYSTEMD_UNIT}`);
        (0, child_process_1.execSync)(`systemctl restart ${SYSTEMD_UNIT}`);
        console.log(`System service installed: ${target}`);
        console.log('The agent will start at boot, before login.');
    }
    else if (canPromptSudo()) {
        console.log('Boot service requires admin rights — you may be prompted for your password.\n');
        try {
            (0, child_process_1.execSync)(`sudo bash -c 'cp "${staging}" "${target}" && systemctl daemon-reload && systemctl enable --now ${SYSTEMD_UNIT}'`, { stdio: 'inherit' });
            console.log(`\nSystem service installed: ${target}`);
            console.log(`The agent will start at boot, before login (as user "${serviceUser()}").`);
            console.log('Verify with: devdash-agent status');
        }
        catch {
            console.error('\nsudo install failed. Run these commands manually:');
            printLinuxSystemSudoSteps(staging, target);
        }
    }
    else {
        console.log('Boot-before-login requires root. Run these commands:');
        printLinuxSystemSudoSteps(staging, target);
    }
}
function printLinuxSystemSudoSteps(staging, target) {
    console.log('');
    console.log(`  sudo cp ${staging} ${target}`);
    console.log(`  sudo systemctl daemon-reload`);
    console.log(`  sudo systemctl enable --now ${SYSTEMD_UNIT}`);
    console.log('');
    console.log(`Then it runs at boot as user "${serviceUser()}". Verify: devdash-agent status`);
}
function uninstallLinux(deps = {}) {
    const exists = deps.existsSync ?? fs.existsSync;
    const log = deps.log ?? console.log;
    let removed = false;
    const pending = [];
    // System unit — same escalation story as the macOS LaunchDaemon above.
    const sysPath = getSystemdSystemUnitPath();
    if (exists(sysPath)) {
        const cmd = `systemctl disable --now ${SYSTEMD_UNIT} 2>/dev/null; `
            + `rm -f "${sysPath}"; `
            + `systemctl daemon-reload`;
        if (runPrivileged(cmd, deps)) {
            log('System service uninstalled.');
            removed = true;
        }
        else {
            log('\nCould not remove the boot service automatically. Run:\n');
            log(`  sudo systemctl disable --now ${SYSTEMD_UNIT}`);
            log(`  sudo rm ${sysPath}`);
            log(`  sudo systemctl daemon-reload\n`);
            pending.push(`sudo systemctl disable --now ${SYSTEMD_UNIT}`, `sudo rm ${sysPath}`, 'sudo systemctl daemon-reload');
        }
    }
    const userPath = getSystemdUnitPath();
    if (exists(userPath)) {
        try {
            (0, child_process_1.execSync)(`systemctl --user disable --now ${SYSTEMD_UNIT}`);
        }
        catch { /* may not be running */ }
        fs.unlinkSync(userPath);
        (0, child_process_1.execSync)('systemctl --user daemon-reload');
        log('Service uninstalled.');
        removed = true;
    }
    if (!removed && pending.length === 0)
        log('Service not installed.');
    return { removed, pending };
}
function systemdActive(scope) {
    const flag = scope === 'user' ? '--user ' : '';
    let active = false;
    let pid = null;
    try {
        active = (0, child_process_1.execSync)(`systemctl ${flag}is-active ${SYSTEMD_UNIT} 2>/dev/null`, { encoding: 'utf-8' }).trim() === 'active';
    }
    catch { /* inactive/failed */ }
    try {
        const mp = parseInt((0, child_process_1.execSync)(`systemctl ${flag}show -p MainPID --value ${SYSTEMD_UNIT} 2>/dev/null`, { encoding: 'utf-8' }).trim(), 10);
        pid = mp > 0 ? mp : null;
    }
    catch { /* none */ }
    return { active, pid };
}
function installService(opts = {}) {
    const platform = os.platform();
    if (platform === 'darwin') {
        opts.system ? installMacOSDaemon() : installMacOSAgent();
    }
    else if (platform === 'linux') {
        opts.system ? installLinuxSystem() : installLinuxUser();
    }
    else {
        console.error(`Unsupported platform: ${platform}. Use "devdash-agent start --daemon" instead.`);
        process.exit(1);
    }
}
function uninstallService(deps = {}) {
    const platform = deps.platform ?? os.platform();
    if (platform === 'darwin') {
        return uninstallMacOS(deps);
    }
    else if (platform === 'linux') {
        return uninstallLinux(deps);
    }
    console.error(`Unsupported platform: ${platform}`);
    process.exit(1);
}
function isServiceInstalled() {
    const platform = os.platform();
    if (platform === 'darwin') {
        return fs.existsSync(getLaunchDaemonPlistPath()) || fs.existsSync(getLaunchdPlistPath());
    }
    else if (platform === 'linux') {
        return fs.existsSync(getSystemdSystemUnitPath()) || fs.existsSync(getSystemdUnitPath());
    }
    return false;
}
// Reports the REAL state of the managed service (queries launchd/systemd),
// not the manual-daemon pidfile.
function getServiceStatus() {
    const platform = os.platform();
    if (platform === 'darwin') {
        if (fs.existsSync(getLaunchDaemonPlistPath())) {
            const pid = launchdPid(`system/${SERVICE_NAME}`);
            return { installed: true, running: pid !== null, pid, kind: 'launchd-daemon', atBoot: true };
        }
        if (fs.existsSync(getLaunchdPlistPath())) {
            const uid = typeof process.getuid === 'function' ? process.getuid() : 0;
            const pid = launchdPid(`gui/${uid}/${SERVICE_NAME}`);
            return { installed: true, running: pid !== null, pid, kind: 'launchd-agent', atBoot: false };
        }
        return { installed: false, running: false, pid: null, kind: null, atBoot: false };
    }
    if (platform === 'linux') {
        if (fs.existsSync(getSystemdSystemUnitPath())) {
            const { active, pid } = systemdActive('system');
            return { installed: true, running: active, pid, kind: 'systemd-system', atBoot: true };
        }
        if (fs.existsSync(getSystemdUnitPath())) {
            const { active, pid } = systemdActive('user');
            return { installed: true, running: active, pid, kind: 'systemd-user', atBoot: false };
        }
        return { installed: false, running: false, pid: null, kind: null, atBoot: false };
    }
    return { installed: false, running: false, pid: null, kind: null, atBoot: false };
}
// --- Cron-based watchdog ---
const CRON_MARKER = '# devdash-agent-watchdog';
function getWatchdogPath(homedir = os.homedir()) {
    return path.join(homedir, '.devdash-agent', 'watchdog.sh');
}
function getWatchdogScript() {
    const nodePath = getNodePath();
    const script = getAgentScript();
    const pidFile = path.join(os.homedir(), '.devdash-agent', 'daemon.pid');
    const logDir = path.join(os.homedir(), '.devdash-agent', 'logs');
    if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
    }
    const watchdogPath = getWatchdogPath();
    const content = `#!/bin/bash
# Dialout Agent Watchdog — auto-restart if not running
PID_FILE="${pidFile}"
LOG="${logDir}/watchdog.log"
NODE="${nodePath}"
SCRIPT="${script}"

is_running() {
  if [ -f "$PID_FILE" ]; then
    PID=$(cat "$PID_FILE" 2>/dev/null)
    if [ -n "$PID" ] && kill -0 "$PID" 2>/dev/null; then
      return 0
    fi
  fi
  return 1
}

if is_running; then
  exit 0
fi

echo "[$(date)] Agent not running — restarting..." >> "$LOG"
nohup "$NODE" "$SCRIPT" >> "${logDir}/stdout.log" 2>> "${logDir}/stderr.log" &
echo $! > "$PID_FILE"
echo "[$(date)] Started with PID $!" >> "$LOG"
`;
    // Write-then-rename instead of a truncating in-place fs.writeFileSync.
    // Two reasons:
    //  1. Atomicity: if the process dies mid-write (OOM, power loss, SIGKILL),
    //     an in-place write can leave a truncated, syntactically-broken script
    //     sitting exactly where cron invokes it every N minutes. rename(2) on
    //     the same filesystem is a single atomic directory-entry swap — cron
    //     only ever sees the old complete file or the new complete file, never
    //     a partial one.
    //  2. Mode: POSIX ignores the `mode` passed to open()/writeFileSync when
    //     O_CREAT hits a path that already exists — so { mode: 0o755 } on an
    //     in-place writeFileSync silently does nothing if the target file had
    //     already lost its executable bit (a hardening scan, a backup/restore
    //     tool, or a manual `chmod 644` while debugging). Writing to a brand
    //     new temp file always honors `mode` (there's nothing existing to
    //     ignore it for), and rename() moves that file's mode along with it,
    //     replacing whatever permissions the old target had.
    // The temp name is unique per call (pid + high-res time + random suffix)
    // so concurrent getWatchdogScript() calls (e.g. setup-cron racing a
    // manual repair) can't collide on it.
    const tmpPath = `${watchdogPath}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    try {
        fs.writeFileSync(tmpPath, content, { mode: 0o755 });
        fs.chmodSync(tmpPath, 0o755); // belt-and-suspenders: independent of umask, since tmpPath is always newly created
        fs.renameSync(tmpPath, watchdogPath);
    }
    catch (err) {
        try {
            fs.unlinkSync(tmpPath);
        }
        catch { /* tmp file may not have been created */ }
        throw err;
    }
    return watchdogPath;
}
function installCron(intervalMinutes = 5) {
    const watchdogPath = getWatchdogScript();
    // Get existing crontab (without our entry)
    let existing = '';
    try {
        existing = (0, child_process_1.execSync)('crontab -l 2>/dev/null', { encoding: 'utf-8' });
    }
    catch { /* no existing crontab */ }
    // Remove any old devdash-agent entries
    const lines = existing.split('\n').filter((l) => !l.includes(CRON_MARKER) && l.trim() !== '');
    // Add new entry
    lines.push(`*/${intervalMinutes} * * * * ${watchdogPath} ${CRON_MARKER}`);
    lines.push(''); // trailing newline
    (0, child_process_1.execSync)('crontab -', { input: lines.join('\n'), encoding: 'utf-8' });
    console.log(`Cron watchdog installed — checks every ${intervalMinutes} minute${intervalMinutes > 1 ? 's' : ''}`);
    console.log(`Watchdog script: ${watchdogPath}`);
    console.log('The agent will auto-restart if it dies.');
}
function uninstallCron() {
    let existing = '';
    try {
        existing = (0, child_process_1.execSync)('crontab -l 2>/dev/null', { encoding: 'utf-8' });
    }
    catch {
        console.log('No crontab found.');
        return;
    }
    const lines = existing.split('\n').filter((l) => !l.includes(CRON_MARKER));
    const cleaned = lines.filter((l) => l.trim() !== '');
    if (cleaned.length === 0) {
        (0, child_process_1.execSync)('crontab -r 2>/dev/null', { encoding: 'utf-8' }).toString();
    }
    else {
        cleaned.push('');
        (0, child_process_1.execSync)('crontab -', { input: cleaned.join('\n'), encoding: 'utf-8' });
    }
    // Clean up watchdog script
    const watchdogPath = getWatchdogPath();
    if (fs.existsSync(watchdogPath))
        fs.unlinkSync(watchdogPath);
    console.log('Cron watchdog removed.');
}
function isCronInstalled() {
    try {
        const crontab = (0, child_process_1.execSync)('crontab -l 2>/dev/null', { encoding: 'utf-8' });
        return crontab.includes(CRON_MARKER);
    }
    catch {
        return false;
    }
}
// --- listSupervisors: report every supervisor, not just the first match ---
//
// getServiceStatus() and isServiceInstalled() (above) intentionally return on
// the first match — that shape is left untouched, existing callers depend on
// it. But it means a coexisting second supervisor (e.g. a stale user systemd
// unit next to a correct system unit) is invisible to them. This is how a
// production incident happened: three supervisors + a manually-started
// daemon were all racing for the single-instance lock, and `status` reported
// only one of them.
//
// This function checks every supervisor slot independently and returns all
// of them, so `devdash-agent status` (in cli.ts) can show the full picture.
/** Parse the script path out of a systemd unit's `ExecStart=<node> <script>` line. */
function parseScriptFromUnit(content) {
    const m = content.match(/^ExecStart=(.+)$/m);
    if (!m)
        return null;
    const parts = m[1].trim().split(/\s+/);
    return parts.length > 0 ? parts[parts.length - 1] : null;
}
/** Parse the script path out of a launchd plist's <ProgramArguments> array (2nd <string>, after the node binary). */
function parseScriptFromPlist(content) {
    const arrayMatch = content.match(/<key>ProgramArguments<\/key>\s*<array>([\s\S]*?)<\/array>/);
    if (!arrayMatch)
        return null;
    const strings = [...arrayMatch[1].matchAll(/<string>([^<]*)<\/string>/g)].map((m) => m[1]);
    return strings.length > 1 ? strings[1] : null;
}
/** Parse the script path out of the cron watchdog's `SCRIPT="…"` line. */
function parseScriptFromWatchdog(content) {
    const m = content.match(/^SCRIPT="(.*)"$/m);
    return m ? m[1] : null;
}
// A literal string compare is fooled by a symlinked global-install root
// (Homebrew-linked npm prefix, `npm link`, a package manager resolving
// through an intermediate symlink): two textually different paths can name
// the same real file, or vice versa. Canonicalize both sides via realpath
// before comparing. A *stale* target by definition may point at a file that
// was deleted (the pre-rename package no longer installed) — realpath throws
// for that, which is exactly the case staleness detection most needs to
// survive, so fall back to path.resolve() (no symlink following, but still
// normalizes `.`/`..`/separators) rather than letting the throw escape.
// Shared by listSupervisors() and repairWatchdog() so there is one place that
// decides what "the same script" means.
function normalizeScriptPath(p, realpath = fs.realpathSync) {
    try {
        return realpath(p);
    }
    catch {
        return path.resolve(p);
    }
}
/** Every supervisor present, not just the first match. */
function listSupervisors(deps = {}) {
    const platform = deps.platform ?? os.platform();
    const homedir = deps.homedir ?? os.homedir();
    const existsSync = deps.existsSync ?? fs.existsSync;
    const readFile = deps.readFileSync ?? ((p) => fs.readFileSync(p, 'utf-8'));
    const launchdPidFn = deps.launchdPid ?? launchdPid;
    const systemdActiveFn = deps.systemdActive ?? systemdActive;
    const isCronInstalledFn = deps.isCronInstalled ?? isCronInstalled;
    const agentScript = deps.agentScript ?? getAgentScript();
    const realpath = deps.realpathSync ?? fs.realpathSync;
    const readSafe = (p) => {
        try {
            return readFile(p);
        }
        catch {
            return '';
        }
    };
    // normalizeScriptPath (module-level, shared with repairWatchdog()) handles
    // symlink-equivalent paths and deleted stale targets — see its comment.
    const normalizedAgentScript = normalizeScriptPath(agentScript, realpath);
    const isStale = (targetScript) => targetScript !== null && normalizeScriptPath(targetScript, realpath) !== normalizedAgentScript;
    const results = [];
    if (platform === 'darwin') {
        const daemonPath = getLaunchDaemonPlistPath();
        if (existsSync(daemonPath)) {
            const pid = launchdPidFn(`system/${SERVICE_NAME}`);
            const targetScript = parseScriptFromPlist(readSafe(daemonPath));
            results.push({
                kind: 'launchd-daemon',
                path: daemonPath,
                running: pid !== null,
                pid,
                atBoot: true,
                targetScript: targetScript ?? '',
                stale: isStale(targetScript),
            });
        }
        const agentPath = getLaunchdPlistPath(homedir);
        if (existsSync(agentPath)) {
            const uid = typeof process.getuid === 'function' ? process.getuid() : 0;
            const pid = launchdPidFn(`gui/${uid}/${SERVICE_NAME}`);
            const targetScript = parseScriptFromPlist(readSafe(agentPath));
            results.push({
                kind: 'launchd-agent',
                path: agentPath,
                running: pid !== null,
                pid,
                atBoot: false,
                targetScript: targetScript ?? '',
                stale: isStale(targetScript),
            });
        }
    }
    else if (platform === 'linux') {
        const systemUnitPath = getSystemdSystemUnitPath();
        if (existsSync(systemUnitPath)) {
            const { active, pid } = systemdActiveFn('system');
            const targetScript = parseScriptFromUnit(readSafe(systemUnitPath));
            results.push({
                kind: 'systemd-system',
                path: systemUnitPath,
                running: active,
                pid,
                atBoot: true,
                targetScript: targetScript ?? '',
                stale: isStale(targetScript),
            });
        }
        const userUnitPath = getSystemdUnitPath(homedir);
        if (existsSync(userUnitPath)) {
            const { active, pid } = systemdActiveFn('user');
            const targetScript = parseScriptFromUnit(readSafe(userUnitPath));
            results.push({
                kind: 'systemd-user',
                path: userUnitPath,
                running: active,
                pid,
                atBoot: false,
                targetScript: targetScript ?? '',
                stale: isStale(targetScript),
            });
        }
    }
    if (isCronInstalledFn()) {
        const watchdogPath = getWatchdogPath(homedir);
        const targetScript = parseScriptFromWatchdog(readSafe(watchdogPath));
        results.push({
            kind: 'cron',
            path: watchdogPath,
            // Cron has no single long-lived process of its own to probe — its
            // watchdog re-launches the agent on a schedule. Presence in the
            // crontab (the only reason this entry exists at all) is what
            // "running" means here.
            running: true,
            pid: null,
            atBoot: false,
            targetScript: targetScript ?? '',
            stale: isStale(targetScript),
        });
    }
    return results;
}
/**
 * Backup filename that can't collide even if repair runs twice within the
 * same second (or the same millisecond, under a mocked/frozen clock): start
 * from an ISO-ish timestamp, then append an incrementing suffix until the
 * candidate path doesn't already exist.
 */
function nextBackupPath(watchdogPath) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    let candidate = `${watchdogPath}.bak-${stamp}`;
    let n = 1;
    while (fs.existsSync(candidate)) {
        candidate = `${watchdogPath}.bak-${stamp}-${n}`;
        n += 1;
    }
    return candidate;
}
// --- staleSupervisorAdvice: the correct next step for a stale supervisor ---
//
// repairWatchdog() above rewrites exactly one file: the cron watchdog's
// SCRIPT= line. It never touches a launchd plist or a systemd unit. So
// telling the operator to run "devdash-agent repair" for a stale unit is a
// dead end — repair will report "nothing to repair" while the unit stays
// stale.
//
// installService() (this module) regenerates a unit's ExecStart /
// ProgramArguments from the current getAgentScript() on every call:
// installMacOSAgent() and installLinuxUser() do an unconditional
// fs.writeFileSync over any existing file; installMacOSDaemon() and
// installLinuxSystem() do an unconditional fs.copyFileSync (root path) or
// `sudo cp` (non-root path) over the existing target. None of the four
// check "does a file already exist" first — they always overwrite. So
// re-running the matching install-service variant (plain for a login-kind
// unit, --system for a boot-kind unit — see SupervisorInfo.atBoot) genuinely
// fixes a stale unit. uninstall-service is offered as the alternative for
// when the stale unit is a redundant extra supervisor that should just be
// removed instead of kept.
function staleSupervisorAdvice(s) {
    if (s.kind === 'cron') {
        return [
            `  ⚠ ${s.path} points at a stale script (${s.targetScript}).`,
            '    Run "devdash-agent repair" to fix it.',
        ];
    }
    const installCmd = s.atBoot ? 'devdash-agent install-service --system' : 'devdash-agent install-service';
    return [
        `  ⚠ ${s.path} points at a stale script (${s.targetScript}).`,
        `    Run "${installCmd}" to regenerate it from the current build,`,
        '    or "devdash-agent uninstall-service" if this supervisor is redundant.',
    ];
}
/**
 * Rewrite `~/.devdash-agent/watchdog.sh` if its SCRIPT= line has drifted from
 * the current agent script. No-op (repaired: false) when the watchdog is
 * absent or already correct — in particular, an already-correct watchdog is
 * left byte-for-byte and mtime-untouched, and no backup is created.
 */
function repairWatchdog() {
    const watchdogPath = getWatchdogPath();
    const agentScript = getAgentScript();
    if (!fs.existsSync(watchdogPath)) {
        return { repaired: false, from: '', to: agentScript };
    }
    const content = fs.readFileSync(watchdogPath, 'utf-8');
    const currentTarget = parseScriptFromWatchdog(content);
    const stale = currentTarget !== null && normalizeScriptPath(currentTarget) !== normalizeScriptPath(agentScript);
    if (!stale) {
        return { repaired: false, from: currentTarget ?? agentScript, to: agentScript };
    }
    // Preserve the stale file before touching it.
    const backupPath = nextBackupPath(watchdogPath);
    fs.copyFileSync(watchdogPath, backupPath);
    // Reuse the one generator — this is the "single source of truth" the task
    // requires, not a second hand-written copy of the watchdog body.
    getWatchdogScript();
    // Belt-and-suspenders: getWatchdogScript()'s write-then-rename already
    // guarantees the final file is 0755 regardless of what mode the old,
    // stale watchdog had (rename() carries the temp file's mode, not the
    // replaced target's). Enforce it here too, explicitly, so repair's
    // executable-bit guarantee does not rely solely on that implementation
    // detail of the generator it happens to call.
    fs.chmodSync(watchdogPath, 0o755);
    return { repaired: true, from: currentTarget, to: agentScript };
}
//# sourceMappingURL=service-installer.js.map