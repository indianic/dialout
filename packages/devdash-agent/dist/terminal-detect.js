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
exports.currentTerminalToken = currentTerminalToken;
exports.detectTerminals = detectTerminals;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const os = __importStar(require("os"));
const has_command_1 = require("./has-command");
const terminal_markers_1 = require("./terminal-markers");
// token = TERM_PROGRAM value unless noted; runtime marker fallbacks handled in
// currentTerminalToken(). Order here is the checklist's base order.
const KNOWN_TERMINALS = [
    { name: 'Hyper', token: 'Hyper', appBundles: ['Hyper.app'], linuxBins: ['hyper'] },
    { name: 'iTerm', token: 'iTerm.app', appBundles: ['iTerm.app'], linuxBins: [] },
    { name: 'Apple Terminal', token: 'Apple_Terminal', appBundles: ['Terminal.app'], linuxBins: [] },
    { name: 'VS Code', token: 'vscode', appBundles: ['Visual Studio Code.app', 'Code.app'], linuxBins: ['code'] },
    { name: 'Ghostty', token: 'ghostty', appBundles: ['Ghostty.app'], linuxBins: ['ghostty'] },
    { name: 'WezTerm', token: 'WezTerm', appBundles: ['WezTerm.app'], linuxBins: ['wezterm'] },
    { name: 'Kitty', token: 'kitty', appBundles: ['kitty.app'], linuxBins: ['kitty'] },
    { name: 'Alacritty', token: 'alacritty', appBundles: ['Alacritty.app'], linuxBins: ['alacritty'] },
    { name: 'GNOME Terminal', token: 'gnome-terminal', appBundles: [], linuxBins: ['gnome-terminal'] },
    { name: 'Konsole', token: 'konsole', appBundles: [], linuxBins: ['konsole'] },
    // Newly-detectable via the /proc process-tree fallback (terminal-markers.ts)
    // — appended after Konsole so the existing macOS checklist order is untouched.
    { name: 'Tilix', token: 'tilix', appBundles: [], linuxBins: ['tilix'] },
    { name: 'Terminator', token: 'terminator', appBundles: [], linuxBins: ['terminator'] },
    { name: 'XFCE Terminal', token: 'xfce4-terminal', appBundles: [], linuxBins: ['xfce4-terminal'] },
    { name: 'Foot', token: 'foot', appBundles: [], linuxBins: ['foot'] },
    { name: 'urxvt', token: 'urxvt', appBundles: [], linuxBins: ['urxvt'] },
    { name: 'xterm', token: 'xterm', appBundles: [], linuxBins: ['xterm'] },
];
const APP_DIRS = [
    '/Applications',
    path.join(os.homedir(), 'Applications'),
    '/System/Applications',
    '/System/Applications/Utilities',
];
function defaultAppExists(bundle) {
    for (const dir of APP_DIRS) {
        try {
            if (fs.existsSync(path.join(dir, bundle)))
                return true;
        }
        catch {
            /* FS error → treat as not present, keep checking */
        }
    }
    return false;
}
/**
 * Canonical token for the terminal setup is running in, or "" if unknown.
 * Delegates to the shared terminal-markers.ts table so this can never drift
 * from the generated shell gate (cowork.ts): tokenFromEnv() first (handles
 * the TMUX guard, TERM_PROGRAM, and ENV_MARKERS), then — only on linux, where
 * /proc exists — tokenFromProcTree() walks up from the ppid for the emulators
 * that set no distinguishing env var at all (xfce4-terminal, foot, urxvt,
 * xterm, st, ...). macOS never reaches the /proc fallback: behavior there is
 * unchanged.
 *
 * The generic GENERIC_ENV_TOKEN ("vte") result is PROVISIONAL: every VTE-based
 * terminal exports VTE_VERSION, so treating it as final shadowed every
 * PROC_NAMES entry that is also VTE-based (xfce4-terminal today; guake,
 * mate-terminal tomorrow) and made their checklist rows unreachable. So the
 * walk still runs for it and a specific token wins, with "vte" restored when
 * the walk finds nothing. The emitted shell walk guard does exactly the same
 * (renderProcWalk in cowork.ts) — that is the invariant.
 */
function currentTerminalToken(env = process.env, deps = {}) {
    const token = (0, terminal_markers_1.tokenFromEnv)(env);
    if (token !== '' && token !== terminal_markers_1.GENERIC_ENV_TOKEN)
        return token;
    const platform = deps.platform ?? process.platform;
    // Non-linux has no /proc: keep whatever env gave us (including "vte").
    if (platform !== 'linux')
        return token;
    const ppid = deps.ppid ?? process.ppid;
    return (0, terminal_markers_1.tokenFromProcTree)(ppid, deps.procDeps) || token;
}
function detectTerminals(deps = {}) {
    const env = deps.env ?? process.env;
    const platform = deps.platform ?? process.platform;
    const appExists = deps.appExists ?? defaultAppExists;
    const hasCommand = deps.hasCommand ?? has_command_1.hasCommand;
    const currentToken = currentTerminalToken(env, {
        platform,
        ppid: deps.ppid,
        procDeps: deps.procDeps,
    });
    const rows = KNOWN_TERMINALS.map((e) => {
        const installed = platform === 'darwin'
            ? e.appBundles.some(appExists)
            : e.linuxBins.some(hasCommand);
        return {
            name: e.name,
            token: e.token,
            appBundles: e.appBundles,
            installed,
            current: currentToken !== '' && e.token === currentToken,
        };
    });
    // Always-include rule: current terminal isn't in the known table → append it
    // so the user can always pick "this terminal."
    if (currentToken !== '' && !rows.some((r) => r.token === currentToken)) {
        rows.push({
            name: currentToken,
            token: currentToken,
            appBundles: [],
            installed: true,
            current: true,
        });
    }
    return rows;
}
//# sourceMappingURL=terminal-detect.js.map