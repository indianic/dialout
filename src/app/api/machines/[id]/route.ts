import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
  machines, machineApiKeys, projects, projectMachines, projectNotes, projectTodos,
  projectCommands, projectCredentials, projectShares, shareComments, pendingInvites,
  notifications, systemServices, terminalSessions, terminalChunks,
} from '@/lib/schema';
import { eq, inArray } from 'drizzle-orm';
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

/**
 * DELETE — remove a machine and everything hanging off it.
 *
 * There is no `ON DELETE CASCADE` anywhere in this schema: the foreign keys are
 * plain integer columns, which is what let `projects.machine_id` outlive its
 * machine in the first place. So the cascade is written out here, and the order
 * is the point — children before parents, or the second pass has nothing left
 * to find the orphans by.
 *
 * Reachability, not just direct references. A project belonging to this machine
 * carries notes, todos, commands, credentials, shares, comments and pending
 * invites, and a terminal session carries its recorded chunks. Deleting only the
 * rows with a `machine_id` column would leave every one of those behind with no
 * parent and no way to reach them from the UI — invisible rows that still hold
 * encrypted credentials.
 *
 * Wrapped in a transaction because a half-finished cascade is worse than not
 * starting: it leaves a machine that is gone from the list but whose projects
 * still appear on the dashboard.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { id } = await params;
  const machineId = parseInt(id, 10);
  if (!Number.isInteger(machineId) || machineId <= 0) {
    return NextResponse.json({ error: 'Machine not found' }, { status: 404 });
  }

  const [machine] = await db.select().from(machines).where(eq(machines.id, machineId));
  if (!machine || machine.userId !== session.userId) {
    // 404 rather than 403, so machine ids are not enumerable by status code.
    return NextResponse.json({ error: 'Machine not found' }, { status: 404 });
  }

  // Refuse to delete the last one. An account with no machines has no valid
  // session to re-mint — the JWT carries a machineId — so this would log the
  // user out into a state they cannot log back into.
  const ownedMachines = await db.select({ id: machines.id }).from(machines).where(eq(machines.userId, session.userId));
  if (ownedMachines.length <= 1) {
    return NextResponse.json(
      { error: 'This is your only machine. Add another one before deleting this.' },
      { status: 409 },
    );
  }

  // Deleting the machine you are currently signed in on would invalidate the
  // session mid-request. Make the caller switch first — the UI can offer that,
  // and it is far clearer than a silent logout.
  if (session.machineId === machineId) {
    return NextResponse.json(
      { error: 'You are signed in on this machine. Switch to another one first.' },
      { status: 409 },
    );
  }

  const counts = await db.transaction(async (tx) => {
    // Projects owned by this machine, plus any that merely *map* onto it.
    // The mapping rows go regardless; the projects themselves only go if this
    // machine is their home, because a project shared onto two machines still
    // belongs to the other one.
    const ownedProjects = await tx
      .select({ id: projects.id })
      .from(projects)
      .where(eq(projects.machineId, machineId));
    const projectIds = ownedProjects.map((p) => p.id);

    const sessions = await tx
      .select({ id: terminalSessions.id })
      .from(terminalSessions)
      .where(eq(terminalSessions.machineId, machineId));
    const sessionIds = sessions.map((s) => s.id);

    // Recorded output first — it is keyed on the session, so once the session
    // row is gone there is nothing left to find these by.
    if (sessionIds.length) {
      await tx.delete(terminalChunks).where(inArray(terminalChunks.sessionId, sessionIds));
    }
    await tx.delete(terminalSessions).where(eq(terminalSessions.machineId, machineId));

    if (projectIds.length) {
      // share_comments is keyed on project_id, not on a share row — the thread
      // belongs to the project, and one project can be shared with several
      // people who all comment in the same place.
      await tx.delete(shareComments).where(inArray(shareComments.projectId, projectIds));
      await tx.delete(projectShares).where(inArray(projectShares.projectId, projectIds));
      await tx.delete(pendingInvites).where(inArray(pendingInvites.projectId, projectIds));
      await tx.delete(projectNotes).where(inArray(projectNotes.projectId, projectIds));
      await tx.delete(projectTodos).where(inArray(projectTodos.projectId, projectIds));
      await tx.delete(projectCommands).where(inArray(projectCommands.projectId, projectIds));
      await tx.delete(projectCredentials).where(inArray(projectCredentials.projectId, projectIds));
      await tx.delete(notifications).where(inArray(notifications.projectId, projectIds));
      // Any terminal session belonging to one of these projects but recorded
      // against a *different* machine — a project mapped onto two machines.
      const strays = await tx
        .select({ id: terminalSessions.id })
        .from(terminalSessions)
        .where(inArray(terminalSessions.projectId, projectIds));
      if (strays.length) {
        await tx.delete(terminalChunks).where(inArray(terminalChunks.sessionId, strays.map((s) => s.id)));
        await tx.delete(terminalSessions).where(inArray(terminalSessions.projectId, projectIds));
      }
      await tx.delete(projectMachines).where(inArray(projectMachines.projectId, projectIds));
      await tx.delete(projects).where(inArray(projects.id, projectIds));
    }

    // Mappings onto this machine from projects that live elsewhere.
    await tx.delete(projectMachines).where(eq(projectMachines.machineId, machineId));
    await tx.delete(systemServices).where(eq(systemServices.machineId, machineId));
    await tx.delete(machineApiKeys).where(eq(machineApiKeys.machineId, machineId));
    await tx.delete(machines).where(eq(machines.id, machineId));

    return { projects: projectIds.length, sessions: sessionIds.length };
  });

  return NextResponse.json({ success: true, deleted: counts });
}
