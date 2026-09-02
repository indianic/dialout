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
exports.TOKEN_RE = exports.COWORK_END = exports.COWORK_BEGIN = void 0;
exports.sanitizeTokens = sanitizeTokens;
exports.renderMatchGate = renderMatchGate;
exports.renderCoworkBlock = renderCoworkBlock;
exports.removeCoworkBlock = removeCoworkBlock;
exports.installCoworkBlock = installCoworkBlock;
exports.unmatchableTokens = unmatchableTokens;
exports.coworkViability = coworkViability;
exports.pickTmuxInstall = pickTmuxInstall;
const fs = __importStar(require("fs"));
const terminal_markers_1 = require("./terminal-markers");
exports.COWORK_BEGIN = '# >>> dialout cowork wrapper >>>';
exports.COWORK_END = '# <<< dialout cowork wrapper <<<';
// The markers the agent wrote before the rename. New blocks use the names
// above, but removal has to recognise these too: the block lives in the user's
// shell rc, and a marker we no longer match is a block nobody can ever remove.
const LEGACY_COWORK_BEGIN = '# >>> devdash cowork wrapper >>>';
const LEGACY_COWORK_END = '# <<< devdash cowork wrapper <<<';
// Only tokens matching this may reach the shell `case` — rc-file injection
// defense. TERM_PROGRAM values and our marker tokens are all within this set.
// Note it also excludes every glob metacharacter, which is what makes a token
// safe to use as a `case` *pattern* and not just as a quoted value.
exports.TOKEN_RE = /^[A-Za-z0-9._-]+$/;
// Env var names are interpolated bare (inside ${...}), so they need the
// stricter shell-name rule on top of TOKEN_RE — "." and "-" are legal in a
// token but not in a variable name.
const ENV_NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;
function sanitizeTokens(tokens) {
    const seen = new Set();
    const out = [];
    for (const t of tokens) {
        if (exports.TOKEN_RE.test(t) && !seen.has(t)) {
            seen.add(t);
            out.push(t);
        }
    }
    return out;
}
// One `[ -n "$VAR" ] && _dd_tp="token"` probe per ENV_MARKERS entry, in table
// order. Each is additionally guarded on _dd_tp still being empty so the FIRST
// match wins — that is what makes TERM_PROGRAM (assigned above these lines)
// take precedence and keeps a specific marker from being overwritten by the
// generic vte catch-all, exactly reproducing tokenFromEnv's precedence.
function renderEnvProbes() {
    return terminal_markers_1.ENV_MARKERS
        .filter(({ envVar, token }) => ENV_NAME_RE.test(envVar) && exports.TOKEN_RE.test(token))
        .map(({ envVar, token }) => `[ -z "$_dd_tp" ] && [ -n "\${${envVar}:-}" ] && _dd_tp="${token}"`)
        .join('\n');
}
// The shell twin of tokenFromProcTree(): walk up from this shell's own pid,
// at most 10 levels (self + 9 ancestors), matching /proc/<pid>/comm against
// PROC_NAMES. Reached when no env marker identified the terminal (xterm, foot,
// st, urxvt set no marker at all) OR when only the generic vte catch-all did —
// xfce4-terminal is VTE-based, so "vte" is provisional and the walk must still
// get a chance to name it exactly. See the guard below and GENERIC_ENV_TOKEN.
//
// It runs on every interactive shell start, so it must stay cheap: `read`,
// `case` and parameter expansion are all shell builtins, so the whole walk
// forks nothing. The `[ -d /proc ]` guard makes it a zero-cost no-op on macOS.
//
// Silence on a failed read is enforced by `done 2>/dev/null` on the whole
// loop, NOT by a per-read `2>/dev/null`. Redirections are applied left to
// right, so in `read x < file 2>/dev/null` the input redirect fails *before*
// stderr is redirected and the shell's diagnostic still reaches the user's
// terminal. Reordering to `read x 2>/dev/null < file` fixes sh/dash/bash but
// NOT zsh, which reports redirection errors on the original stderr regardless
// of order — and .zshrc is half the blast radius. Redirecting the compound
// command is the only form verified silent in all four shells; it also covers
// the `[ "$_dd_pid" -gt 1 ]` "Illegal number" path. Failed reads still
// `|| break`, so the walk ends rather than spinning. stdout stays untouched.
//
// Not a theoretical path: /proc mounted with hidepid=1/2, or systemd's
// ProtectProc=, hides root-owned ancestors (login, agetty, gdm-session-worker),
// and the marker-less terminals that reach this walk are also the ones that
// run all 10 levels — so an unfixed walk printed an error on every new
// terminal, forever, until the user hand-edited their rc.
function renderProcWalk() {
    const arms = Object.entries(terminal_markers_1.PROC_NAMES)
        .filter(([comm, token]) => exports.TOKEN_RE.test(comm) && exports.TOKEN_RE.test(token))
        .map(([comm, token]) => `      ${comm}) _dd_tp="${token}" ;;`)
        .join('\n');
    // The guard admits two states: nothing resolved at all, or ONLY the generic
    // vte catch-all resolved. The second is what makes the walk reachable for
    // VTE-based emulators that are in PROC_NAMES (xfce4-terminal) — see
    // GENERIC_ENV_TOKEN. `_dd_prev` carries the provisional token across the
    // walk so it can be restored when the walk names nothing; the walk itself is
    // unchanged and still writes into an initially-empty `_dd_tp`, so a specific
    // marker above VTE_VERSION in the table is still final. This is the shell
    // twin of currentTerminalToken()'s `tokenFromProcTree(...) || token`.
    return `if { [ -z "$_dd_tp" ] || [ "$_dd_tp" = "${terminal_markers_1.GENERIC_ENV_TOKEN}" ]; } && [ -d /proc ]; then
  _dd_prev="$_dd_tp"
  _dd_tp=""
  _dd_pid=$$
  _dd_lvl=0
  while [ "$_dd_lvl" -lt 10 ]; do
    _dd_lvl=$((_dd_lvl + 1))
    [ "$_dd_pid" -gt 1 ] || break
    read -r _dd_comm < "/proc/$_dd_pid/comm" || break
    case "$_dd_comm" in
${arms}
    esac
    [ -z "$_dd_tp" ] || break
    read -r _dd_stat < "/proc/$_dd_pid/stat" || break
    # ppid is the 2nd field after the LAST ")" (a comm may contain both).
    _dd_rest="\${_dd_stat##*) }"
    _dd_rest="\${_dd_rest#* }"
    _dd_ppid="\${_dd_rest%% *}"
    case "$_dd_ppid" in
      ''|*[!0-9]*) break ;;
    esac
    _dd_pid="$_dd_ppid"
  done 2>/dev/null
  [ -n "$_dd_tp" ] || _dd_tp="$_dd_prev"
fi
unset _dd_pid _dd_lvl _dd_comm _dd_stat _dd_rest _dd_ppid _dd_prev`;
}
// The _dd_tp resolution + case that sets _dd_match. Column-0 so it can be
// unit-tested under `sh -c` in isolation; renderCoworkBlock indents it.
// Resolution order mirrors terminal-markers.ts exactly: TERM_PROGRAM (an Apple
// convention — unset under every Linux terminal), then ENV_MARKERS in table
// order, then the /proc process-tree walk.
function renderMatchGate(tokens) {
    const clean = sanitizeTokens(tokens);
    const arm = clean.length > 0
        ? `${clean.join('|')}) _dd_match=1 ;;`
        : '*) ;;';
    return `_dd_tp="\${TERM_PROGRAM:-}"
${renderEnvProbes()}
${renderProcWalk()}
_dd_match=""
case "$_dd_tp" in
  ${arm}
esac`;
}
// The verbatim tmux wrap body (carried over from the pre-gating COWORK_BLOCK).
// Do NOT add pane-scrollbars here — it wedges tmux at 100% CPU.
//
// The clipboard bindings are a SINGLE if/elif chain (pbcopy → wl-copy → xclip
// → xsel), never a pbcopy branch plus an independent Linux one. xclip and xsel
// are both installable on macOS via Homebrew, so two independent branches both
// ran on such a Mac; all four bind-key calls fired twice and the LATER binding
// won, routing copy-mode copy through `xclip -selection clipboard`, which then
// fails at runtime with no DISPLAY — macOS clipboard copy silently stops
// working (Constraint 1). bind-key is server-global, so an affected Mac also
// flip-flopped between xclip (after a native cowork shell started) and pbcopy
// (after a browser attach, whose bindings come from copyVerb() in
// pty-manager.ts — which returns pbcopy on darwin before probing anything).
// The chain here and copyVerb() must keep the same shape and the same order.
const WRAP_BODY = `_dd_base=$(basename "$PWD" 2>/dev/null | LC_ALL=C tr -cd 'a-zA-Z0-9_-' | cut -c1-20)
[ -n "$_dd_base" ] || _dd_base=shell
_dd_name="\${_dd_base}-$(( \${RANDOM:-$$} % 9000 + 1000 ))"
if tmux new-session -d -s "$_dd_name" 2>/dev/null; then
  tmux set-option -t "$_dd_name" @term_program "\${TERM_PROGRAM:-\${TERMINAL_EMULATOR:-unknown}}" 2>/dev/null
  tmux set-option -t "$_dd_name" @devdash_origin native 2>/dev/null
  tmux set-window-option -t "$_dd_name" window-size latest 2>/dev/null
  tmux set-window-option -t "$_dd_name" aggressive-resize on 2>/dev/null
  tmux set-option -g mouse on 2>/dev/null
  tmux set-option -s set-clipboard on 2>/dev/null
  tmux set-option -g status on 2>/dev/null
  tmux set-option -g history-limit 50000 2>/dev/null
  tmux set-option -sg escape-time 10 2>/dev/null
  tmux set-option -g allow-passthrough on 2>/dev/null
  tmux set-option -g focus-events on 2>/dev/null
  tmux show-options -g terminal-features 2>/dev/null | grep -q RGB || tmux set-option -sa terminal-features "*:RGB" 2>/dev/null
  tmux unbind-key -n MouseDown3Pane 2>/dev/null
  tmux unbind-key -n MouseDown3Status 2>/dev/null
  # Clipboard: ONE chain, first available wins — pbcopy must EXCLUDE the Linux
  # tools, which are installable on macOS too (see the note in cowork.ts).
  # Each arm sets copy-command as well as the four bind-keys. The bind-keys
  # only cover drag-release and the keyboard copies; copy-command is what makes
  # tmux's own double-click-word / triple-click-line defaults — which call
  # copy-pipe-and-cancel with NO argument — reach the system clipboard instead
  # of stopping at the tmux paste buffer. See clipboardBindings() in
  # pty-manager.ts for the measurements. Both files must stay in the same shape
  # and the same order.
  if command -v pbcopy >/dev/null 2>&1; then
    tmux set-option -g copy-command pbcopy 2>/dev/null
    tmux bind-key -T copy-mode MouseDragEnd1Pane send-keys -X copy-pipe-and-cancel pbcopy 2>/dev/null
    tmux bind-key -T copy-mode-vi MouseDragEnd1Pane send-keys -X copy-pipe-and-cancel pbcopy 2>/dev/null
    tmux bind-key -T copy-mode Enter send-keys -X copy-pipe-and-cancel pbcopy 2>/dev/null
    tmux bind-key -T copy-mode-vi y send-keys -X copy-pipe-and-cancel pbcopy 2>/dev/null
  elif command -v wl-copy >/dev/null 2>&1; then
    tmux set-option -g copy-command wl-copy 2>/dev/null
    tmux bind-key -T copy-mode MouseDragEnd1Pane send-keys -X copy-pipe-and-cancel wl-copy 2>/dev/null
    tmux bind-key -T copy-mode-vi MouseDragEnd1Pane send-keys -X copy-pipe-and-cancel wl-copy 2>/dev/null
    tmux bind-key -T copy-mode Enter send-keys -X copy-pipe-and-cancel wl-copy 2>/dev/null
    tmux bind-key -T copy-mode-vi y send-keys -X copy-pipe-and-cancel wl-copy 2>/dev/null
  elif command -v xclip >/dev/null 2>&1; then
    tmux set-option -g copy-command "xclip -selection clipboard" 2>/dev/null
    tmux bind-key -T copy-mode MouseDragEnd1Pane send-keys -X copy-pipe-and-cancel "xclip -selection clipboard" 2>/dev/null
    tmux bind-key -T copy-mode-vi MouseDragEnd1Pane send-keys -X copy-pipe-and-cancel "xclip -selection clipboard" 2>/dev/null
    tmux bind-key -T copy-mode Enter send-keys -X copy-pipe-and-cancel "xclip -selection clipboard" 2>/dev/null
    tmux bind-key -T copy-mode-vi y send-keys -X copy-pipe-and-cancel "xclip -selection clipboard" 2>/dev/null
  elif command -v xsel >/dev/null 2>&1; then
    tmux set-option -g copy-command "xsel --clipboard --input" 2>/dev/null
    tmux bind-key -T copy-mode MouseDragEnd1Pane send-keys -X copy-pipe-and-cancel "xsel --clipboard --input" 2>/dev/null
    tmux bind-key -T copy-mode-vi MouseDragEnd1Pane send-keys -X copy-pipe-and-cancel "xsel --clipboard --input" 2>/dev/null
    tmux bind-key -T copy-mode Enter send-keys -X copy-pipe-and-cancel "xsel --clipboard --input" 2>/dev/null
    tmux bind-key -T copy-mode-vi y send-keys -X copy-pipe-and-cancel "xsel --clipboard --input" 2>/dev/null
  fi
  tmux set-option -t "$_dd_name" @devdash_folder "$(basename "$PWD" 2>/dev/null)" 2>/dev/null
  tmux set-option -t "$_dd_name" @devdash_folder_path "$PWD" 2>/dev/null
  tmux set-option -t "$_dd_name" @devdash_created "$(date +%Y-%m-%dT%H:%M:%S)" 2>/dev/null
  tmux set-option -t "$_dd_name" @devdash_git "$(git rev-parse --abbrev-ref HEAD 2>/dev/null)" 2>/dev/null
  exec tmux new-session -A -s "$_dd_name"
fi
unset _dd_base _dd_name`;
function indent(text, pad) {
    return text.split('\n').map((l) => (l ? pad + l : l)).join('\n');
}
// Regenerate the full app-gated rc block from the allowlist. An empty (or
// fully-sanitized-away) list yields a block that never wraps.
function renderCoworkBlock(tokens) {
    const gate = indent(renderMatchGate(tokens), '      ');
    const body = indent(WRAP_BODY, '        ');
    return `${exports.COWORK_BEGIN}
# Managed by "dialout setup-cowork" — do not edit inside the markers.
case $- in
  *i*)
    if [ -z "$TMUX" ] && [ -z "$DEVDASH_NO_WRAP" ] && [ -z "$SSH_TTY" ] && [ -t 1 ] \\
       && command -v tmux >/dev/null 2>&1; then
${gate}
      if [ -n "$_dd_match" ]; then
${body}
      fi
      unset _dd_tp _dd_match
    fi
  ;;
esac
${exports.COWORK_END}`;
}
function stripBetween(content, begin, end) {
    const b = content.indexOf(begin);
    if (b === -1)
        return content;
    const e = content.indexOf(end);
    if (e === -1)
        return content;
    return (content.slice(0, b) + content.slice(e + end.length)).replace(/\n{3,}/g, '\n\n');
}
function removeCoworkBlock(content) {
    // Strip a pre-rename block first, so upgrading and then removing does not
    // leave the old one behind.
    content = stripBetween(content, LEGACY_COWORK_BEGIN, LEGACY_COWORK_END);
    const begin = content.indexOf(exports.COWORK_BEGIN);
    if (begin === -1)
        return content;
    const end = content.indexOf(exports.COWORK_END);
    if (end === -1 || end < begin)
        return content;
    return (content.slice(0, begin) + content.slice(end + exports.COWORK_END.length))
        .replace(/\n{3,}$/g, '\n\n');
}
function installCoworkBlock(rcPath, tokens) {
    const existed = fs.existsSync(rcPath);
    const content = existed ? fs.readFileSync(rcPath, 'utf-8') : '';
    const had = content.includes(exports.COWORK_BEGIN) || content.includes(LEGACY_COWORK_BEGIN);
    const cleaned = removeCoworkBlock(content);
    const next = cleaned.replace(/\n*$/, '\n\n') + renderCoworkBlock(tokens) + '\n';
    fs.writeFileSync(rcPath, next);
    return had ? 'updated' : existed ? 'installed' : 'created';
}
// Linux package managers in preference order → install command.
const LINUX_MANAGERS = [
    { bin: 'apt-get', command: 'sudo apt-get install -y tmux' },
    { bin: 'dnf', command: 'sudo dnf install -y tmux' },
    { bin: 'yum', command: 'sudo yum install -y tmux' },
    { bin: 'pacman', command: 'sudo pacman -S --noconfirm tmux' },
    { bin: 'zypper', command: 'sudo zypper install -y tmux' },
];
// --- unmatchableTokens: the guard rail against the reported silent no-op ---
//
// The bug shipped a green "Cowork enabled." for GNOME Terminal on Linux, which
// then never wrapped because the gate keyed off $TERM_PROGRAM alone (GNOME
// Terminal never sets it). Tasks 1-5 fixed detection; this makes a selection
// that STILL can't match on this platform loud instead of silent.
//
// Derived from the shared tables (ENV_MARKERS, PROC_NAMES) rather than a
// second hand-maintained list, so it cannot drift from them the way the shell
// gate and terminal-detect.ts once drifted from each other.
//
// ENV_MARKERS' first three entries (kitty, alacritty, WezTerm) are terminal
// emulators that ship on both platforms and set the same env var on either —
// so they're excluded from "linux-only" even though they live in the table.
// Everything else in ENV_MARKERS (konsole, tilix, terminator, gnome-terminal,
// vte) and everything in PROC_NAMES (xfce4-terminal, foot, urxvt, xterm, st,
// plus the overlapping cross-platform entries, which the exclusion above
// removes again) is Linux desktop-environment-specific and cannot be produced
// on darwin.
const CROSS_PLATFORM_TOKENS = new Set(terminal_markers_1.ENV_MARKERS.slice(0, 3).map((m) => m.token));
const LINUX_ONLY_TOKENS = new Set([...terminal_markers_1.ENV_MARKERS.map((m) => m.token), ...Object.values(terminal_markers_1.PROC_NAMES)]
    .filter((token) => !CROSS_PLATFORM_TOKENS.has(token)));
