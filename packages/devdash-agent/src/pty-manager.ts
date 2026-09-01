import type WebSocket from 'ws';
import * as os from 'os';
import * as fs from 'fs';
import { execFileSync } from 'child_process';
import { killTmuxSession, countClients, tmuxSessionName } from './tmux-manager';
import { hasCommand as defaultHasCommand } from './has-command';

// node-pty is optional — only loaded when terminal sessions are used
let pty: typeof import('node-pty') | null = null;

try {
  pty = require('node-pty');
} catch {
  // node-pty not available — terminal features disabled
}

interface PtySession {
  id: string;
  process: import('node-pty').IPty;
  /** Set when this PTY is a tmux client. */
  tmux?: {
    name: string;
    /** True when this connection CREATED the tmux session (browser-origin). */
    creator: boolean;
    readOnly: boolean;
  };
}

const sessions = new Map<string, PtySession>();

// PTY output is routed through the currently active server socket rather
// than the one captured at spawn time, so sessions survive daemon
// reconnects: on reconnect the new socket takes over the stream.
let activeWs: WebSocket | null = null;

export function setActiveSocket(ws: WebSocket | null): void {
  activeWs = ws;
}

export function isPtyAvailable(): boolean {
  return pty !== null;
}

export function openSession(
  id: string,
  command: string,
  cwd: string,
  cols: number = 80,
  rows: number = 24,
  opts: { coworkWrap?: boolean } = {}
): boolean {
  if (!pty) return false;

  // Idempotent: if session already exists, skip
  if (sessions.has(id)) {
    console.log(`[devdash-agent] Session ${id} already exists, skipping`);
    return true;
  }

  const shell = process.env.SHELL || '/bin/zsh';

  // Resolve ~ and validate cwd
  let resolvedCwd = cwd;
  if (resolvedCwd === '~' || resolvedCwd.startsWith('~/')) {
    resolvedCwd = resolvedCwd.replace('~', os.homedir());
  }
  if (!resolvedCwd || !fs.existsSync(resolvedCwd)) {
    resolvedCwd = os.homedir();
  }

  let proc;
  let tmuxMeta: PtySession['tmux'];
  // Set when we attached to a session that was already running. The startup
  // command must NOT be replayed into it — see the guard at the bottom.
  let resumed = false;
  if (opts.coworkWrap) {
    // Wrap the browser shell in tmux so it survives the tab closing and other
    // devices can attach to it.
    // Fail open: any tmux error falls back to the plain shell below.
    const tmuxName = tmuxSessionName(id);
    // Only true once WE created this session — the cleanup below must never
    // kill a session that already existed under this name.
    let createdByUs = false;
    try {
      const tmuxRun = (args: string[]) => {
        execFileSync('tmux', args, { timeout: 5000, stdio: 'pipe' });
      };
      // Resume path. tmuxSessionName() is deterministic, so the same browser
      // sessionId always maps to the same tmux session — which is exactly what
      // makes a web terminal resumable: reopening the dock (or the Web tab's
      // Resume) re-runs openSession with the stored id and lands back in the
      // running shell. Without this check `new-session -s` would fail on the
      // duplicate name, fall into the catch, and silently hand the user a
      // fresh plain shell while their work sat in the orphaned session.
      if (tmuxSessionExists(tmuxName)) {
        console.log(`[devdash-agent] Resuming existing tmux session ${tmuxName}`);
        resumed = true;
      } else {
        tmuxRun(['new-session', '-d', '-s', tmuxName, '-x', String(cols), '-y', String(rows), '-c', resolvedCwd]);
        createdByUs = true;
        tmuxRun(['set-option', '-t', tmuxName, '@devdash_origin', 'browser']);
        tmuxRun(['set-option', '-t', tmuxName, '@term_program', 'DevDash']);
        tmuxRun(['set-window-option', '-t', tmuxName, 'window-size', 'latest']);
        tmuxRun(['set-window-option', '-t', tmuxName, 'aggressive-resize', 'on']);
        const base = resolvedCwd.split('/').filter(Boolean).pop() || '';
        const nowIso = new Date().toISOString().replace(/\.\d+Z$/, '').replace('Z', '');
        tmuxRun(['set-option', '-t', tmuxName, '@devdash_folder', base]);
        tmuxRun(['set-option', '-t', tmuxName, '@devdash_folder_path', resolvedCwd]);
        tmuxRun(['set-option', '-t', tmuxName, '@devdash_created', nowIso]);
        let branch = '';
        try {
          branch = execFileSync('git', ['-C', resolvedCwd, 'rev-parse', '--abbrev-ref', 'HEAD'],
            { timeout: 3000, stdio: 'pipe' }).toString().trim();
        } catch {}
        tmuxRun(['set-option', '-t', tmuxName, '@devdash_git', branch]);
      }
      applyNativeTmuxOptions();
      // Re-applied on resume too, so sessions created before this shipped pick
      // it up on their next attach.
      applyBrowserSessionOptions(tmuxName);
      proc = pty.spawn('tmux', ['attach-session', '-t', tmuxName], {
        name: 'xterm-256color',
        cols,
        rows,
        cwd: resolvedCwd,
        env: { ...process.env as Record<string, string>, TERM: 'xterm-256color' },
      });
      tmuxMeta = { name: tmuxName, creator: true, readOnly: false };
    } catch (err: any) {
      console.error(`[devdash-agent] cowork wrap failed, plain shell fallback: ${err.message}`);
      // new-session may have succeeded before a later step threw — clean up the
      // half-created session so it doesn't linger untracked. Guard on
      // createdByUs: if new-session ITSELF failed (e.g. duplicate name) the
      // session belongs to someone else and killing it would destroy their
      // running work.
      if (createdByUs) {
        try { execFileSync('tmux', ['kill-session', '-t', tmuxName], { timeout: 5000, stdio: 'pipe' }); } catch {}
      }
      proc = undefined;
    }
  }
  if (!proc) {
    try {
      proc = pty.spawn(shell, [], {
        name: 'xterm-256color',
        cols,
        rows,
        cwd: resolvedCwd,
        env: { ...process.env as Record<string, string>, TERM: 'xterm-256color' },
      });
    } catch (err: any) {
      console.error(`[devdash-agent] PTY spawn failed: ${err.message}`);
      console.error(`[devdash-agent]   shell: ${shell}, cwd: ${resolvedCwd}`);
      return false;
    }
  }

  proc.onData((data: string) => {
    if (activeWs && activeWs.readyState === activeWs.OPEN) {
      activeWs.send(JSON.stringify({ type: 'pty_data', id, data }));
    }
  });

  proc.onExit(({ exitCode }) => {
    sessions.delete(id);
    if (activeWs && activeWs.readyState === activeWs.OPEN) {
      activeWs.send(JSON.stringify({ type: 'pty_exit', id, code: exitCode }));
    }
  });

  sessions.set(id, { id, process: proc, tmux: tmuxMeta });

  // If a command was specified, send it to the shell after a brief delay.
  //
  // Never on a resume. The browser replays the tab's original command on every
  // open, which is right for a fresh shell and destructive for a running one:
  // resuming a tab that launched `claude` would type "claude\n" straight into
  // the live Claude Code session it just reattached to. A resumed session is
  // already running whatever the user started — it needs no input from us.
  if (command && !resumed) {
    setTimeout(() => {
      proc.write(command + '\n');
    }, 300);
  }

  return true;
}

