import { execFile } from 'child_process';

// tmux session enumeration + lifecycle for shared (cowork) sessions.
// The attach itself lives in pty-manager (a tmux attach spawned in node-pty
// reuses the whole existing PTY pipeline).

export interface TmuxSessionInfo {
  name: string;
  createdAt: number;      // unix seconds
  attached: number;       // attached client count
  lastActivity: number;   // unix seconds
  width: number;
  height: number;
  termProgram: string;
  origin: 'native' | 'browser';
  folder: string;
  folderPath: string;
  createdLocal: string;
  gitBranch: string;
}

// Field separator for list-sessions output. '|' was ambiguous: it is legal in
// BOTH a session name and a filesystem path, which forced a right-anchored
// parse and made adding a path field unparseable. \x1f (ASCII unit separator)
// cannot occur in either, so fields are read positionally.
export const SEP = '\x1f';

// pane_current_path is the session's LIVE working directory, straight from
// tmux. The @devdash_folder_path option is written once at session creation and
// never updated, so it lies the moment the user cds — and native sessions
// (created outside DevDash) may not carry it at all.
const LIST_FORMAT = [
  '#{session_name}',
  '#{session_created}',
  '#{session_attached}',
  '#{session_activity}',
  '#{window_width}',
  '#{window_height}',
  '#{pane_current_path}',
].join(SEP);

// Last path segment, ignoring trailing slashes. '/' and '' both yield ''.
function basename(path: string): string {
  const trimmed = path.replace(/\/+$/, '');
  if (!trimmed) return '';
  return trimmed.split('/').pop() || '';
}

// tmux replaces every non-printable byte in -F output with a literal '_'
// unless it is running in a UTF-8 locale. Measured on tmux 3.7b: with
// LANG=en_US.UTF-8 the \x1f separator comes back intact; with LANG=C, or with
// no locale variable set at all, `A\x1fB` arrives as `A_B`. launchd hands a
// daemon an environment containing no LANG, so under the installed service
// every list-sessions line arrived as ONE unsplittable field,
// parseSessionLine() returned null for all of them, and the agent reported
// zero tmux sessions forever — connected, authenticated, online and blind.
// Picking a different separator does not help: tab and \x01 are sanitized the
// same way. 'C.UTF-8' is accepted by both macOS and glibc. LC_ALL is the one
// that has to be set, since an explicit LC_ALL=C would override LC_CTYPE — and
// it is only set when the inherited locale is not UTF-8 already, so a user's
// own locale is left alone.
export function tmuxLocaleEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const current = env.LC_ALL || env.LC_CTYPE || env.LANG || '';
  if (/utf-?8/i.test(current)) return env;
  return { ...env, LC_ALL: 'C.UTF-8' };
}

function run(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile('tmux', args, { timeout: 5000, env: tmuxLocaleEnv(process.env) }, (err, stdout) => {
      if (err) reject(err);
      else resolve(stdout);
    });
  });
}

// A positive answer is cached forever — tmux does not get uninstalled under a
// running agent, and re-probing on every 5s poll is pure waste.
//
// A NEGATIVE answer is cached only briefly. It used to be permanent, and that
// turned "tmux was missing when the agent started" into a dead agent for the
// rest of its life: install tmux, and nothing came back until someone thought
// to restart the daemon. Nothing logged, either — pollTmuxSessions() just
// returned early — so the agent showed ONLINE while reporting no terminals and
// no AI sessions at all, with no way to tell why from the outside.
let available: boolean | null = null;
let lastProbeMs = 0;
let warnedUnavailable = false;
let warnedUnparsed = false;
const UNAVAILABLE_RECHECK_MS = 60_000;

export async function tmuxAvailable(now: () => number = Date.now): Promise<boolean> {
  if (available === true) return true;
  if (available === false && now() - lastProbeMs < UNAVAILABLE_RECHECK_MS) return false;

  lastProbeMs = now();
  try {
    await run(['-V']);
    available = true;
    if (warnedUnavailable) {
      console.log('[devdash-agent] tmux is now available — resuming session reporting.');
      warnedUnavailable = false;
    }
  } catch {
    available = false;
    // Say it once, with the PATH, because this is the single most common
    // reason an online agent reports nothing.
    if (!warnedUnavailable) {
      warnedUnavailable = true;
      console.error(
        '[devdash-agent] tmux not found on PATH — terminal sessions and AI sessions '
        + 'CANNOT be reported. Install tmux, or make it reachable from this PATH: '
        + (process.env.PATH || '(empty)')
      );
    }
  }
  return available;
}

/** Test seam: forget the cached probe result. */
export function resetTmuxAvailableCache(): void {
  available = null;
  lastProbeMs = 0;
  warnedUnavailable = false;
}

// Pure parser for one list-sessions line (kept separate for tests).
// Fields are \x1f-separated, so they can be read positionally — a session name
// or path containing '|' is no longer a problem.
export function parseSessionLine(
  line: string
): Omit<TmuxSessionInfo, 'termProgram' | 'origin'> | null {
  const parts = line.split(SEP);
  if (parts.length < 7) return null;
  const name = parts[0];
  if (!name) return null;
  const nums = parts.slice(1, 6).map((n) => parseInt(n, 10));
  if (nums.some((n) => Number.isNaN(n))) return null;
  const [createdAt, attached, lastActivity, width, height] = nums;
  const folderPath = parts[6] || '';
  return {
    name, createdAt, attached, lastActivity, width, height,
    folder: basename(folderPath), folderPath,
    createdLocal: '', gitBranch: '',
  };
}

