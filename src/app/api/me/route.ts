import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { getSession } from '@/lib/auth';
import { db } from '@/lib/db';
import { machines } from '@/lib/schema';
import { getOnlineMachineIds } from '@/lib/daemon-status';

// Native session bootstrap. The JWT already carries identity; this round-trips
// it against the DB and lists the caller's machines with live online flags.
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const owned = await db.select().from(machines).where(eq(machines.userId, session.userId));
  const online = await getOnlineMachineIds();

  return NextResponse.json({
    user: { id: session.userId, name: session.name, email: session.email },
    machineId: session.machineId,
    machines: owned.map((m) => ({
      id: m.id,
      name: m.name,
      hidden: m.hidden || false,
      isOnline: online.includes(m.id),
      terminalNameTemplate: m.terminalNameTemplate,
      terminalPreviewLines: m.terminalPreviewLines,
    })),
  });
}
