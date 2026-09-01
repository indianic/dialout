// Single source of truth for "which env var proves which terminal". Both the
// generated shell gate (cowork.ts) and Node-side detection (terminal-detect.ts)
// are rewired onto this table so they can no longer drift apart.

import * as fs from 'fs';

export interface EnvMarker {
  /** Env var whose non-empty presence identifies the terminal. */
  envVar: string;
  /** Canonical token, must satisfy /^[A-Za-z0-9._-]+$/. */
  token: string;
}

/**
 * The generic VTE catch-all token (ENV_MARKERS' last entry).
 *
 * PROVISIONAL, not final. Every VTE-based terminal exports VTE_VERSION, so a
 * bare `vte` result only means "some VTE terminal" — it does NOT mean env
 * resolution identified the emulator. Terminals like xfce4-terminal set no
 * specific env marker but ARE in PROC_NAMES, so a `vte` result must not stop
 * resolution: the /proc walk still runs and a specific token from it wins,
 * with `vte` restored when the walk finds nothing. Both sides implement this —
 * currentTerminalToken() in terminal-detect.ts and the walk guard emitted by
 * renderProcWalk() in cowork.ts — so they resolve identically (Constraint 5).
 *
 * Without it, the "XFCE Terminal" checklist row could never be `current` and
 * selecting it was a silent no-op: the exact bug this branch exists to fix.
 */
export const GENERIC_ENV_TOKEN = 'vte';

// Order matters: more specific markers first, VTE_VERSION last as the generic
// catch-all — every VTE-based terminal (gnome-terminal, tilix, terminator,
// xfce4-terminal, guake) sets it, so it's only reached when nothing more
// specific matched. See GENERIC_ENV_TOKEN: matching it is provisional, and the
// /proc walk still gets a chance to name the emulator exactly.
export const ENV_MARKERS: EnvMarker[] = [
  { envVar: 'KITTY_WINDOW_ID', token: 'kitty' },
  { envVar: 'ALACRITTY_WINDOW_ID', token: 'alacritty' },
  { envVar: 'WEZTERM_PANE', token: 'WezTerm' },
  { envVar: 'KONSOLE_VERSION', token: 'konsole' },
  { envVar: 'TILIX_ID', token: 'tilix' },
  { envVar: 'TERMINATOR_UUID', token: 'terminator' },
  { envVar: 'GNOME_TERMINAL_SCREEN', token: 'gnome-terminal' },
  { envVar: 'GNOME_TERMINAL_SERVICE', token: 'gnome-terminal' },
  { envVar: 'VTE_VERSION', token: GENERIC_ENV_TOKEN },
];

/** Resolve a token from env: TERM_PROGRAM first, then ENV_MARKERS in order. */
export function tokenFromEnv(env: NodeJS.ProcessEnv): string {
  // Inside tmux the real outer app is unknowable → report unknown.
  if (env.TMUX || env.TERM_PROGRAM === 'tmux') return '';
  if (env.TERM_PROGRAM) return env.TERM_PROGRAM;
  for (const { envVar, token } of ENV_MARKERS) {
    if (env[envVar]) return token;
  }
  return '';
}

// --- /proc process-tree fallback ---
//
// Some Linux terminals (xfce4-terminal, foot, urxvt, xterm, st, ...) set no
// distinguishing env var at all, so tokenFromEnv() returns '' for them. These
// can still be identified by walking up the process tree (via /proc) and
// matching the emulator's process name.

/** Linux emulator process names (from /proc/<pid>/comm) → canonical token. */
export const PROC_NAMES: Record<string, string> = {
  'xfce4-terminal': 'xfce4-terminal',
  foot: 'foot',
  urxvt: 'urxvt',
  'rxvt-unicode': 'urxvt',
  xterm: 'xterm',
  st: 'st',
  konsole: 'konsole',
  // The kernel truncates /proc/<pid>/comm to 15 chars, so
  // "gnome-terminal-server" is stored (and looked up) as "gnome-terminal-".
  'gnome-terminal-': 'gnome-terminal',
  tilix: 'tilix',
  terminator: 'terminator',
  alacritty: 'alacritty',
  kitty: 'kitty',
  'wezterm-gui': 'WezTerm',
};

export interface ProcDeps {
  /** Returns the trimmed contents of /proc/<pid>/comm. */
  readComm?: (pid: number) => string;
  /** Returns the ppid parsed from /proc/<pid>/stat. */
  readPPid?: (pid: number) => number;
}

/**
 * Parses the ppid out of raw /proc/<pid>/stat contents. Must parse from the
 * LAST ")" forward: the process name (2nd field, in parens) can itself
 * contain spaces and parentheses, so a naive whitespace split would grab the
 * wrong field. After the last ")" the remaining fields are: state, ppid, ...
 */
export function ppidFromStat(stat: string): number {
  const rest = stat.slice(stat.lastIndexOf(')') + 1).trim().split(/\s+/);
  return parseInt(rest[1], 10);
}

function defaultReadComm(pid: number): string {
  return fs.readFileSync(`/proc/${pid}/comm`, 'utf8').trim();
}

function defaultReadPPid(pid: number): number {
  return ppidFromStat(fs.readFileSync(`/proc/${pid}/stat`, 'utf8'));
}

/**
 * Walks up the process tree from startPid, at most 10 levels, looking for a
 * comm that matches PROC_NAMES. Returns the first matching token, or '' if
 * nothing matched, the bound was hit, or any read failed.
 *
 * This runs on every interactive shell start (via the generated rc block's
 * shell-equivalent walk), so the 10-level bound is a hard requirement, and a
 * read failure (e.g. no /proc on macOS) must end the walk silently rather
 * than throw.
 */
export function tokenFromProcTree(startPid: number, deps: ProcDeps = {}): string {
  const readComm = deps.readComm ?? defaultReadComm;
  const readPPid = deps.readPPid ?? defaultReadPPid;

  let pid = startPid;
  for (let level = 0; level < 10; level++) {
    if (pid <= 1) return '';

    let comm: string;
    try {
      comm = readComm(pid);
    } catch {
      return '';
    }

    // Guard against prototype-chain collisions: a comm of e.g. "constructor"
    // or "toString" is a valid (if adversarial) 15-char-or-shorter process
    // name, and PROC_NAMES is a plain object literal, so an unguarded
    // PROC_NAMES[comm] lookup would resolve to an inherited Object.prototype
    // member (a function, always truthy) instead of undefined.
    if (Object.prototype.hasOwnProperty.call(PROC_NAMES, comm)) {
      return PROC_NAMES[comm];
    }

    let ppid: number;
    try {
      ppid = readPPid(pid);
    } catch {
      return '';
    }
    if (!Number.isFinite(ppid)) return '';
    pid = ppid;
  }
  return '';
}