// Attach to an existing tmux session inside a fresh PTY. The tmux client
// merges input and broadcasts output to all clients — this is the sharing.
// Make DevDash tmux sessions behave like a plain OS terminal. Applied globally
// (server-wide) so every session — including native ones the agent never
// attaches to (e.g. a Hyper window) — is covered, and new sessions inherit it.
// Each command is best-effort: a no-op or unsupported option never throws out.
const NATIVE_TMUX_COMMANDS: string[][] = [
  // Mouse ON — the native-terminal model (iTerm2/Hyper/VSCode all do this):
  // the wheel scrolls back through output/history instead of the shell reading
  // it as up/down arrows (which navigated command history). Plain drag is
  // tmux's own select-and-copy, routed to the system clipboard by
  // clipboardBindings() below.
  //
  // The modifier that BYPASSES mouse reporting for a real OS-level highlight
  // is NOT Shift everywhere, and an earlier version of this comment said it
  // was. Measured against the xterm.js we ship:
  //   shouldForceSelection(e) =>
  //     isMac ? e.altKey && rawOptions.macOptionClickForcesSelection
  //           : e.shiftKey
  // So Shift-drag only works on Linux/xterm/VTE. On macOS it is OPTION-drag,
  // and only when macOptionClickForcesSelection is on — it defaults to FALSE,
  // which left Mac users of Hyper and of our own browser terminal with no
  // working bypass gesture at all. src/components/Terminal.tsx now sets it
  // true; Apple Terminal uses Fn-drag and iTerm2 uses Option-drag natively.
  ['set-option', '-g', 'mouse', 'on'],
  // set-clipboard on = tmux emits OSC 52 on every copy. That escape is what
  // carries the text to a REMOTE client's clipboard (the browser tab), and it
  // is the only thing that can — pbcopy below only reaches the clipboard of
  // the machine the agent runs on. Verified: tmux emits OSC 52 on both the
  // piped (pbcopy) and plain copy paths, and `clipboard` is already in
  // terminal-features by default for xterm* (our TERM), so it needs no help.
  ['set-option', '-s', 'set-clipboard', 'on'],
  // NOTE: pane-scrollbars (tmux 3.5+) is deliberately NOT enabled. On 3.6a it
  // drove the server to 100% CPU (redraw loop) when multiple differently-sized
  // clients were attached (Hyper + browser PTY) alongside window-size latest /
  // aggressive-resize. Mouse-on already gives native wheel scrolling; the
  // scrollbar is cosmetic and not worth wedging the server.
  // Keep the status line on (user preference).
  ['set-option', '-g', 'status', 'on'],
  // Large scrollback (applies to new sessions) + low escape lag.
  ['set-option', '-g', 'history-limit', '100000'],
  ['set-option', '-sg', 'escape-time', '10'],
  // NOTE: no WheelUpPane binding here on purpose. tmux's own default already
  // is `if-shell "#{||:#{alternate_on},#{pane_in_mode},#{mouse_any_flag}}"
  // { send-keys -M } { copy-mode -e }` — it already uses copy-mode -e (auto-
  // exit at the bottom, so scrolling never leaves you unable to type) AND it
  // also guards on alternate_on, which a hand-rolled binding misses: that
  // check is what lets less/vim scroll natively instead of being hijacked
  // into copy-mode. Overriding it is a regression. Verified on tmux 3.7b.
  // Let apps (Claude Code image paste, graphics/OSC protocols) pass sequences
  // through tmux untouched, and receive focus in/out events.
  ['set-option', '-g', 'allow-passthrough', 'on'],
  ['set-option', '-g', 'focus-events', 'on'],
  // Remove tmux's right-click context menus so the OS/terminal menu wins.
  ['unbind-key', '-n', 'MouseDown3Pane'],
  ['unbind-key', '-n', 'MouseDown3Status'],
  ['unbind-key', '-n', 'MouseDown3StatusLeft'],
  ['unbind-key', '-n', 'MouseDown3StatusRight'],
  ['unbind-key', '-n', 'M-MouseDown3Pane'],
  ['unbind-key', '-n', 'M-MouseDown3Status'],
  ['unbind-key', '-n', 'M-MouseDown3StatusLeft'],
];

