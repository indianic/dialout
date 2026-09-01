import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { notifications } from '@/lib/schema';
import { eq, desc, and } from 'drizzle-orm';
import { getSession, isEnrolled } from '@/lib/auth';

// GET — list notifications for current user
export async function GET() {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    if (!(await isEnrolled(session.userId))) return NextResponse.json({ error: 'Two-factor setup required' }, { status: 403 });

    const all = await db.select().from(notifications)
      .where(eq(notifications.userId, session.userId))
      .orderBy(desc(notifications.createdAt));

    return NextResponse.json(all);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 });
  }
}

// POST — mark as read
export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const { action, notificationId } = await request.json();

    if (action === 'mark-read') {
      await db.update(notifications)
        .set({ isRead: true })
        .where(and(eq(notifications.id, notificationId), eq(notifications.userId, session.userId)));
      return NextResponse.json({ success: true });
    }

    if (action === 'mark-all-read') {
      await db.update(notifications)
        .set({ isRead: true })
        .where(eq(notifications.userId, session.userId));
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 });
  }
}
