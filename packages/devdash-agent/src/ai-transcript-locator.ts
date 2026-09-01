import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import { AiKind } from './ai-session-detector';

// Map a running agent process to the JSONL transcript it is writing.
//
// Two tiers, both measured on a real machine 2026-08-21:
//   1. lsof — some CLIs hold the transcript open for writing, which makes the
//      mapping exact. Always try this first.
//   2. cwd + newest — Claude Code opens, appends and closes, so lsof finds
//      nothing for it. Narrow by the process's true cwd and its
//      CLAUDE_CONFIG_DIR (which is how two subscriptions on one machine stay
//      apart), then take the newest file and VALIDATE it against the cwd
//      recorded inside the transcript itself.

const TRANSCRIPT_RE = /\.jsonl$/;
const CANDIDATE_RE = /\/(projects|sessions)\/.*\.jsonl$/;

export interface LocatorDeps {
  writeHandles?: (pid: number) => string[];
  procCwd?: (pid: number) => string;
  procEnv?: (pid: number) => Record<string, string>;
  procStartMs?: (pid: number) => number;
  listJsonl?: (dir: string) => { path: string; mtimeMs: number }[];
  transcriptCwds?: (path: string) => string[];
  // Transcripts already assigned to another pane in this pass. Two agents
  // running in one folder under one config home otherwise both resolve to the
  // newest file, and one of them shows the other's conversation.
  exclude?: Set<string>;
  /** Grok's own pid -> session map; see grokTranscript(). */
  grokSessions?: (home: string) => GrokSession[];
  /** Newest chat_history.jsonl under a grok cwd directory, for the fallback. */
  grokNewest?: (cwdDir: string) => { path: string; mtimeMs: number }[];
}

export interface GrokSession {
  session_id: string;
  pid: number;
  cwd: string;
}

// Grok stores a DIRECTORY per session, not a file:
//   ~/.grok/sessions/<encodeURIComponent(cwd)>/<session-uuid>/chat_history.jsonl
// The encoding is plain encodeURIComponent — verified against every session
// directory on a real machine (5/5 round-tripped exactly). Unlike Claude's
// replace-every-non-alphanumeric-with-dash scheme, this one is reversible,
// which is why the fallback below can decode a directory back to a cwd.
export function grokTranscriptPath(home: string, cwd: string, sessionId: string): string {
  return `${home}/.grok/sessions/${encodeURIComponent(cwd)}/${sessionId}/chat_history.jsonl`;
}

// Claude Code escapes the absolute path by replacing every character that is
// not a letter or digit with '-', so the leading slash becomes a leading dash
// and dots go too: /Users/me/www/saava.indianic.in
//   -> -Users-me-www-saava-indianic-in
//
// Derived by comparing 49 real project directories against the cwd recorded
// inside them. Replacing only '/' — the obvious first guess — was wrong for 10
// of those 49, every one of them a path containing a dot.
export function claudeProjectDir(configHome: string, cwd: string): string {
  return `${configHome}/projects/${cwd.replace(/[^a-zA-Z0-9]/g, '-')}`;
}

// Wall-clock start time of a process, ms since epoch; 0 when unknown.
// `lstart` prints e.g. "Thu Aug 20 13:09:44 2026", which Date.parse handles.
export function defaultProcStartMs(pid: number): number {
  try {
    const out = execFileSync('ps', ['-o', 'lstart=', '-p', String(pid)],
      { timeout: 5000, stdio: 'pipe' }).toString().trim();
    const parsed = Date.parse(out);
    return Number.isFinite(parsed) ? parsed : 0;
  } catch {
    return 0;
  }
}

export function pickNewest(files: { path: string; mtimeMs: number }[]): string | null {
  let best: { path: string; mtimeMs: number } | null = null;
  for (const f of files) {
    if (!best || f.mtimeMs > best.mtimeMs) best = f;
  }
  return best ? best.path : null;
}

function defaultWriteHandles(pid: number): string[] {
  try {
    // -F n prints one 'n<path>' line per open file.
    const out = execFileSync('lsof', ['-p', String(pid), '-F', 'n'],
      { timeout: 5000, stdio: 'pipe' }).toString();
    return out.split('\n').filter((l) => l.startsWith('n')).map((l) => l.slice(1));
  } catch {
    return [];
  }
}

function defaultProcCwd(pid: number): string {
  try {
    if (process.platform === 'linux') return fs.readlinkSync(`/proc/${pid}/cwd`);
    const out = execFileSync('lsof', ['-a', '-p', String(pid), '-d', 'cwd', '-F', 'n'],
      { timeout: 5000, stdio: 'pipe' }).toString();
    const line = out.split('\n').find((l) => l.startsWith('n'));
    return line ? line.slice(1) : '';
  } catch {
    return '';
  }
}

function defaultProcEnv(pid: number): Record<string, string> {
  const env: Record<string, string> = {};
  try {
    const raw = process.platform === 'linux'
      ? fs.readFileSync(`/proc/${pid}/environ`, 'utf8').split('\0')
      : execFileSync('ps', ['eww', '-p', String(pid), '-o', 'command='],
          { timeout: 5000, stdio: 'pipe' }).toString().split(' ');
    for (const pair of raw) {
      const eq = pair.indexOf('=');
      if (eq > 0) env[pair.slice(0, eq)] = pair.slice(eq + 1);
    }
  } catch { /* env is a refinement, never required */ }
  return env;
}

