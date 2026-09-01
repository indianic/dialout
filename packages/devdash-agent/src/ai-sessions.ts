import { execFile, execFileSync } from 'child_process';
import * as fs from 'fs';
import { AiKind, findAgentInPane, readProcessTable, ProcRow } from './ai-session-detector';
import { locateTranscript, defaultProcStartMs, claudeProjectDir } from './ai-transcript-locator';
import {
  LaunchedRecord, PermissionMode, PERMISSION_MODES, launchId, isLaunchId, parseLaunchId,
  listRecords, addRecord, removeRecord, runTurn, isTurnRunning, stopTurn, stopAllTurns,
} from './ai-launch';
import * as os from 'os';
import { randomUUID } from 'crypto';
import { TranscriptTail } from './ai-transcript-tail';
import { adapterFor, AiEvent, AiStatus } from './ai-adapters';
import { deriveStatus } from './ai-status';
import { listSessions } from './tmux-manager';
import type { AiSessionSummary } from '@dialout/shared';
import { REPLAY_LIMIT } from '@dialout/shared';

export type { AiSessionSummary };
export { REPLAY_LIMIT };

interface LiveSession {
  tail: TranscriptTail;
  events: AiEvent[];
  kind: AiKind;
  title: string;
}

const open = new Map<string, LiveSession>();

export interface DiscoverDeps {
  listSessions?: () => Promise<any[]>;
  panePid?: (tmuxName: string) => number;
  processTable?: () => Promise<ProcRow[]>;
  locate?: (pid: number, kind: AiKind, exclude: Set<string>) => string | null;
  procStartMs?: (pid: number) => number;
  profileOf?: (pid: number) => string;
}

function defaultPanePid(tmuxName: string): number {
  try {
    const out = execFileSync('tmux', ['list-panes', '-t', tmuxName, '-F', '#{pane_pid}'],
      { timeout: 5000, stdio: 'pipe' }).toString();
    return parseInt(out.split('\n')[0], 10) || 0;
  } catch {
    return 0;
  }
}

// The label that keeps two Claude subscriptions on one machine apart. DevDash
// never sees an account — only which config home the process was started with.
function defaultProfileOf(pid: number): string {
  try {
    const env = process.platform === 'linux'
      ? fs.readFileSync(`/proc/${pid}/environ`, 'utf8')
      : execFileSync('ps', ['eww', '-p', String(pid), '-o', 'command='],
          { timeout: 5000, stdio: 'pipe' }).toString();
    const m = env.match(/CLAUDE_CONFIG_DIR=([^\s\0]+)/);
    if (!m) return 'default';
    const parts = m[1].split('/').filter(Boolean);
    return parts[parts.length - 1] || 'default';
  } catch {
    return 'default';
  }
}

export function launchedTranscript(rec: LaunchedRecord): string {
  // Must match the config home the CHILD will actually use, not a guess. The
  // child inherits the agent's environment, so an agent started under a
  // non-default CLAUDE_CONFIG_DIR writes its transcripts there — predicting
  // ~/.claude would point at a file that never appears.
  const home = rec.configHome
    || process.env.CLAUDE_CONFIG_DIR
    || `${os.homedir()}/.claude`;
  return `${claudeProjectDir(home, rec.cwd)}/${rec.sessionId}.jsonl`;
}

// Launched sessions are not tmux sessions, so they are listed from the agent's
// own registry rather than discovered. Their transcript path is deterministic
// because DevDash chose the session id when it started them.
export function listLaunchedSessions(): AiSessionSummary[] {
  return listRecords().map((rec) => {
    const live = open.get(launchId(rec.sessionId));
    const running = isTurnRunning(rec.sessionId);
    return {
      tmuxName: launchId(rec.sessionId),
      kind: rec.kind,
      title: live?.title || rec.title || rec.sessionId.slice(0, 8),
      folder: rec.cwd.split('/').filter(Boolean).pop() || '',
      folderPath: rec.cwd,
      gitBranch: '',
      profile: rec.configHome ? rec.configHome.split('/').filter(Boolean).pop()! : 'default',
      // A turn in flight is definitive: the process is running right now, so
      // there is no need to infer 'working' from transcript timing.
      status: running
        ? 'working'
        : (live ? deriveStatus(live.events, live.tail.lastGrowthMs, Date.now()) : 'waiting_input'),
      origin: 'launched' as const,
      permissionMode: rec.permissionMode,
      updatedAt: rec.createdAt,
      transcript: launchedTranscript(rec),
    };
  });
}

