import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { userSettings } from '@/lib/schema';
import { eq } from 'drizzle-orm';
import { getSession } from '@/lib/auth';

// GET — get user settings
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const [settings] = await db
    .select()
    .from(userSettings)
    .where(eq(userSettings.userId, session.userId));

  if (!settings) {
    // Return defaults
    return NextResponse.json({
      recordSessions: true,
      retentionDays: 15,
      defaultCommands: '[]',
    });
  }

  return NextResponse.json(settings);
}

// PUT — update user settings
export async function PUT(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const body = await request.json();

  const [existing] = await db
    .select()
    .from(userSettings)
    .where(eq(userSettings.userId, session.userId));

  if (existing) {
    const [updated] = await db
      .update(userSettings)
      .set({
        ...(body.recordSessions !== undefined && { recordSessions: body.recordSessions }),
        ...(body.retentionDays !== undefined && { retentionDays: body.retentionDays }),
        ...(body.defaultCommands !== undefined && { defaultCommands: body.defaultCommands }),
      })
      .where(eq(userSettings.userId, session.userId))
      .returning();
    return NextResponse.json(updated);
  } else {
    const [created] = await db
      .insert(userSettings)
      .values({
        userId: session.userId,
        recordSessions: body.recordSessions ?? true,
        retentionDays: body.retentionDays ?? 15,
        defaultCommands: body.defaultCommands ?? '[]',
      })
      .returning();
    return NextResponse.json(created);
  }
}
