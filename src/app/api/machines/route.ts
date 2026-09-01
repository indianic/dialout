import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { machines, machineApiKeys } from '@/lib/schema';
import { eq, and, inArray } from 'drizzle-orm';
import { getOnlineMachineIds } from '@/lib/daemon-status';
import { getSession } from '@/lib/auth';

// GET — list all machines for the current user with online/offline status
export async function GET(_request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  // The list is always the session user's. The legacy ?userId= param is
  // ignored on purpose: it was the only input, unauthenticated, so anyone
  // could enumerate any user's machines along with their API key prefix and
  // last-used time.
  const userMachines = await db
    .select()
    .from(machines)
    .where(eq(machines.userId, session.userId));

  const onlineMachineIds = await getOnlineMachineIds();

  // Key metadata for this user's machines only.
  const machineIds = userMachines.map((m) => m.id);
  const allKeys = machineIds.length > 0
    ? await db.select().from(machineApiKeys).where(inArray(machineApiKeys.machineId, machineIds))
    : [];
  const keysByMachine = new Map(allKeys.map((k) => [k.machineId, k]));

  const result = userMachines.map((m) => ({
    ...m,
    hidden: m.hidden || false,
    isOnline: onlineMachineIds.includes(m.id),
    hasApiKey: keysByMachine.has(m.id),
    canCopyKey: !!keysByMachine.get(m.id)?.keyEnc,
    apiKeyPrefix: keysByMachine.get(m.id)?.keyPrefix || null,
    apiKeyLastUsed: keysByMachine.get(m.id)?.lastUsedAt || null,
  }));

  return NextResponse.json(result);
}

// PATCH — update machine terminal settings (name template + preview lines)
export async function PATCH(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  let body: { id?: number; terminalNameTemplate?: string; terminalPreviewLines?: number };
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Bad JSON' }, { status: 400 }); }
  const id = Number(body.id);
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  // Owner scope: only update a machine this user owns.
  const owned = await db.select().from(machines)
    .where(and(eq(machines.id, id), eq(machines.userId, session.userId)));
  if (owned.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const patch: Record<string, unknown> = {};
  if (typeof body.terminalNameTemplate === 'string') patch.terminalNameTemplate = body.terminalNameTemplate.slice(0, 200);
  if (typeof body.terminalPreviewLines === 'number') {
    patch.terminalPreviewLines = Math.max(0, Math.min(5, Math.round(body.terminalPreviewLines)));
  }
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: 'nothing to update' }, { status: 400 });

  await db.update(machines).set(patch).where(eq(machines.id, id));
  return NextResponse.json({ ok: true });
}