// The copy verb, as `send-keys -X` arguments.
//
// MUST be an -and-cancel variant. 2.3.5 used -no-clear here, hoping to leave the
// selection highlighted after a drag the way a native terminal does. In tmux
// that flag is not cosmetic: -no-clear also does NOT exit copy-mode, so every
// drag-select stranded the user in copy-mode, where keystrokes are copy-mode
// commands and paste never reaches the shell. Measured on tmux 3.7b:
//
//   copy-pipe-and-cancel pbcopy -> #{pane_in_mode} = 0   (back at the shell)
//   copy-pipe-no-clear   pbcopy -> #{pane_in_mode} = 1   (stuck)
//
// "Selection stays visible" and "shell keeps taking input" are mutually
// exclusive here; input wins. Locked by test/pty-manager.test.js.
//
// On macOS we additionally pipe through pbcopy: that reaches the pasteboard of
// the machine the AGENT runs on, i.e. the user's own Mac, and works even from
// terminals with no OSC 52 support (Apple Terminal). tmux still emits OSC 52
// on the piped path (verified), so a remote browser client's clipboard is fed
// by the same copy. On Linux there is no single portable equivalent of
// pbcopy, so we probe for the first available of wl-copy (Wayland), xclip,
// and xsel — see LINUX_CLIPBOARD_TOOLS below — and pipe through that instead.
// When none of the three is installed, copyVerb() falls back to
// copy-selection-and-cancel and the system clipboard is unreached; a remote
// browser client is still fed via OSC 52 regardless.
export interface CopyVerbDeps {
  platform?: NodeJS.Platform;
  hasCommand?: (bin: string) => boolean;
}

