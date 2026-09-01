import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { projects } from '@/lib/schema';
import { and, eq, sql } from 'drizzle-orm';
import { getSession, isEnrolled } from '@/lib/auth';

export async function GET() {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    if (!(await isEnrolled(session.userId))) return NextResponse.json({ error: 'Two-factor setup required' }, { status: 403 });

    // Scoped to the caller's current machine. These counts used to be global,
    // so the response leaked how many projects existed across every user.
    const mine = eq(projects.machineId, session.machineId);
    const countWhere = async (extra?: ReturnType<typeof eq>) => {
      const [row] = await db.select({ c: sql<number>`count(*)` }).from(projects)
        .where(extra ? and(mine, extra) : mine);
      return Number(row.c);
    };

    const total = await countWhere();
    const active = await countWhere(eq(projects.status, 'active'));
    const archived = await countWhere(eq(projects.status, 'archived'));
    const running = await countWhere(eq(projects.isRunning, true));

    return NextResponse.json({
      total,
      active,
      archived,
      running,
      offline: active - running,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
