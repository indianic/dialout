import { NextRequest, NextResponse } from 'next/server';
import { getSession, isEnrolled } from '@/lib/auth';
import { requestAiSessions, createAiSession, AI_PERMISSION_MODES, type AiSessionSummary } from '@/lib/daemon-status';
import { userOwnsMachine, listOwnedMachines } from '@/lib/machine-access';
import { parseMachineScope } from '@/lib/machine-scope';

// Session + 2FA are checked here deliberately. An AI session transcript is at
// least as sensitive as a terminal, so this follows the enforced routes, not
// the handful of legacy ones that trust the caller.
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!(await isEnrolled(session.userId))) {
    return NextResponse.json({ error: 'Two-factor enrollment required' }, { status: 403 });
  }

  const scope = parseMachineScope(req.nextUrl.searchParams.get('machineId'), session.machineId);

  if (scope === 'all') {
    const owned = await listOwnedMachines(session.userId);
    const results = await Promise.all(owned.map(async (m) => {
      const raw = await requestAiSessions(m.id);
      return { machine: m, raw };
    }));
    const sessions = results.flatMap(({ machine, raw }) => {
      if (raw === null) return [];
      return raw.map(publicSession).map((s) => ({
        ...s,
        machineId: machine.id,
        machineName: machine.name,
      }));
    });
    return NextResponse.json({
      sessions,
      machines: results.map(({ machine, raw }) => ({
        id: machine.id,
        name: machine.name,
        offline: raw === null,
      })),
      // Kept for the single-machine web banner: true only when every agent
      // is unreachable, which is the closest equivalent of the old flag.
      offline: results.length > 0 && results.every(({ raw }) => raw === null),
    });
  }

  // Reject an unowned id rather than quietly falling back to the session's own
  // machine — a silent fallback hides the attempt and returns data the caller
  // did not ask for.
  if (!(await userOwnsMachine(session.userId, scope))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const sessions = await requestAiSessions(scope);
  if (sessions === null) {
    return NextResponse.json({ sessions: [], offline: true, machines: [{ id: scope, offline: true }] });
  }
  // The transcript path is a server-side implementation detail and naming a
  // file on the user's disk buys the browser nothing.
  return NextResponse.json({
    sessions: sessions.map(publicSession),
    machines: [{ id: scope, offline: false }],
    offline: false,
  });
}

function publicSession(s: AiSessionSummary) {
  const { transcript: _t, folderPath: _p, ...rest } = s;
  return rest;
}

// POST — start a new AI session on a machine.
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!(await isEnrolled(session.userId))) {
    return NextResponse.json({ error: 'Two-factor enrollment required' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const machineId = parseInt(String(body.machineId || ''), 10) || session.machineId;
  if (!(await userOwnsMachine(session.userId, machineId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const cwd = String(body.cwd || '').trim();
  const prompt = String(body.prompt || '').trim();
  if (!cwd || !prompt) {
    return NextResponse.json({ error: 'A folder and a first message are required' }, { status: 400 });
  }

  // Validate the trust level here as well as in the agent. An unknown value
  // must never reach the CLI, where a wrong string could mean far more
  // permission than the user picked rather than less.
  const permissionMode = (AI_PERMISSION_MODES as readonly string[]).includes(body.permissionMode)
    ? body.permissionMode
    : 'default';

  const id = await createAiSession(machineId, {
    // LAUNCH only. Attach mode lists grok too, but launching needs a
    // one-turn headless mode (`claude -p --resume`), and only Claude Code
    // offers one — so an unknown kind falls back to claude rather than
    // spawning a CLI that would sit in a TUI nobody can reach.
    kind: body.kind === 'codex' ? 'codex' : 'claude',
    cwd,
    prompt,
    permissionMode,
    configHome: typeof body.configHome === 'string' ? body.configHome : undefined,
  });

  if (!id) {
    return NextResponse.json({ error: 'Could not start the session' }, { status: 503 });
  }
  return NextResponse.json({ id });
}