// Priority order: wl-copy wins when several are present. Each `command` is
// what gets piped the copy-mode selection, exactly as typed at a shell — see
// the note on LINUX_CLIPBOARD_TOOLS's caller for why a multi-word entry must
// stay a single array element.
const LINUX_CLIPBOARD_TOOLS: Array<{ bin: string; command: string }> = [
  { bin: 'wl-copy', command: 'wl-copy' },
  { bin: 'xclip', command: 'xclip -selection clipboard' },
  { bin: 'xsel', command: 'xsel --clipboard --input' },
];

// The single shell command that copies stdin to the system clipboard on this
// machine, or null when there is none. Split out of copyVerb() because two
// different tmux surfaces need the SAME answer: the explicit bind-keys below,
// and the `copy-command` server option (see clipboardBindings). Deriving both
// from one probe is what keeps them from disagreeing.
export function clipboardCommand(deps: CopyVerbDeps = {}): string | null {
  const platform = deps.platform ?? process.platform;
  if (platform === 'darwin') {
    return 'pbcopy';
  }
  if (platform === 'linux') {
    const hasCommand = deps.hasCommand ?? defaultHasCommand;
    for (const tool of LINUX_CLIPBOARD_TOOLS) {
      // The command MUST be returned as ONE array element, never split into
      // separate ones (e.g. 'xclip', '-selection', 'clipboard'): tmux's
      // `send-keys -X copy-pipe-and-cancel <arg>` only accepts a single
      // trailing argument, which it then runs through the pane's shell. Extra
      // argv positions are misparsed by tmux as a second command reference
      // ("no current client") and the copy silently never fires — measured
      // directly against tmux 3.7b. A single string like
      // "xclip -selection clipboard" is correctly word-split back apart by
      // the shell that runs it.
      if (hasCommand(tool.bin)) return tool.command;
    }
  }
  return null;
}

export function copyVerb(deps: CopyVerbDeps = {}): string[] {
  const command = clipboardCommand(deps);
  return command ? ['copy-pipe-and-cancel', command] : ['copy-selection-and-cancel'];
}

