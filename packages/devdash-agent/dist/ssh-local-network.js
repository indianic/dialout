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
exports.DEFAULT_CONNECT_TIMEOUT = exports.SSH_LN_END = exports.SSH_LN_BEGIN = void 0;
exports.sshLocalNetworkApplies = sshLocalNetworkApplies;
exports.defaultSshConfigPath = defaultSshConfigPath;
exports.renderSshLocalNetworkBlock = renderSshLocalNetworkBlock;
exports.removeSshLocalNetworkBlock = removeSshLocalNetworkBlock;
exports.hasConnectTimeout = hasConnectTimeout;
exports.installSshLocalNetworkBlock = installSshLocalNetworkBlock;
const fs = __importStar(require("fs"));
const os = __importStar(require("os"));
const path = __importStar(require("path"));
exports.SSH_LN_BEGIN = '# >>> dialout ssh local-network workaround >>>';
exports.SSH_LN_END = '# <<< dialout ssh local-network workaround <<<';
// Pre-rename markers. Same reasoning as the cowork block: this one lives in
// the user's ssh config, so removal must still recognise it.
const LEGACY_SSH_LN_BEGIN = '# >>> devdash ssh local-network workaround >>>';
const LEGACY_SSH_LN_END = '# <<< devdash ssh local-network workaround <<<';
// Why this exists at all:
//
// macOS 15+ gates local-network access per *responsible process*, and for
// anything running in tmux that responsible process is the tmux SERVER — not
// the shell, not the agent, not the terminal app the user thinks they are in.
// A denied tmux server makes every LAN ssh inside it fail with the useless
//   ssh: connect to host <host> port 22: Undefined error: 0
// (errno 0 — the connection never reached a socket). The unified log is
// explicit: "unsatisfied (Local network prohibited)". The same git remote
// works in a non-tmux window of the same terminal app, which is what makes
// this look like a devdash bug when it is not one.
//
// Four things were measured before settling on this fix, because the obvious
// explanations are all wrong:
//
//   - ssh as a direct child of a user LaunchAgent running plain `node`:
//     ALLOWED. So it is not "launchd jobs are denied".
//   - the same, after a double-fork + setsid: ALLOWED. So it is not
//     daemonising or losing the session leader either.
//   - ssh inside a tmux server started by that same LaunchAgent: DENIED.
//     tmux is the only variable, and one tmux server serves the whole user,
//     so every session on the machine inherits its verdict no matter who
//     opened it.
//   - the agent re-launched from a hand-built, ad-hoc-signed .app bundle:
//     still DENIED. Giving the agent a grantable identity does not help,
//     because the agent is not the identity being judged.
//
// The real cure is granting tmux itself under System Settings > Privacy &
// Security > Local Network, which is a click the agent cannot perform. What
// the agent CAN do is set ConnectTimeout, which switches ssh to the legacy
// BSD-socket connect — a path that is not gated at all. It goes in ssh_config
// rather than a GIT_SSH_COMMAND wrapper because bare `ssh`, `git`, `npm`,
// `scp` and everything else that shells out to ssh all have to be covered,
// including inside tmux sessions that already existed before this shipped.
exports.DEFAULT_CONNECT_TIMEOUT = 15;
/**
 * Only macOS gates local-network access this way; on Linux the block would be
 * a gratuitous edit to the user's ssh config.
 */
function sshLocalNetworkApplies(platform = process.platform) {
    return platform === 'darwin';
}
function defaultSshConfigPath(home = os.homedir()) {
    return path.join(home, '.ssh', 'config');
}
function renderSshLocalNetworkBlock(timeoutSeconds = exports.DEFAULT_CONNECT_TIMEOUT) {
    // Clamped, then rendered as an integer: this value is interpolated into a
    // config file, so it must not be able to carry anything but digits.
    const asNumber = Number(timeoutSeconds);
    const base = Number.isFinite(asNumber) ? asNumber : exports.DEFAULT_CONNECT_TIMEOUT;
    const secs = Math.max(1, Math.min(300, Math.trunc(base)));
    return `${exports.SSH_LN_BEGIN}
# Managed by dialout — do not edit inside the markers.
# macOS Local Network Privacy judges the tmux SERVER, so every tmux session on
# this machine is denied LAN access and ssh to a local host dies with
# "Undefined error: 0" — while the same command works in a non-tmux window.
# ConnectTimeout selects ssh's legacy BSD-socket connect, which is not gated.
# The real cure is to allow tmux under System Settings > Privacy & Security >
# Local Network. Removed by "dialout uninstall-service" and
# "dialout setup-cowork --remove", or delete the block by hand.
Host *
  ConnectTimeout ${secs}
${exports.SSH_LN_END}`;
}
function removeSshLocalNetworkBlock(content) {
    {
        const b = content.indexOf(LEGACY_SSH_LN_BEGIN);
        const e = content.indexOf(LEGACY_SSH_LN_END);
        if (b !== -1 && e !== -1) {
            content = (content.slice(0, b) + content.slice(e + LEGACY_SSH_LN_END.length))
                .replace(/\n{3,}/g, '\n\n');
        }
    }
    const begin = content.indexOf(exports.SSH_LN_BEGIN);
    if (begin === -1)
        return content;
    const end = content.indexOf(exports.SSH_LN_END);
    if (end === -1 || end < begin)
        return content;
    return (content.slice(0, begin) + content.slice(end + exports.SSH_LN_END.length))
        .replace(/\n{3,}$/g, '\n\n');
}
/**
 * True when some earlier stanza already sets ConnectTimeout. ssh keeps the
 * FIRST value it obtains for a keyword, so an existing setting wins over ours
 * and appending would be dead weight.
 */
function hasConnectTimeout(content) {
    const withoutOurs = removeSshLocalNetworkBlock(content);
    return /^[ \t]*ConnectTimeout[ \t=]/im.test(withoutOurs);
}
/**
 * Append (or refresh) the block at the END of the file. Position matters:
 * ssh takes the first value it obtains for each keyword, so a trailing
 * `Host *` supplies defaults without overriding any host-specific stanza
 * above it. Putting it first would silently change every existing Host block.
 */
function installSshLocalNetworkBlock(configPath = defaultSshConfigPath(), timeoutSeconds = exports.DEFAULT_CONNECT_TIMEOUT, platform = process.platform) {
    if (!sshLocalNetworkApplies(platform))
        return 'skipped-platform';
    const dir = path.dirname(configPath);
    if (!fs.existsSync(dir))
        fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    const existed = fs.existsSync(configPath);
    const content = existed ? fs.readFileSync(configPath, 'utf-8') : '';
    const had = content.includes(exports.SSH_LN_BEGIN);
    if (!had && hasConnectTimeout(content))
        return 'skipped-existing';
    const cleaned = removeSshLocalNetworkBlock(content);
    const next = (cleaned.trim() ? cleaned.replace(/\n*$/, '\n\n') : '')
        + renderSshLocalNetworkBlock(timeoutSeconds) + '\n';
    fs.writeFileSync(configPath, next, { mode: 0o600 });
    // writeFileSync's mode only applies on create; ssh refuses a group/world
    // readable config, so enforce it on the pre-existing case too.
    fs.chmodSync(configPath, 0o600);
    return had ? 'updated' : existed ? 'installed' : 'created';
}
//# sourceMappingURL=ssh-local-network.js.map