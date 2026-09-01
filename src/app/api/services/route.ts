import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { systemServices } from '@/lib/schema';
import { asc, eq } from 'drizzle-orm';
import { getSession, isEnrolled } from '@/lib/auth';

export async function GET() {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    if (!(await isEnrolled(session.userId))) return NextResponse.json({ error: 'Two-factor setup required' }, { status: 403 });

    const services = await db.select().from(systemServices)
      .where(eq(systemServices.machineId, session.machineId))
      .orderBy(asc(systemServices.port));
    return NextResponse.json(services);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    if (!(await isEnrolled(session.userId))) return NextResponse.json({ error: 'Two-factor setup required' }, { status: 403 });

    const body = await request.json();
    const { name, port, description } = body;

    if (!name || !port) {
      return NextResponse.json({ error: 'Name and port are required' }, { status: 400 });
    }

    const [created] = await db
      .insert(systemServices)
      .values({
        machineId: session.machineId,
        name,
        port: parseInt(port),
        description: description || '',
      })
      .returning();

    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