// Mouse-driven copy, server-wide so every session inherits it.
//
// Deliberately minimal. tmux 3.x already binds DoubleClick1Pane (select-word)
// and TripleClick1Pane (select-line) in the root and copy-mode tables, and
// those defaults auto-copy AND carry `if-shell` guards on
// #{pane_in_mode}/#{mouse_any_flag} plus a `run-shell -d 0.3` dwell so the
// selection is visible before it clears. Re-binding them by hand loses the
// guards — a double-click inside vim would be swallowed into copy-mode instead
// of reaching the app. So we leave word/line click alone and override only the
// copy VERB on drag-release and the keyboard copies, purely to route the copy
// through pbcopy on macOS. The -and-cancel semantics match tmux's own default;
// see copyVerb above for why -no-clear is not an option.
export function clipboardBindings(): string[][] {
  const copy = copyVerb();
  const command = clipboardCommand();
  const cmds: string[][] = [];
  // `copy-command` is what makes the UNARGUMENTED `copy-pipe-and-cancel` in
  // tmux's OWN DoubleClick1Pane/TripleClick1Pane defaults reach the system
  // clipboard. Leaving those defaults alone (above) preserved their if-shell
  // guards but also left them un-piped: with copy-command empty, a
  // double-clicked word or triple-clicked line went ONLY into the tmux paste
  // buffer plus an OSC 52 escape, and xterm.js — Hyper, and our own browser
  // terminal — does not act on OSC 52. Measured on tmux 3.6a/macOS:
  //
  //   copy-pipe-and-cancel          -> pasteboard unchanged
  //   copy-pipe-and-cancel pbcopy   -> pasteboard updated
  //   copy-command pbcopy, then
  //   copy-pipe-and-cancel          -> pasteboard updated
  //
  // So set the option rather than rebinding double/triple-click, which would
  // lose the guards for exactly the reason described above.
  if (command) cmds.push(['set-option', '-g', 'copy-command', command]);
  cmds.push(
    ['bind-key', '-T', 'copy-mode', 'MouseDragEnd1Pane', 'send-keys', '-X', ...copy],
    ['bind-key', '-T', 'copy-mode-vi', 'MouseDragEnd1Pane', 'send-keys', '-X', ...copy],
    ['bind-key', '-T', 'copy-mode', 'Enter', 'send-keys', '-X', ...copy],
    ['bind-key', '-T', 'copy-mode-vi', 'y', 'send-keys', '-X', ...copy],
  );
  return cmds;
}

export function applyNativeTmuxOptions(): void {
  for (const args of NATIVE_TMUX_COMMANDS) {
    try {
      execFileSync('tmux', args, { timeout: 5000, stdio: 'pipe' });
    } catch { /* option/key unsupported or no server yet — keep going */ }
  }
  for (const args of clipboardBindings()) {
    try {
      execFileSync('tmux', args, { timeout: 5000, stdio: 'pipe' });
    } catch { /* binding unsupported or no server yet — keep going */ }
  }
  // RGB / 24-bit true color — append the feature only if absent, so repeated
  // calls (every connect/attach) never pile up duplicate entries.
  try {
    const feats = execFileSync('tmux', ['show-options', '-g', 'terminal-features'], { timeout: 5000, stdio: 'pipe' }).toString();
    if (!/RGB/.test(feats)) {
      execFileSync('tmux', ['set-option', '-sa', 'terminal-features', '*:RGB'], { timeout: 5000, stdio: 'pipe' });
    }
  } catch { /* no server yet */ }
}

// Exact-name membership test against the live session list.
//
// Deliberately NOT `tmux has-session -t <name>`: tmux target resolution falls
// back to prefix and fnmatch matching, so `has-session -t dd-abc` reports
// success for an unrelated `dd-abcdef`. Resuming would then attach the browser
// to somebody else's shell. Comparing full names from list-sessions is exact
// by construction. A missing server throws and correctly reads as "no".
export interface SessionExistsDeps {
  /** Injected in tests; defaults to `tmux list-sessions -F '#{session_name}'`. */
  list?: () => string;
}

export function tmuxSessionExists(name: string, deps: SessionExistsDeps = {}): boolean {
  const list = deps.list ?? (() => execFileSync('tmux', ['list-sessions', '-F', '#{session_name}'],
    { timeout: 5000, stdio: 'pipe' }).toString());
  try {
    return list().split('\n').some((line) => line.trim() === name);
  } catch {
    return false;
  }
}

// Per-session appearance for browser-origin (dd-*) sessions.
//
// Scoped with -t, never -g: these sessions render inside a browser tab that
// already has DevDash's own chrome around it, so tmux's status bar is a
// duplicate row of UI stealing a line of the viewport. Native sessions keep
// their status bar — the user reads it in their terminal app, where it is the
// only indicator there is. That split is the whole reason this is per-session.
export function applyBrowserSessionOptions(name: string): void {
  try {
    execFileSync('tmux', ['set-option', '-t', name, 'status', 'off'],
      { timeout: 5000, stdio: 'pipe' });
  } catch { /* session gone or option unsupported — cosmetic, never fatal */ }
}