export async function discoverAiSessions(deps: DiscoverDeps = {}): Promise<AiSessionSummary[]> {
  const list = deps.listSessions || listSessions;
  const panePid = deps.panePid || defaultPanePid;
  const table = deps.processTable || (() => readProcessTable());
  const locate = deps.locate
    || ((pid: number, kind: AiKind, exclude: Set<string>) =>
      locateTranscript(pid, kind, { exclude }));
  const procStartMs = deps.procStartMs || defaultProcStartMs;
  const profileOf = deps.profileOf || defaultProfileOf;

  const rows = await table();

  // Resolve the agent process for every pane first, then claim transcripts
  // newest-process-first. Two claude sessions in one folder under one config
  // home both match the same directory, so without a claim set the newer one
  // wins twice and the older pane shows the newer pane's conversation.
  // Verified live on 2026-08-21: two panes, two pids, one transcript.
  const panes = [];
  for (const session of await list()) {
    const pid = panePid(session.name);
    if (!pid) continue;
    const agent = findAgentInPane(rows, pid);
    if (!agent) continue;
    panes.push({ session, agent, startedAt: procStartMs(agent.pid) });
  }
  panes.sort((a, b) => b.startedAt - a.startedAt);

  const claimed = new Set<string>();
  const out: AiSessionSummary[] = [];
  for (const { session, agent } of panes) {
    // A session whose transcript cannot be found is not showable as chat.
    // Listing it would produce a row that opens into permanent emptiness.
    const transcript = locate(agent.pid, agent.kind, claimed);
    if (!transcript) continue;
    claimed.add(transcript);

    const live = open.get(session.name);
    out.push({
      tmuxName: session.name,
      kind: agent.kind,
      title: live?.title || session.folder || session.name,
      folder: session.folder || '',
      folderPath: session.folderPath || '',
      gitBranch: session.gitBranch || '',
      profile: profileOf(agent.pid),
      status: live ? deriveStatus(live.events, live.tail.lastGrowthMs, Date.now()) : 'idle',
      origin: 'tmux',
      updatedAt: (session.lastActivity || 0) * 1000,
      transcript,
    });
  }
  // Launched sessions come from the registry, not from tmux, and are listed
  // alongside so the user sees one list rather than two.
  return [...out, ...(deps.listSessions ? [] : listLaunchedSessions())];
}

export interface CreateSessionOptions {
  kind?: AiKind;
  cwd: string;
  prompt: string;
  permissionMode?: string;
  configHome?: string;
}

// Start a brand-new session and send its first message. Returns the id the
// browser should open, or null if the request was unusable.
export function createAiSession(opts: CreateSessionOptions): string | null {
  const cwd = String(opts.cwd || '').trim();
  const prompt = String(opts.prompt || '').trim();
  // An absolute path only: a relative one would resolve against the agent's
  // own working directory, which is not where the user thinks they are.
  if (!cwd.startsWith('/') || !prompt) return null;
  try {
    if (!fs.statSync(cwd).isDirectory()) return null;
  } catch {
    return null;
  }

  const mode = (PERMISSION_MODES as string[]).includes(String(opts.permissionMode))
    ? (opts.permissionMode as PermissionMode)
    : 'default';

  const rec: LaunchedRecord = {
    sessionId: randomUUID(),
    kind: opts.kind === 'codex' ? 'codex' : 'claude',
    cwd,
    // The first prompt is the best title we have until the CLI writes its own.
    title: prompt.slice(0, 60),
    permissionMode: mode,
    configHome: String(opts.configHome || ''),
    createdAt: Date.now(),
  };
  addRecord(rec);
  runTurn(rec, prompt, true);
  return launchId(rec.sessionId);
}