// TERM_PROGRAM values with no Linux equivalent. These can't be derived from
// ENV_MARKERS or PROC_NAMES — TERM_PROGRAM is an Apple convention read
// directly by tokenFromEnv, not a table entry — so they're named explicitly.
// Keep this list to exactly these two; anything else must come from the
// shared tables above.
const MACOS_ONLY_TOKENS = new Set(['Apple_Terminal', 'iTerm.app']);
/** Tokens that cannot be produced by tokenFromEnv/proc detection here. */
function unmatchableTokens(tokens, platform) {
    if (platform === 'darwin')
        return tokens.filter((t) => LINUX_ONLY_TOKENS.has(t));
    if (platform === 'linux')
        return tokens.filter((t) => MACOS_ONLY_TOKENS.has(t));
    return [];
}
function coworkViability(env, anyEmulatorInstalled) {
    const reasons = [];
    if (env.SSH_TTY || env.SSH_CONNECTION)
        reasons.push('ssh-session');
    if (!anyEmulatorInstalled)
        reasons.push('no-emulator');
    return { usable: reasons.length === 0, reasons };
}
function pickTmuxInstall(platform, hasCommand) {
    if (platform === 'darwin') {
        if (hasCommand('brew'))
            return { command: 'brew install tmux', canAuto: true };
        return {
            command: '',
            canAuto: false,
            manual: 'Homebrew is not installed. Install it from https://brew.sh then run: brew install tmux',
        };
    }
    for (const m of LINUX_MANAGERS) {
        if (hasCommand(m.bin))
            return { command: m.command, canAuto: true };
    }
    return {
        command: '',
        canAuto: false,
        manual: 'No supported package manager found. Install tmux with your distro\'s package manager (apt/dnf/yum/pacman/zypper).',
    };
}
//# sourceMappingURL=cowork.js.map