export function openAttach(
  id: string,
  tmuxName: string,
  readOnly: boolean,
  cols: number = 80,
  rows: number = 24
): boolean {
  if (!pty) return false;
  if (sessions.has(id)) return true; // idempotent reattach

  applyNativeTmuxOptions();

  const args = ['attach-session', '-t', tmuxName];
  if (readOnly) args.push('-r', '-f', 'ignore-size'); // Peek: don't drive window size (tmux ≥3.2)

  let proc;
  try {
    proc = pty.spawn('tmux', args, {
      name: 'xterm-256color',
      cols,
      rows,
      cwd: os.homedir(),
      env: { ...process.env as Record<string, string>, TERM: 'xterm-256color' },
    });
  } catch (err: any) {
    console.error(`[devdash-agent] tmux attach failed: ${err.message}`);
    return false;
  }

  proc.onData((data: string) => {
    if (activeWs && activeWs.readyState === activeWs.OPEN) {
      activeWs.send(JSON.stringify({ type: 'pty_data', id, data }));
    }
  });

  proc.onExit(({ exitCode }) => {
    sessions.delete(id);
    if (activeWs && activeWs.readyState === activeWs.OPEN) {
      activeWs.send(JSON.stringify({ type: 'pty_exit', id, code: exitCode }));
    }
  });

  sessions.set(id, { id, process: proc, tmux: { name: tmuxName, creator: false, readOnly } });
  return true;
}

export function writeToSession(id: string, data: string): void {
  const session = sessions.get(id);
  if (session) {
    session.process.write(data);
  }
}

export function resizeSession(id: string, cols: number, rows: number): void {
  const session = sessions.get(id);
  if (session) {
    session.process.resize(cols, rows);
  }
}

export async function closeSession(id: string): Promise<void> {
  const session = sessions.get(id);
  if (!session) return;
  sessions.delete(id);
  const { tmux } = session;
  session.process.kill();
  if (tmux?.creator) {
    // The user closed the tab that created this session. Kill the tmux
    // session too — unless another client (phone, second browser) is still
    // attached, in which case the session lives on for them.
    // countClients runs after our own client died with a small delay so we
    // don't count ourselves.
    setTimeout(async () => {
      const clients = await countClients(tmux.name);
      if (clients === 0) await killTmuxSession(tmux.name);
    }, 500);
  }
  // Native-origin attach clients (tmux.creator === false): killing the
  // attach PTY only detaches — the shared session is never killed here.
}

// Give up the client PTY without ending the work.
//
// This is what the detach grace period now expires into. It used to expire
// into closeSession(), which killed the tmux session too — so a browser tab
// closed for more than the grace window took a multi-hour Claude Code session
// down with it. Detach frees the node-pty (the browser is gone; nothing is
// reading its output) while tmux keeps the shell and its process tree running,
// so a later openSession() with the same id resumes straight back into it.
//
// A session with no tmux behind it cannot be resumed by anything, so detaching
// one would strand an unreachable shell forever — those are killed, matching
// the old behavior exactly for the non-cowork case.
export function detachPtySession(id: string): void {
  const session = sessions.get(id);
  if (!session) return;
  sessions.delete(id);
  try { session.process.kill(); } catch {}
  if (!session.tmux) {
    console.log(`[devdash-agent] Session ${id} has no tmux backing — killed on detach`);
  }
}

// Agent shutdown: kill only our client PTYs. tmux-backed sessions stay
// alive on purpose — they're re-enumerated after restart and browsers
// reattach; a deploy must never destroy the user's running work.
export function closeAllSessions(): void {
  for (const [id, session] of sessions) {
    sessions.delete(id);
    try { session.process.kill(); } catch {}
  }
}

export function getActiveSessions(): string[] {
  return Array.from(sessions.keys());
}
