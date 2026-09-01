import { eq } from 'drizzle-orm';
import { db } from './db';
import { machines } from './schema';

// Does this user own this machine?
//
// Every AI-session route takes a caller-supplied machineId, and what sits
// behind it is a full conversation transcript plus the ability to type into a
// live shell. Without this check any authenticated user could name any
// machine id and read or drive someone else's session.
//
// Deliberately not modelled on /api/browse, which accepts machineId with no
// ownership check at all. CLAUDE.md calls that out as a pattern not to copy.
export async function userOwnsMachine(userId: number, machineId: number): Promise<boolean> {
  if (!Number.isFinite(machineId) || machineId <= 0) return false;
  const [machine] = await db
    .select({ userId: machines.userId })
    .from(machines)
    .where(eq(machines.id, machineId));
  return !!machine && machine.userId === userId;
}

export async function listOwnedMachines(
  userId: number
): Promise<{ id: number; name: string }[]> {
  return db
    .select({ id: machines.id, name: machines.name })
    .from(machines)
    .where(eq(machines.userId, userId));
}