export async function getSessionOption(name: string, option: string): Promise<string> {
  try {
    const out = await run(['show-options', '-t', name, '-qv', option]);
    return out.trim();
  } catch {
    return '';
  }
}

// These @-options are written once at session creation and never change, so
// they are safe to cache. folder/folderPath are deliberately NOT cached here:
// they now come live from #{pane_current_path} on every poll. The cached
// folder* entries are only the creation-time fallback for sessions that have
// no pane path.
const optionCache = new Map<string, {
  termProgram: string; origin: 'native' | 'browser';
  createdLocal: string; gitBranch: string;
  folderFallback: string; folderPathFallback: string;
}>();

export async function listSessions(): Promise<TmuxSessionInfo[]> {
  if (!(await tmuxAvailable())) return [];
  let out: string;
  try {
    out = await run(['list-sessions', '-F', LIST_FORMAT]);
  } catch {
    return []; // no tmux server running = no sessions
  }
  const sessions: TmuxSessionInfo[] = [];
  const liveNames = new Set<string>();
  let unparsed = 0;
  for (const line of out.split('\n')) {
    const base = parseSessionLine(line.trim());
    if (!base) {
      if (line.trim()) unparsed++;
      continue;
    }
    liveNames.add(base.name);
    let opts = optionCache.get(base.name);
    if (!opts) {
      const [termProgram, originRaw, folder, folderPath, createdLocal, gitBranch] = await Promise.all([
        getSessionOption(base.name, '@term_program'),
        getSessionOption(base.name, '@devdash_origin'),
        getSessionOption(base.name, '@devdash_folder'),
        getSessionOption(base.name, '@devdash_folder_path'),
        getSessionOption(base.name, '@devdash_created'),
        getSessionOption(base.name, '@devdash_git'),
      ]);
      opts = {
        termProgram: termProgram || 'unknown',
        origin: originRaw === 'browser' ? 'browser' : 'native',
        createdLocal, gitBranch,
        folderFallback: folder, folderPathFallback: folderPath,
      };
      optionCache.set(base.name, opts);
    }
    // Live pane path wins. The @devdash_* options are a creation-time snapshot
    // that goes stale as soon as the user cds, so they only fill in when tmux
    // reports no pane path at all.
    sessions.push({
      ...base,
      folder: base.folder || opts.folderFallback,
      folderPath: base.folderPath || opts.folderPathFallback,
      termProgram: opts.termProgram,
      origin: opts.origin,
      createdLocal: opts.createdLocal,
      gitBranch: opts.gitBranch,
    });
  }
  // tmux listed sessions but not one line survived the parse. That is a broken
  // agent, not an empty machine, and it used to be indistinguishable from one:
  // the poll reported an empty list forever with nothing on stdout to say why.
  // Say it once per process, with the offending line, so the next occurrence is
  // one log line rather than a day of measurement.
  if (unparsed > 0 && sessions.length === 0 && !warnedUnparsed) {
    warnedUnparsed = true;
    console.error(
      `[devdash-agent] tmux listed ${unparsed} session(s) but none could be parsed —`
      + ' reporting no terminals. First line was:'
      + ` ${JSON.stringify(out.split('\n')[0])}`
    );
  }
  for (const key of optionCache.keys()) {
    if (!liveNames.has(key)) optionCache.delete(key);
  }
  return sessions;
}

// tmux name for a server-issued session id. The id must survive intact: ids are
// `ses_` + random + Date.now().toString(36), and the base36 timestamp is exactly
// 8 chars — so keying off the last 8 chars would discard the random part and
// collide for any two sessions opened in the same millisecond.
export function tmuxSessionName(id: string): string {
  return `dd-${id.replace(/[^a-zA-Z0-9_-]/g, '')}`;
}

export interface KillDeps {
  run?: (args: string[]) => Promise<string>;
}

export interface KillResult {
  ok: boolean;
  error?: string;
}

// A missing session is success — the caller wanted it gone and it is gone.
const GONE_RE = /can't find session|session not found|no such session/i;

export async function killTmuxSession(name: string, deps: KillDeps = {}): Promise<KillResult> {
  const exec = deps.run || run;
  try {
    await exec(['kill-session', '-t', name]);
    return { ok: true };
  } catch (err: any) {
    const message = err?.message || 'kill-session failed';
    if (GONE_RE.test(message)) return { ok: true };
    return { ok: false, error: message };
  }
}

export async function countClients(name: string): Promise<number> {
  try {
    const out = await run(['list-clients', '-t', name]);
    return out.split('\n').filter((l) => l.trim()).length;
  } catch {
    return 0;
  }
}

// Exported for unit testing the tail slice without shelling out.
export function tailLines(text: string, lines: number): string {
  if (lines <= 0) return '';
  const rows = text.replace(/\n+$/, '').split('\n');
  return rows.slice(-lines).join('\n');
}

// Last `lines` lines of a session's active pane, for the preview description.
// Best-effort: '' on any failure or empty pane.
export async function capturePane(name: string, lines: number): Promise<string> {
  if (lines <= 0) return '';
  try {
    // -p prints to stdout, -t targets the session (its active pane).
    const out = await run(['capture-pane', '-p', '-t', name]);
    return tailLines(out, lines);
  } catch {
    return '';
  }
}
