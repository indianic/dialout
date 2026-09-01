import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { requestFsBrowse } from '@/lib/daemon-status';
import { userOwnsMachine } from '@/lib/machine-access';

// POST — browse filesystem on a machine via daemon
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { machineId, path } = await request.json();
  const targetMachine = machineId || session.machineId;

  // Behaviour change, deliberate: this route previously relayed a filesystem
  // browse to whatever machine id the caller named. Any signed-in user could
  // therefore read the directory tree of anyone else's machine.
  if (!(await userOwnsMachine(session.userId, targetMachine))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const result = await requestFsBrowse(targetMachine, path || '/');

  if (!result) {
    return NextResponse.json({ error: 'Machine offline' }, { status: 503 });
  }

  return NextResponse.json(result);
}
