import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { terminalSessions } from '@/lib/schema';
import { eq, isNull, and, inArray } from 'drizzle-orm';
import { getSession } from '@/lib/auth';
import { userOwnsMachine, listOwnedMachines } from '@/lib/machine-access';
import { parseMachineScope } from '@/lib/machine-scope';

// GET — list active terminal sessions. `machineId=all` fans out across
// every owned machine; omitting the param keeps the session's current machine
// so existing web callers do not silently widen.
export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const scope = parseMachineScope(request.nextUrl.searchParams.get('machineId'), session.machineId);

  if (scope === 'all') {
    const owned = await listOwnedMachines(session.userId);
    if (!owned.length) return NextResponse.json([]);
    const ids = owned.map((m) => m.id);
    const names = new Map(owned.map((m) => [m.id, m.name]));
    const activeSessions = await db
      .select()
      .from(terminalSessions)
      .where(
        and(
          eq(terminalSessions.userId, session.userId),
          inArray(terminalSessions.machineId, ids),
          isNull(terminalSessions.endedAt)
        )
      );
    return NextResponse.json(activeSessions.map((row) => ({
      ...row,
      machineName: names.get(row.machineId) || '',
    })));
  }

  if (!(await userOwnsMachine(session.userId, scope))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const activeSessions = await db
    .select()
    .from(terminalSessions)
    .where(
      and(
        eq(terminalSessions.userId, session.userId),
        eq(terminalSessions.machineId, scope),
        isNull(terminalSessions.endedAt)
      )
    );

  return NextResponse.json(activeSessions);
}

// POST — record a new terminal session start
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { machineId, projectId, command, cwd } = await request.json();
  const target = machineId || session.machineId;
  if (!(await userOwnsMachine(session.userId, target))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const [created] = await db
    .insert(terminalSessions)
    .values({
      machineId: target,
      userId: session.userId,
      projectId: projectId || null,
      command: command || '/bin/bash',
      cwd: cwd || '~',
    })
    .returning();

  return NextResponse.json(created, { status: 201 });
}
