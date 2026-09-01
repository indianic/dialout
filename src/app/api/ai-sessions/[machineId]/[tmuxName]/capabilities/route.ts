import { NextRequest, NextResponse } from 'next/server';
import { getSession, isEnrolled } from '@/lib/auth';
import { requestAiCapabilities, requestAiSessions } from '@/lib/daemon-status';
import { userOwnsMachine } from '@/lib/machine-access';

export async function GET(
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
  // A caller-supplied machineId is never trusted, exactly as the sibling
  // route does before it types into a live shell.
  if (!(await userOwnsMachine(session.userId, targetMachine))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // kind and cwd come from the live session list, not from the query string:
  // the client must not be able to point discovery at an arbitrary directory.
  const sessions = await requestAiSessions(targetMachine);
  const match = (sessions || []).find(
    (s: any) => s.tmuxName === decodeURIComponent(tmuxName)
  );
  if (!match) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  }

  const caps = await requestAiCapabilities(targetMachine, match.kind, match.folderPath || '');
  if (!caps) {
    // Offline, or an agent that predates the message type. The client shows
    // "update the agent", which is a different sentence from "none found".
    return NextResponse.json({ unavailable: true, commands: [], mcpServers: [] }, { status: 200 });
  }

  return NextResponse.json(caps);
}