export function deleteAiSession(id: string): boolean {
  const sessionId = parseLaunchId(id);
  if (!sessionId) return false;
  stopTurn(sessionId);
  closeAiSession(id);
  removeRecord(sessionId);
  return true;
}

export function openAiSession(
  tmuxName: string,
  onEvents: (events: AiEvent[], status: AiStatus) => void
): void {
  closeAiSession(tmuxName);

  void (async () => {
    // Ask discovery rather than resolving again: it is the only place that
    // claims transcripts across all panes, so re-resolving here in isolation
    // would race the other panes and could pick a different file than the row
    // the user tapped.
    const row = isLaunchId(tmuxName)
      ? listLaunchedSessions().find((r) => r.tmuxName === tmuxName)
      : (await discoverAiSessions()).find((r) => r.tmuxName === tmuxName);
    if (!row || !row.transcript) return;
    const path = row.transcript;

    const adapter = adapterFor(row.kind);
    const live: LiveSession = {
      tail: null as unknown as TranscriptTail,
      events: [], kind: row.kind, title: '',
    };

    live.tail = new TranscriptTail(path, (records) => {
      const batch: AiEvent[] = [];
      for (const record of records) {
        const title = adapter.title(record);
        if (title) live.title = title;
        batch.push(...adapter.toEvents(record));
      }
      live.events.push(...batch);
      // Bound memory: a long session's transcript is unbounded, the agent's
      // heap is not.
      if (live.events.length > REPLAY_LIMIT * 5) {
        live.events = live.events.slice(-REPLAY_LIMIT * 5);
      }
      if (batch.length) {
        onEvents(batch, deriveStatus(live.events, live.tail.lastGrowthMs, Date.now()));
      }
    });

    open.set(tmuxName, live);
    live.tail.start();
  })();
}

export function closeAiSession(tmuxName: string): void {
  const live = open.get(tmuxName);
  if (!live) return;
  live.tail.stop();
  open.delete(tmuxName);
}

export function closeAllAiSessions(): void {
  for (const name of Array.from(open.keys())) closeAiSession(name);
  // Turns are child processes; leaving them running after a disconnect would
  // orphan them with nobody reading the result.
  stopAllTurns();
}

// Named keys must be sent as key presses, not literal text: sending the byte
// 0x03 literally types a control character into the buffer instead of
// interrupting the agent.
const NAMED_KEYS: Record<string, string> = {
  '\u001b': 'Escape',
  '\u0003': 'C-c',
  '\r': 'Enter',
  '\t': 'Tab',
};

export function sendKeysArgs(tmuxName: string, text: string): string[][] {
  const named = NAMED_KEYS[text];
  if (named) return [['send-keys', '-t', tmuxName, named]];
  return [
    // `-l` sends literally; `--` stops tmux parsing text that starts with '-'
    // as an option, which would otherwise let composed text run tmux commands.
    ['send-keys', '-t', tmuxName, '-l', '--', text],
    ['send-keys', '-t', tmuxName, 'Enter'],
  ];
}

export interface SendDeps {
  run?: (args: string[]) => void;
}

export function sendAiInput(tmuxName: string, text: string, deps: SendDeps = {}): void {
  // A launched session takes structured input on stdin; a tmux one takes
  // keystrokes. Same call site, different mechanism.
  const sessionId = parseLaunchId(tmuxName);
  if (sessionId) {
    const rec = listRecords().find((r) => r.sessionId === sessionId);
    if (rec) runTurn(rec, text, false);
    return;
  }
  const run = deps.run || ((args: string[]) => {
    execFile('tmux', args, { timeout: 5000 }, () => { /* best effort */ });
  });
  for (const args of sendKeysArgs(tmuxName, text)) run(args);
}
