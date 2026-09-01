import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { systemServices } from '@/lib/schema';
import { eq } from 'drizzle-orm';
import { getSession } from '@/lib/auth';
import { userOwnsMachine } from '@/lib/machine-access';

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const { id } = await params;
    const serviceId = parseInt(id, 10);
    if (Number.isNaN(serviceId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

    // Resolve to the owning machine first — the row id alone doesn't prove
    // the caller may delete it.
    const [service] = await db.select().from(systemServices).where(eq(systemServices.id, serviceId));
    if (!service || service.machineId == null || !(await userOwnsMachine(session.userId, service.machineId))) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    await db.delete(systemServices).where(eq(systemServices.id, serviceId));
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
