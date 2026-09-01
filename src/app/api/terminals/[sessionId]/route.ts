import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { terminalSessions } from '@/lib/schema';
import { eq, and } from 'drizzle-orm';
import { getSession } from '@/lib/auth';
import { requestKillTmux } from '@/lib/daemon-status';

// GET — get session details
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { sessionId } = await params;
  const id = parseInt(sessionId, 10);

  // Scope to the caller — a bare session id exposed another user's command
  // line and working directory.
  const [termSession] = await db
    .select()
    .from(terminalSessions)
    .where(and(eq(terminalSessions.id, id), eq(terminalSessions.userId, session.userId)));

  if (!termSession) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  }

  return NextResponse.json(termSession);
}

// PUT — mark session as ended
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { sessionId } = await params;
  const id = parseInt(sessionId, 10);
  const { exitCode } = await request.json();

  // Scoped to the caller — otherwise any user could mark any session ended.
  const [updated] = await db
    .update(terminalSessions)
    .set({
      endedAt: new Date().toISOString(),
      exitCode: exitCode ?? null,
    })
    .where(and(eq(terminalSessions.id, id), eq(terminalSessions.userId, session.userId)))
    .returning();

  if (!updated) return NextResponse.json({ error: 'Session not found' }, { status: 404 });

  return NextResponse.json(updated);
}

// DELETE — kill a terminal session. For a tmux-backed session (native or
// browser) this actually terminates the session on the machine via the agent
// (tmux kill-session), then marks the row not-live + ended. Killing the tmux
// session is what makes it stay gone: a mere is_live=false is re-inserted by
// the agent's next report while the session still exists. If the machine is
// offline we can't reach the tmux, so we just mark the row ended (best effort).
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { sessionId } = await params;
  const id = parseInt(sessionId, 10);
  if (Number.isNaN(id)) return NextResponse.json({ error: 'Invalid session id' }, { status: 400 });

  // Scope to the caller's own sessions — never let one user kill another's.
  const [target] = await db
    .select()
    .from(terminalSessions)
    .where(and(eq(terminalSessions.id, id), eq(terminalSessions.userId, session.userId)));

  if (!target) return NextResponse.json({ error: 'Session not found' }, { status: 404 });

  // Kill the real tmux session on the machine so it stops being reported.
  let killed = false;
  let machineOffline = false;
  if (target.tmuxName) {
    const result = await requestKillTmux(target.machineId, target.tmuxName);
    if (result === null) machineOffline = true;
    else killed = result.ok;
  }

  await db
    .update(terminalSessions)
    .set({ isLive: false, endedAt: new Date().toISOString(), exitCode: -1 })
    .where(eq(terminalSessions.id, id));

  return NextResponse.json({ success: true, killed, machineOffline });
}
