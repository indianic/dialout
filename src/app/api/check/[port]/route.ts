import { NextRequest, NextResponse } from 'next/server';
import { isMachineOnline, requestPortCheck } from '@/lib/daemon-status';
import { getSession } from '@/lib/auth';
import { userOwnsMachine } from '@/lib/machine-access';

export async function GET(request: NextRequest, { params }: { params: Promise<{ port: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { port: portStr } = await params;
  const port = parseInt(portStr);

  if (isNaN(port) || port < 1 || port > 65535) {
    return NextResponse.json({ error: 'Invalid port' }, { status: 400 });
  }

  // Check if a machineId is specified for remote checking
  const machineId = request.nextUrl.searchParams.get('machineId');

  if (machineId) {
    const mid = parseInt(machineId, 10);
    // A machineId is attacker-controlled: without this the endpoint probes
    // ports on any registered machine, not just the caller's.
    if (!(await userOwnsMachine(session.userId, mid))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const online = await isMachineOnline(mid);

    if (!online) {
      return NextResponse.json({ port, running: false, offline: true });
    }

    const result = await requestPortCheck(mid, [port]);
    const running = result ? result.openPorts.includes(port) : false;
    return NextResponse.json({ port, running });
  }

  // No machineId specified — daemon required for remote check
  return NextResponse.json(
    { error: 'daemon_offline', message: 'No machine specified or daemon not connected.' },
    { status: 503 }
  );
}