function defaultListJsonl(dir: string): { path: string; mtimeMs: number }[] {
  try {
    return fs.readdirSync(dir)
      .filter((n) => TRANSCRIPT_RE.test(n))
      .map((n) => ({ path: `${dir}/${n}`, mtimeMs: fs.statSync(`${dir}/${n}`).mtimeMs }));
  } catch {
    return [];
  }
}

// Every distinct cwd the head of the transcript mentions. Plural because a
// session's cwd drifts when the user moves between a repo and its worktree;
// measured on 3 of 49 real transcripts. Matching only the first record would
// reject those as belonging to another session.
//
// Reads only the head of the file — these grow to megabytes and this runs on
// every poll.
function defaultTranscriptCwds(path: string): string[] {
  try {
    const fd = fs.openSync(path, 'r');
    const buf = Buffer.alloc(64 * 1024);
    const read = fs.readSync(fd, buf, 0, buf.length, 0);
    fs.closeSync(fd);
    const found = new Set<string>();
    for (const line of buf.subarray(0, read).toString().split('\n')) {
      if (!line.trim()) continue;
      try {
        const rec = JSON.parse(line);
        if (typeof rec.cwd === 'string') found.add(rec.cwd);
        else if (typeof rec?.payload?.cwd === 'string') found.add(rec.payload.cwd);
      } catch { /* a truncated final line is normal */ }
    }
    return Array.from(found);
  } catch { /* unreadable */ }
  return [];
}

function defaultGrokSessions(home: string): GrokSession[] {
  try {
    const raw = JSON.parse(fs.readFileSync(`${home}/.grok/active_sessions.json`, 'utf8'));
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

function defaultGrokNewest(cwdDir: string): { path: string; mtimeMs: number }[] {
  try {
    return fs.readdirSync(cwdDir)
      .map((n) => `${cwdDir}/${n}/chat_history.jsonl`)
      .filter((p) => fs.existsSync(p))
      .map((p) => ({ path: p, mtimeMs: fs.statSync(p).mtimeMs }));
  } catch {
    return [];
  }
}

// Grok publishes its own pid -> session map at ~/.grok/active_sessions.json:
//   [{ "session_id": "...", "pid": 39647, "cwd": "/abs/path", "opened_at": "..." }]
//
// That is strictly better than either generic tier. lsof works only while the
// CLI holds the file open, and the cwd+newest tier cannot tell two grok
// sessions in one folder apart — the exact collision that made one Claude pane
// show another's conversation. An explicit pid is not a heuristic, so try it
// first and only fall back when the map has no row for this process (a stale
// file, or a session grok has not registered yet).
export function grokTranscript(
  pid: number,
  home: string,
  deps: LocatorDeps = {}
): string | null {
  const sessions = (deps.grokSessions || defaultGrokSessions)(home);
  const row = sessions.find((s) => s && s.pid === pid);
  if (!row || !row.session_id || !row.cwd) return null;
  return grokTranscriptPath(home, row.cwd, row.session_id);
}

export function locateTranscript(
  pid: number,
  kind: AiKind,
  deps: LocatorDeps = {}
): string | null {
  const writeHandles = deps.writeHandles || defaultWriteHandles;
  const procCwd = deps.procCwd || defaultProcCwd;
  const procEnv = deps.procEnv || defaultProcEnv;
  const procStartMs = deps.procStartMs || defaultProcStartMs;
  const listJsonl = deps.listJsonl || defaultListJsonl;
  const transcriptCwds = deps.transcriptCwds || defaultTranscriptCwds;
  const exclude = deps.exclude || new Set<string>();

  // Tier 0 — grok tells us outright which session a pid owns.
  if (kind === 'grok') {
    const home = procEnv(pid).HOME || os.homedir();
    const exact = grokTranscript(pid, home, deps);
    if (exact && !exclude.has(exact)) return exact;
  }

  // Tier 1 — exact.
  const held = writeHandles(pid).find((p) => CANDIDATE_RE.test(p));
  if (held) return held;

  // Tier 2 — narrow, then validate.
  const cwd = procCwd(pid);
  if (!cwd) return null;
  const env = procEnv(pid);
  const home = env.HOME || os.homedir();
  // Grok's transcripts sit one level deeper than the others and all share the
  // name chat_history.jsonl, so listJsonl() — which lists *.jsonl in one
  // directory — cannot see them at all. Walk its session dirs instead.
  if (kind === 'grok') {
    const grokNewest = deps.grokNewest || defaultGrokNewest;
    const startedAtGrok = procStartMs(pid);
    const found = grokNewest(`${home}/.grok/sessions/${encodeURIComponent(cwd)}`)
      .filter((f) => !exclude.has(f.path))
      .filter((f) => !startedAtGrok || f.mtimeMs >= startedAtGrok);
    return pickNewest(found);
  }

  const dir = kind === 'claude'
    ? claudeProjectDir(env.CLAUDE_CONFIG_DIR || `${home}/.claude`, cwd)
    : `${env.CODEX_HOME || `${home}/.codex`}/sessions`;

  // Every live session writes to its transcript at startup, so a file last
  // touched before this process launched belongs to a session that has ended.
  // startedAt of 0 means `ps` failed and the filter is skipped rather than
  // hiding every session.
  const startedAt = procStartMs(pid);
  const candidates = listJsonl(dir)
    .filter((f) => !exclude.has(f.path))
    .filter((f) => !startedAt || f.mtimeMs >= startedAt);

  const candidate = pickNewest(candidates);
  if (!candidate) return null;
  const recorded = transcriptCwds(candidate);
  // A transcript that names no directory we recognise belongs to another
  // session; attaching to it would show the user someone else's conversation.
  if (recorded.length && !recorded.includes(cwd)) return null;
  return candidate;
}
