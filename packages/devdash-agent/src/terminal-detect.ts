import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { hasCommand as defaultHasCommand } from './has-command';
import {
  tokenFromEnv, tokenFromProcTree, ProcDeps, GENERIC_ENV_TOKEN,
} from './terminal-markers';

export interface KnownTerminal {
  /** Display name for the checklist, e.g. "iTerm". */
  name: string;
  /** Canonical token stored in config and matched at runtime. */
  token: string;
  /** macOS .app bundle basenames that indicate it is installed. */
  appBundles: string[];
  /** true when the app bundle is present on disk (or launcher present on Linux). */
  installed: boolean;
  /** true when this is the terminal setup is currently running in. */
  current: boolean;
}

interface KnownEntry {
  name: string;
  token: string;
  appBundles: string[];
  /** Linux launcher binaries checked via `command -v` (best-effort). */
  linuxBins: string[];
}

// token = TERM_PROGRAM value unless noted; runtime marker fallbacks handled in
// currentTerminalToken(). Order here is the checklist's base order.
const KNOWN_TERMINALS: KnownEntry[] = [
  { name: 'Hyper',          token: 'Hyper',          appBundles: ['Hyper.app'],                              linuxBins: ['hyper'] },
  { name: 'iTerm',          token: 'iTerm.app',      appBundles: ['iTerm.app'],                              linuxBins: [] },
  { name: 'Apple Terminal', token: 'Apple_Terminal', appBundles: ['Terminal.app'],                           linuxBins: [] },
  { name: 'VS Code',        token: 'vscode',         appBundles: ['Visual Studio Code.app', 'Code.app'],     linuxBins: ['code'] },
  { name: 'Ghostty',        token: 'ghostty',        appBundles: ['Ghostty.app'],                            linuxBins: ['ghostty'] },
  { name: 'WezTerm',        token: 'WezTerm',        appBundles: ['WezTerm.app'],                            linuxBins: ['wezterm'] },
  { name: 'Kitty',          token: 'kitty',          appBundles: ['kitty.app'],                              linuxBins: ['kitty'] },
  { name: 'Alacritty',      token: 'alacritty',      appBundles: ['Alacritty.app'],                          linuxBins: ['alacritty'] },
  { name: 'GNOME Terminal', token: 'gnome-terminal', appBundles: [],                                         linuxBins: ['gnome-terminal'] },
  { name: 'Konsole',        token: 'konsole',        appBundles: [],                                         linuxBins: ['konsole'] },
  // Newly-detectable via the /proc process-tree fallback (terminal-markers.ts)
  // — appended after Konsole so the existing macOS checklist order is untouched.
  { name: 'Tilix',          token: 'tilix',          appBundles: [],                                         linuxBins: ['tilix'] },
  { name: 'Terminator',     token: 'terminator',     appBundles: [],                                         linuxBins: ['terminator'] },
  { name: 'XFCE Terminal',  token: 'xfce4-terminal', appBundles: [],                                         linuxBins: ['xfce4-terminal'] },
  { name: 'Foot',           token: 'foot',           appBundles: [],                                         linuxBins: ['foot'] },
  { name: 'urxvt',          token: 'urxvt',          appBundles: [],                                         linuxBins: ['urxvt'] },
  { name: 'xterm',          token: 'xterm',          appBundles: [],                                         linuxBins: ['xterm'] },
];

export interface DetectDeps {
  env?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
  /** macOS: true when the given .app bundle exists in a standard location. */
  appExists?: (bundle: string) => boolean;
  /** Linux: true when the given launcher binary is on PATH. */
  hasCommand?: (bin: string) => boolean;
  /** Injectable for testing the /proc fallback; see currentTerminalToken. */
  ppid?: number;
  /** Injectable for testing the /proc fallback; see currentTerminalToken. */
  procDeps?: ProcDeps;
}

/** Optional injectable deps for currentTerminalToken's /proc fallback, for testing. */
export interface CurrentTokenDeps {
  ppid?: number;
  platform?: NodeJS.Platform;
  procDeps?: ProcDeps;
}

const APP_DIRS = [
  '/Applications',
  path.join(os.homedir(), 'Applications'),
  '/System/Applications',
  '/System/Applications/Utilities',
];

function defaultAppExists(bundle: string): boolean {
  for (const dir of APP_DIRS) {
    try {
      if (fs.existsSync(path.join(dir, bundle))) return true;
    } catch {
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
export function currentTerminalToken(
  env: NodeJS.ProcessEnv = process.env,
  deps: CurrentTokenDeps = {}
): string {
  const token = tokenFromEnv(env);
  if (token !== '' && token !== GENERIC_ENV_TOKEN) return token;

  const platform = deps.platform ?? process.platform;
  // Non-linux has no /proc: keep whatever env gave us (including "vte").
  if (platform !== 'linux') return token;

  const ppid = deps.ppid ?? process.ppid;
  return tokenFromProcTree(ppid, deps.procDeps) || token;
}

export function detectTerminals(deps: DetectDeps = {}): KnownTerminal[] {
  const env = deps.env ?? process.env;
  const platform = deps.platform ?? process.platform;
  const appExists = deps.appExists ?? defaultAppExists;
  const hasCommand = deps.hasCommand ?? defaultHasCommand;
  const currentToken = currentTerminalToken(env, {
    platform,
    ppid: deps.ppid,
    procDeps: deps.procDeps,
  });

  const rows: KnownTerminal[] = KNOWN_TERMINALS.map((e) => {
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
