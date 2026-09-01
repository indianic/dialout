import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { terminalSessions, machines } from '@/lib/schema';
import { and, eq, inArray, isNotNull, sql } from 'drizzle-orm';
import { getSession } from '@/lib/auth';

// A live session's last_seen_at is refreshed on every agent report. The agent
// force-resyncs at least every 60s, so a row not seen within this window is
// orphaned (agent crashed / machine slept / unclean disconnect) and must not be
// shown as live. Guards against stale is_live=true rows the ws-server never got
// to clear.
const STALE_SECONDS = 90;

export async function GET() {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const userMachines = await db.select().from(machines).where(eq(machines.userId, session.userId));
    const machineIds = userMachines.map((m) => m.id);
    if (machineIds.length === 0) return NextResponse.json({ sessions: [] });

    const rows = await db
      .select()
      .from(terminalSessions)
      .where(and(
        inArray(terminalSessions.machineId, machineIds),
        eq(terminalSessions.isLive, true),
        isNotNull(terminalSessions.tmuxName),
        // lastSeenAt is a text column but the ws-server writes it via SQL now(),
        // which postgres stores as "YYYY-MM-DD HH:MM:SS+00" (space-separated) —
        // NOT the ISO 'T'/'Z' form, so a lexical string compare is wrong. Cast to
        // timestamptz and compare as real time. NULL casts to NULL and is excluded
        // (rows that predate the column or haven't been re-reported = stale).
        sql`${terminalSessions.lastSeenAt}::timestamptz >= now() - make_interval(secs => ${STALE_SECONDS})`,
      ));

    return NextResponse.json({
      sessions: rows.map((r) => ({
        id: r.id,
        machineId: r.machineId,
        tmuxName: r.tmuxName,
        termProgram: r.termProgram,
        origin: r.origin,
        isLive: r.isLive,
        startedAt: r.startedAt,
        lastActiveAt: r.lastActiveAt,
        cols: r.cols,
        rows: r.rows,
        folder: r.folder,
        folderPath: r.folderPath,
        createdLocal: r.createdLocal,
        gitBranch: r.gitBranch,
        lastLines: r.lastLines,
      })),
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 });
  }
}
