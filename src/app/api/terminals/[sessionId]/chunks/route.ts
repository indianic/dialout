import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { terminalChunks, terminalSessions } from '@/lib/schema';
import { eq, asc, sql } from 'drizzle-orm';
import { getSession } from '@/lib/auth';

// GET — fetch terminal chunks for replay with lazy loading
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { sessionId } = await params;
  const id = parseInt(sessionId, 10);

  // Verify session belongs to this user
  const [termSession] = await db
    .select()
    .from(terminalSessions)
    .where(eq(terminalSessions.id, id));

  if (!termSession || termSession.userId !== session.userId) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  }

  const offset = parseInt(request.nextUrl.searchParams.get('offset') || '0', 10);
  const limit = parseInt(request.nextUrl.searchParams.get('limit') || '500', 10);

  // Get total count
  const [countResult] = await db
    .select({ count: sql<number>`count(*)` })
    .from(terminalChunks)
    .where(eq(terminalChunks.sessionId, id));
  const total = Number(countResult?.count || 0);

  // Get chunks with pagination
  const chunks = await db
    .select()
    .from(terminalChunks)
    .where(eq(terminalChunks.sessionId, id))
    .orderBy(asc(terminalChunks.timestamp))
    .offset(offset)
    .limit(limit);

  return NextResponse.json({
    chunks,
    total,
    offset,
    limit,
    hasMore: offset + chunks.length < total,
    session: {
      id: termSession.id,
      command: termSession.command,
      cwd: termSession.cwd,
      startedAt: termSession.startedAt,
      endedAt: termSession.endedAt,
      exitCode: termSession.exitCode,
    },
  });
}
