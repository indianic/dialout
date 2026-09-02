import { spawn } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { AiKind, PermissionMode, PERMISSION_MODES } from '@dialout/shared';
import { configDirFor } from './config';
export type { PermissionMode };
export { PERMISSION_MODES };

// Launch mode: sessions DevDash starts, rather than ones the user started in
// their own terminal.
//
// Turn-based by design. Each message spawns
//   claude -p --resume <uuid> --input-format stream-json --output-format stream-json
// which runs that one turn, appends to the session's transcript, and exits.
// There is no long-lived child to supervise, an agent restart loses nothing,
// and a session stays resumable forever because the transcript IS the state.
//
// The transcript it writes is byte-identical in shape and location to the one
// a native session writes, so the entire attach-mode read path — tail,
// adapter, status — works on launched sessions with no changes at all.
//
// What this deliberately does NOT do is per-tool Allow/Deny. Verified against
// CLI 2.1.238 on 2026-08-21: --permission-mode manual emits no permission
// event over stream-json (the tool simply runs), and there is no
// --permission-prompt-tool flag. A canUseTool callback exists only in the
// Agent SDK. So the trust level is chosen once, at launch.

const LAUNCH_PREFIX = 'launch:';

export interface LaunchedRecord {
  sessionId: string;
  kind: AiKind;
  cwd: string;
  title: string;
  permissionMode: PermissionMode;
  configHome: string;
  createdAt: number;
}

// Launched sessions share a list with tmux ones, so their ids are namespaced.
// A tmux session cannot contain ':' in a name that reaches us, so the two can
// never be confused.
export function launchId(sessionId: string): string {
  return `${LAUNCH_PREFIX}${sessionId}`;
}

export function isLaunchId(id: string): boolean {
  return id.startsWith(LAUNCH_PREFIX);
}

export function parseLaunchId(id: string): string | null {
  return isLaunchId(id) ? id.slice(LAUNCH_PREFIX.length) : null;
}

function safeMode(mode: string): PermissionMode {
  return (PERMISSION_MODES as string[]).includes(mode)
    ? (mode as PermissionMode)
    : 'default';
}

export function buildLaunchArgs(rec: LaunchedRecord, firstTurn: boolean): string[] {
  if (rec.kind === 'codex') {
    // Codex has no --session-id; it names its own rollout file. Resuming is
    // done by its own subcommand, so v1 launches a fresh codex exec per turn
    // and relies on the rollout for history.
    return ['exec', '--json', '-'];
  }
  return [
    '-p',
    '--input-format', 'stream-json',
    '--output-format', 'stream-json',
    '--verbose',
    ...(firstTurn ? ['--session-id', rec.sessionId] : ['--resume', rec.sessionId]),
    '--permission-mode', safeMode(rec.permissionMode),
  ];
}

// --- registry ---------------------------------------------------------------
// Launched sessions are not tmux sessions, so nothing on the machine remembers
// them. This file is what lets them survive an agent restart and keep showing
// up in the list.

export interface RegistryDeps {
  read?: () => string;
  write?: (text: string) => void;
}

function registryPath(): string {
  return path.join(configDirFor(os.homedir()), 'ai-launched.json');
}

function defaultRead(): string {
  return fs.readFileSync(registryPath(), 'utf8');
}

function defaultWrite(text: string): void {
  const file = registryPath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
}

export function listRecords(deps: RegistryDeps = {}): LaunchedRecord[] {
  const read = deps.read || defaultRead;
  try {
    const parsed = JSON.parse(read());
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    // Missing or corrupt. An unreadable registry must not take the agent down
    // with it; the worst case is that launched sessions stop being listed.
    return [];
  }
}

export function addRecord(rec: LaunchedRecord, deps: RegistryDeps = {}): void {
  const write = deps.write || defaultWrite;
  const others = listRecords(deps).filter((r) => r.sessionId !== rec.sessionId);
  write(JSON.stringify([...others, rec], null, 2));
}

export function removeRecord(sessionId: string, deps: RegistryDeps = {}): void {
  const write = deps.write || defaultWrite;
  write(JSON.stringify(listRecords(deps).filter((r) => r.sessionId !== sessionId), null, 2));
}

// --- running turns ----------------------------------------------------------

// sessionId -> the child currently running a turn for it. Presence here is
// what makes a launched session read as 'working'.
const running = new Map<string, { startedAt: number; kill: () => void }>();

export function isTurnRunning(sessionId: string): boolean {
  return running.has(sessionId);
}

export function runningSessionIds(): string[] {
  return Array.from(running.keys());
}

export interface RunTurnDeps {
  spawnTurn?: (rec: LaunchedRecord, args: string[], input: string) => {
    on: (event: string, cb: (...a: any[]) => void) => void;
    kill: () => void;
  };
}

// Send one message and let the turn run to completion in the background.
// Returns immediately: the answer arrives through the transcript tail, exactly
// as it does for a session the user started themselves.
export function runTurn(
  rec: LaunchedRecord,
  text: string,
  firstTurn: boolean,
  onDone?: (ok: boolean) => void,
  deps: RunTurnDeps = {}
): void {
  if (running.has(rec.sessionId)) {
    // A turn is already in flight. Claude Code cannot process two at once, and
    // resuming the same session twice would fork the transcript.
    return;
  }

  const args = buildLaunchArgs(rec, firstTurn);
  const message = JSON.stringify({
    type: 'user',
    message: { role: 'user', content: [{ type: 'text', text }] },
  });

  const spawnTurn = deps.spawnTurn || ((r: LaunchedRecord, a: string[], input: string) => {
    const env = { ...process.env };
    if (r.configHome) env.CLAUDE_CONFIG_DIR = r.configHome;
    const child = spawn(r.kind === 'claude' ? 'claude' : 'codex', a, {
      cwd: r.cwd,
      env,
      stdio: ['pipe', 'ignore', 'ignore'],
    });
    // stdout is ignored on purpose: the transcript on disk is the source of
    // truth and is already being tailed. Reading both would double-render.
    try {
      child.stdin.write(`${input}\n`);
      child.stdin.end();
    } catch { /* the child died before we could write; 'close' still fires */ }
    return child;
  });

  let child;
  try {
    child = spawnTurn(rec, args, message);
  } catch {
    onDone?.(false);
    return;
  }

  running.set(rec.sessionId, { startedAt: Date.now(), kill: () => { try { child.kill(); } catch { /* already gone */ } } });

  child.on('close', (code: number) => {
    running.delete(rec.sessionId);
    onDone?.(code === 0);
  });
  child.on('error', () => {
    running.delete(rec.sessionId);
    onDone?.(false);
  });
}

export function stopTurn(sessionId: string): void {
  running.get(sessionId)?.kill();
  running.delete(sessionId);
}

export function stopAllTurns(): void {
  for (const id of Array.from(running.keys())) stopTurn(id);
}
