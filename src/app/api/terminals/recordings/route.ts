import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { terminalSessions } from '@/lib/schema';
import { eq, and, isNotNull, desc, sql, like } from 'drizzle-orm';
import { getSession } from '@/lib/auth';
import { userOwnsMachine } from '@/lib/machine-access';

// GET — list recorded sessions with pagination, filtering by machine
export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const machineId = request.nextUrl.searchParams.get('machineId');
  const page = parseInt(request.nextUrl.searchParams.get('page') || '0', 10);
  const perPage = parseInt(request.nextUrl.searchParams.get('perPage') || '20', 10);
  const search = request.nextUrl.searchParams.get('search') || '';

  const targetMachine = machineId ? parseInt(machineId, 10) : null;
  if (targetMachine && !(await userOwnsMachine(session.userId, targetMachine))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Build where conditions
  const conditions = [
    eq(terminalSessions.userId, session.userId),
    isNotNull(terminalSessions.endedAt),
  ];
  if (targetMachine) {
    conditions.push(eq(terminalSessions.machineId, targetMachine));
  }
  if (search) {
    conditions.push(like(terminalSessions.command, `%${search}%`));
  }

  // Get total count
  const [countResult] = await db
    .select({ count: sql<number>`count(*)` })
    .from(terminalSessions)
    .where(and(...conditions));
  const total = Number(countResult?.count || 0);

  // Get paginated results
  const recordings = await db
    .select()
    .from(terminalSessions)
    .where(and(...conditions))
    .orderBy(desc(terminalSessions.startedAt))
    .offset(page * perPage)
    .limit(perPage);

  return NextResponse.json({
    recordings,
    total,
    page,
    perPage,
    totalPages: Math.ceil(total / perPage),
  });
}
