import { NextRequest, NextResponse } from 'next/server';
import { getSession, isEnrolled } from '@/lib/auth';
import { aiSessionCommand, deleteAiSession } from '@/lib/daemon-status';
import { userOwnsMachine } from '@/lib/machine-access';

const ACTIONS = new Set(['open', 'close', 'input']);

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ machineId: string; tmuxName: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!(await isEnrolled(session.userId))) {
    return NextResponse.json({ error: 'Two-factor enrollment required' }, { status: 403 });
  }

  const { machineId, tmuxName } = await params;
  const targetMachine = parseInt(machineId, 10);
  // This route can type into a live shell, so ownership is checked before
  // anything else is read from the request.
  if (!(await userOwnsMachine(session.userId, targetMachine))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const action = String(body.action || '');
  if (!ACTIONS.has(action)) {
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  }

  const ok = await aiSessionCommand(
    targetMachine, action as 'open' | 'close' | 'input',
    decodeURIComponent(tmuxName), typeof body.text === 'string' ? body.text : undefined
  );
  return NextResponse.json(ok ? { ok: true } : { error: 'Machine offline' },
    { status: ok ? 200 : 503 });
}

// DELETE — remove a launched session from the machine's registry and stop any
// turn still running for it. Only launched sessions can be deleted; a tmux
// session belongs to the user's own terminal and is not DevDash's to end.
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ machineId: string; tmuxName: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!(await isEnrolled(session.userId))) {
    return NextResponse.json({ error: 'Two-factor enrollment required' }, { status: 403 });
  }

  const { machineId, tmuxName } = await params;
  const targetMachine = parseInt(machineId, 10);
  if (!(await userOwnsMachine(session.userId, targetMachine))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const id = decodeURIComponent(tmuxName);
  if (!id.startsWith('launch:')) {
    return NextResponse.json(
      { error: 'Only sessions started by DevDash can be deleted' }, { status: 400 });
  }

  const ok = await deleteAiSession(targetMachine, id);
  return NextResponse.json(ok ? { ok: true } : { error: 'Machine offline' },
    { status: ok ? 200 : 503 });
}
