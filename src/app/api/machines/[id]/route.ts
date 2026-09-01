import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { machines } from '@/lib/schema';
import { eq } from 'drizzle-orm';
import { getSession } from '@/lib/auth';

// PATCH — update machine properties (e.g. hidden)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { id } = await params;
  const machineId = parseInt(id, 10);

  // Verify ownership
  const [machine] = await db.select().from(machines).where(eq(machines.id, machineId));
  if (!machine || machine.userId !== session.userId) {
    return NextResponse.json({ error: 'Machine not found' }, { status: 404 });
  }

  const body = await request.json();
  const updates: Record<string, any> = {};

  if (typeof body.hidden === 'boolean') updates.hidden = body.hidden;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
  }

  const [updated] = await db
    .update(machines)
    .set(updates)
    .where(eq(machines.id, machineId))
    .returning();

  return NextResponse.json(updated);
}
